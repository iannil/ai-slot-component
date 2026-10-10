# AI-SLOT 可靠局部交付 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使live断线可恢复，并隔离卸载旧请求及支持DOM命名槽位。

**Architecture:** 继续fetch SSE协议；连接成功时重新读取当前树，通知只作加速而不作唯一真相。只增加运行时恢复逻辑与DOM挂载映射，保留已有负载结构。

**Tech Stack:** TypeScript、Vitest fake timers、jsdom、Playwright。

**Spec:** [后续交付设计](../specs/2026-10-10-ai-slot-next-delivery-design.md)

## Global Constraints

- 文档与新增注释使用中文；既有英文用户文案按双语约定维护。
- 核心 SDK 保持 Node >= 18，不增加运行时依赖；新管理参考服务使用 Node >= 22，仅单进程、本地磁盘。
- AI 只提交结构化组件树 JSON；所有新交付路径校验注册表；不执行 AI 生成的 HTML/CSS/JS。
- CMS 是事实源，宿主拥有页面，AI-SLOT 仅管理授权槽位；首期只读数据源，不做双向同步。
- 保留原始兜底与 createAiRenderHandler 兼容；新管理服务为可选包，不替换现有公开 GET 数据入口。
- 正式站点沿用 aislot.dev；Git 主分支是 master，Cloudflare Pages 项目 aislot 的生产标识是 main。
- 不引入多租户、计费、通用调度、多实例存储或全平台插件矩阵；新包先 private，不随首轮 npm 发布。
- 官网公开文档 MCP 不增加写权限；管理 MCP 首期仅本地 stdio，远程 MCP 认证另立设计。
- 客户尚未落实；模拟数据、协议测试和自有测试站不能记作真实客户、付费或节省劳动证据。

---


## 文件职责

- `packages/runtime/src/live.ts`、`live.test.ts`：连接循环、退避、读流、取消。
- `packages/runtime/src/ai-slot.ts`、新 `ai-slot-lifecycle.test.ts`：挂载代次与loadSeq。
- `packages/adapter-dom/src/dom-renderer.ts`、`dom-renderer.test.ts`：命名槽位显式映射。
- `packages/runtime/README.md`、`packages/adapter-dom/README.md`：重连与映射契约。
- 新 `examples/plain-html/e2e/reconnect.spec.ts`：真实浏览器网络恢复。

### Task 1: SSE重连与读流取消

**Interfaces:** 保持 `subscribeInvalidation(opts):{close():void}`；Options新增 `onConnect?:()=>void`、`random?:()=>number`（测试注入）。失败最少500ms，指数上限30s，抖动0.5–1倍；连续连接稳定30s或接收到有效invalidate帧才重置失败次数。idle watchdog 60s（现有服务heartbeat25s）；缓冲上限64KiB。

- [ ] 在live.test.ts新增失败用例：

```ts
it('重连成功重新核对且close取消后续重试', async () => {
  vi.useFakeTimers();
  const onConnect=vi.fn();
  const fetchImpl=vi.fn()
    .mockRejectedValueOnce(new Error('断线'))
    .mockResolvedValue(new Response(new ReadableStream({start(){}})));
  const sub=subscribeInvalidation({src:'/events',slot:'hero',onInvalidate:vi.fn(),
    onConnect,random:()=>0,fetchImpl});
  await vi.advanceTimersByTimeAsync(499);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(onConnect).toHaveBeenCalledTimes(1);
  sub.close();
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
```

- [ ] `pnpm --filter @ai-slot/runtime test -- src/live.test.ts`，预期新Options/重连断言失败。
- [ ] live.ts改为一次只运行一个attempt的循环；以下是必须采用的取消/计时骨架（现有SSE分帧逻辑放进标明的处理函数，而不是另建协议）。每轮新的AbortController和reader；close同时abort与reader.cancel并唤醒退避。read使用Promise.race的abort分支，避免不遵守signal的自定义流永久挂起。

```ts
// live.ts内部辅助函数，非新公开API
function abortable<T>(work:Promise<T>, signal:AbortSignal):Promise<T> {
  return new Promise((resolve,reject)=>{
    const stop=()=>reject(new Error('aborted'));
    if(signal.aborted){stop();return;}
    signal.addEventListener('abort',stop,{once:true});
    work.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));
  });
}
function retryDelay(failures:number,random:()=>number):number {
  return Math.floor(Math.min(30000,1000*2**Math.min(failures,5))*(0.5+0.5*random()));
}
function consumeFrames(buffer:string,slot:string,notify:()=>void):string {
  const frames=buffer.replace(/\r\n/g,'\n').split('\n\n');
  const rest=frames.pop()??'';
  for(const frame of frames){
    const event=frame.match(/^event: ?(.+)$/m)?.[1];
    const raw=frame.split('\n').filter(x=>x.startsWith('data:'))
      .map(x=>x.slice(5).replace(/^ /,'')).join('\n');
    if(event!=='invalidate'||!raw)continue;
    try{if(JSON.parse(raw).slot===slot)notify();}catch{}
  }
  return rest;
}
```

在 `subscribeInvalidation` 内变量为 `closed=false, failures=0, currentController, currentReader, timer, wake`。执行 `while(!closed)`：记录started；fetch使用accept与signal（8s握手定时器）；2xx/body存在后清握手timer，安全调用onConnect（观察回调抛错不破坏循环）；read每次置60s timer，超时abort；收到chunk先清timer、decode追加、若缓冲超过65536先抛错、再消费完整帧；EOF作为可重试断开。finally清timer、abort、cancel reader；reader取消不等待未决外部实现。若closed退出；稳定30s则failures=0；`await new Promise(resolve=>{wake=resolve;timer=setTimeout(resolve,retryDelay(failures++,random));})`；close清timer并wake。请求成功不能立即重置退避，避免服务器立即断开造成密集循环。

- [ ] 补充下列真实行为断言到同一文件，每行一个it；测试用fake timers与实际ReadableStream，不只断言私有helper：EOF重试；连续EOF退避500/1000/2000ms；握手超时；60s无字节重试；close在fetch等待/reader等待/退避时不重连；跨chunk CRLF；损坏帧后好帧仍有效；其他slot不触发；大缓冲受控重连；onConnect抛错不停止读取。现有所有订阅测试保存sub并afterEach close，防止新增重试timer泄漏。
- [ ] 单包测试与build/typecheck通过，README明确“连接建立主动核对，不保证所有访客同时生效”；提交 `feat: 为失效订阅增加可取消重连与补偿读取`。

### Task 2: 元素卸载与重新挂载隔离

**Interfaces:** Consumes Task1 `onConnect`；Produces 原AiSlotElement公开API不变；增加私有 `mountSeq`。
**Files:** Modify `ai-slot.ts`；Create `ai-slot-lifecycle.test.ts`。

- [ ] 新测试真实注册dom renderer，将首个fetch保持pending，remove元素、重新append，再返回旧树，断言旧树不出现；在下一次load的fetch resolve后断言新树出现。并验证同实例重挂载只保留原始fallback、每次挂载仅一个live订阅与interval。

实际测试使用Node18兼容helper：

```ts
function deferred<T>() {
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(r=>{resolve=r;});
  return {promise,resolve};
}
```

- [ ] 运行新测试，确认旧请求仍可能在重新挂载后落地的失败。
- [ ] 在connectedCallback入口 `const mount=++this.mountSeq`；queueMicrotask条件改为 `if (!this.isConnected || mount!==this.mountSeq) return`；disconnectedCallback入口执行 `this.mountSeq++; this.loadSeq++;`，随后现有计时器/订阅关闭。
- [ ] mountLive选项增加 `onConnect:()=>void this.load()`；load最后写入与骨架.then写入同时要求 `this.isConnected` 和原有seq检查。保留当前失败内容策略，不通过移除所有检查简化。
- [ ] `pnpm --filter @ai-slot/runtime test`、build/typecheck；README补“卸载时忽略在途结果，重新挂载重新核对”；提交 `fix: 隔离卸载和重新挂载期间的异步结果`。

### Task 3: DOM命名槽位与浏览器故障验收

**Interfaces:** `DomComponentDef.slotTargets?:Record<string,(el:HTMLElement)=>HTMLElement>`；不存在映射/非自身后代挂载点时抛Error，由runtime保留兜底。默认childrenTarget契约不变。
**Files:** dom-renderer.ts/test、adapter-dom README、新e2e/reconnect.spec.ts。

- [ ] 新测试：有header/body映射则各自文本落位；未定义header映射时 `await expect(renderTree(...)).rejects.toThrow('unsupported_slot:header')`；映射返回外部节点也拒绝。
- [ ] 运行adapter-dom测试预期红；在默认children处理后增加：

```ts
for (const [name,nodes] of Object.entries(ctx.slots)) {
  const getTarget=Object.hasOwn(def.slotTargets??{},name)?def.slotTargets?.[name]:undefined;
  if(!getTarget) throw new Error(`unsupported_slot:${name}`);
  const namedTarget=getTarget(el);
  if(namedTarget!==el && !el.contains(namedTarget)) throw new Error(`invalid_slot_target:${name}`);
  for(const child of nodes) namedTarget.appendChild(child);
}
```

文档示例由applyProps创建header和main元素，slotTargets返回querySelector对应元素；不得用AI字符串拼innerHTML。

- [ ] 浏览器e2e使用本地真实server、`shop.html` live槽位，记录初始树后切context offline；服务端通过既有admin/publish改变源，恢复online，不再额外发送通知；断言槽位更新且#外部节点标记不变。测试从页面读取当前hero标题并断言变更，且network等待retry而非任意sleep。在finally恢复online/关page；期望15s内完成正常重连，watchdog故障另在fake timer测试覆盖。
- [ ] 执行 `pnpm build && pnpm test && pnpm typecheck` 与全量示例e2e（默认4173占用时临时独立端口，配置随后删除）。官网demo同样用live，补验证换行业后没有旧流回调；不更改包版本、不自动发布本阶段。
- [ ] 提交 `feat: 支持DOM命名槽位并验证断线恢复`。

## 自审

Task1产生onConnect→Task2消费；Task3新增slotTargets不破坏children。没有把EOF成功当稳定连接，也没有把卸载仅isConnected检查误当代次隔离。原计划中的注册表缺省兼容保持，新参考模板显式传registry。
