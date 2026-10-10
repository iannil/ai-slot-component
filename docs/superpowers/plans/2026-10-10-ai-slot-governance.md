# AI-SLOT 审批发布与回滚 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在operations中实现草稿到批准发布的受控生命周期。

**Architecture:** 所有写动作经权限/事实策略后在Store事务内提交；预览绑定不可变产物。回滚是新的受审草稿和发布记录，公开交付不读取草稿。

**Tech Stack:** V的Node/TypeScript/Vitest与现有registry校验器。

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


## 文件职责与唯一API

Create `packages/operations/src/policy.ts`、`drafts.ts`、`publishing.ts`、`delivery.ts`、`operations.ts`及对应.test.ts；Modify index.ts/README.md。Create `src/test-fixture.ts` 供本包测试（不从index导出）。不把全部逻辑塞进HTTP handler。

```ts
// operations.ts导出的接口；使用V types.ts定义的全部类型。
interface DraftInput {slotId:string;tree:unknown;baseRevision:number;sourceVersion:string}
interface PublishInput {draftId:string;artifactHash:string;expectedRevision:number;idempotencyKey:string}
interface Operations {
 listSlots(actor:Principal):Promise<string[]>;
 readSlot(actor:Principal,slotId:string):Promise<{pointer:Receipt|null;drafts:Draft[]}>;
 createDraft(actor:Principal,input:DraftInput):Promise<Draft>;
 previewDraft(actor:Principal,draftId:string):Promise<{draft:Draft;artifact:Artifact;previous:Artifact|null}>;
 approveDraft(actor:Principal,input:{draftId:string;artifactHash:string;expiresAt:number}):Promise<Approval>;
 publishDraft(actor:Principal,input:PublishInput):Promise<Receipt>;
 prepareRollback(actor:Principal,input:{slotId:string;targetRevision:number;expectedRevision:number}):Promise<Draft>;
 rollbackSlot(actor:Principal,input:PublishInput):Promise<Receipt>;
 getStatus(actor:Principal,slotId:string):Promise<{desiredRevision:number;readableRevision:number|null;browserObservation:null}>;
 deliver(slotId:string):Promise<Response>;
}
// 工厂
function createOperations(store:Store,env:Environment):Operations;
```

drafts.ts导出createDraft/previewDraft/approveDraft/prepareRollback的实现函数，参数前缀 `(store,env,actor,input)`；publishing.ts导出 `commitDraft(store,env,actor,input,action)`；delivery.ts导出 `deliver(store,env,slotId)`、`getStatus(store,env,actor,slotId)`；operations.ts仅组装闭包并导出types。任何适配器只能调用Operations。

### Task 1: 权限、结构与事实策略

**Interfaces:** `authorize(actor:Principal,slotId:string,action:Action):void`；`validateArtifact(env,slotId,tree,source):ComponentNode`；错误均OperationError(code)。
**Files:** policy.ts/policy.test.ts/test-fixture.ts，index.ts导出authorize供参考服务测试使用。

- [ ] fixture固定注册card组件（title/link/price必填，全部string），source `{id:'cms',version:'s1',expiresAt:20000,data:{price:'¥99'}}`，时钟now=1000；policy允许card、price绑定source.price、link仅https://example.com；owner grants全部动作，agent仅read/draft/publish/rollback。fixture中的事实版本可由测试显式变更。
- [ ] 写并运行失败测试：

```ts
it.each(['javascript:alert(1)','https://evil.test/offer','https://user:pass@example.com/'])('拒绝链接 %s',link=>{
 const {env,source}=policyFixture();
 expect(()=>validateArtifact(env,'hero',{component:'card',props:{title:'Hi',price:'¥99',link}},source)).toThrow('url_denied');
});
it('缺失必填props与改写事实被拒绝',()=>{
 const {env,source}=policyFixture();
 expect(()=>validateArtifact(env,'hero',{component:'card'},source)).toThrow();
 expect(()=>validateArtifact(env,'hero',{component:'card',props:{title:'Hi',price:'¥1',link:'https://example.com/'}},source)).toThrow('locked_prop');
});
```

- [ ] authorize使用Object.hasOwn和includes；未知slot/不足权限抛forbidden，不能以空grants默认管理员。validateArtifact先canonical转换快照（拒绝循环/非JSON），检查64KiB树上限，逐节点补缺省props={}再调用validateComponentTree；补props是为正确检查既有validator在props缺失时可能跳过required的边界。仅在**新治理路径**内规范化，不偷偷改变旧SDK兼容行为。

```ts
export function authorize(actor:Principal,slotId:string,action:Action):void {
 if(!Object.hasOwn(actor.grants,slotId)||!actor.grants[slotId].includes(action))
  throw new OperationError('forbidden');
}
// 结构检查后按递归遍历每个node执行：
if(!policy.allowedComponents.includes(node.component))throw new OperationError('component_denied');
for(const rule of policy.lockedProps.filter(x=>x.component===node.component)){
 if(!Object.hasOwn(source.data,rule.sourceField)||
 canonical(node.props?.[rule.prop])!==canonical(source.data[rule.sourceField]))
  throw new OperationError('locked_prop');
}
for(const rule of policy.urlProps.filter(x=>x.component===node.component)){
 const value=node.props?.[rule.prop];
 let url:URL;
 try {url=new URL(String(value));}catch{throw new OperationError('url_denied');}
 if(url.protocol!=='https:'||url.username||url.password||!policy.allowedOrigins.includes(url.origin))
  throw new OperationError('url_denied');
}
```

锁定缺失值在canonical之前显式检查，避免抛原始non_json而非locked_prop。source.id/version非空，expiresAt>env.now，否则source_invalid/expired。遍历包含children和所有slots；深度/节点由registry校验限制；字段锁不能只检查root。
- [ ] 覆盖未知组件、嵌套锁、缺字段、过期源、空version、恶意链接、无权限slot；`pnpm --filter @ai-slot/operations test`后提交 `feat: 校验槽位权限和来源事实约束`。

### Task 2: 不可变草稿、预览和人工批准

**Files:** drafts.ts、drafts.test.ts、operations.ts/index.ts；test-fixture.ts增加真实临时Store。
**Interfaces:** 上方DraftInput与Operations前五项；`artifact.hash=hash(payload)`，payload含slot/tree/sourceVersion/registryVersion/rendererVersion/expiresAt。

- [ ] test-fixture导出 `makeFixture():Promise<{store,env,owner,agent,ops,source,setSource,cleanup}>`；store来自V真实临时目录；env.notify=vi.fn；setSource替换读源快照。测试文件导入如下：

```ts
it('预览与批准绑定同一不可变内容',async()=>{
 const f=await makeFixture();
 try {
  const draft=await f.ops.createDraft(f.agent,{slotId:'hero',tree:card('A'),baseRevision:0,sourceVersion:'s1'});
  const preview=await f.ops.previewDraft(f.owner,draft.id);
  expect(preview.artifact.hash).toBe(draft.artifactHash);
  await expect(f.ops.approveDraft(f.agent,{draftId:draft.id,artifactHash:draft.artifactHash,expiresAt:5000})).rejects.toThrow('forbidden');
  await expect(f.ops.approveDraft(f.owner,{draftId:draft.id,artifactHash:'0'.repeat(64),expiresAt:5000})).rejects.toThrow('hash_mismatch');
  await f.ops.approveDraft(f.owner,{draftId:draft.id,artifactHash:draft.artifactHash,expiresAt:5000});
  expect((await f.store.read()).approvals[draft.id].approvedBy).toBe('owner');
 } finally {await f.cleanup();}
});
```

card(title)定义在fixture，返回card节点、price='¥99'、link='https://example.com/'，不使用不存在的builder。
- [ ] 运行drafts.test.ts红；createDraft在transact内authorize draft，查policy，baseRevision必须等于pointer.revision或0，await env.readSource（由后续M客户端8s超时），版本必须等于input.sourceVersion；调用policy；构造artifact与randomUUID draft，写入两张表，既有同hashartifact直接复用，禁止覆盖异内容。值全部clone，输出Draft。
- [ ] previewDraft读状态→查draft→authorize read→返回draft、artifact及baseRevision对应的历史artifact（找不到时null）；不得隐式approve/渲染任意HTML。预览的previous应绑定draft创建时基线，不用当前已变化的线上版误导差异。
- [ ] approveDraft在transact内authorize approve，核对draft/hash/base与当前revision、重读source/校验当前registry+renderer，expiresAt必须 `now < expiresAt <= min(now+15min,artifact.expiresAt)`，创建Approval。批准不更改pointer。来源或契约改变拒绝，不能静默将新来源套在旧树上。
- [ ] 测试批准后修改输入原对象不影响artifact；source s2使旧草稿不能批准；非法tree不写任何draft；并发发布改变base后批准失败；草稿始终不可公开读取。测试通过后提交 `feat: 增加不可变草稿预览与人工批准`。

### Task 3: CAS发布、幂等与受审回滚

**Files:** publishing.ts/publishing.test.ts；drafts.ts新增prepareRollback；operations.ts组合API。
**Interfaces:** PublishInput；Receipt不包含“访客已看见”。

- [ ] 新失败测试使用Task2fixture：

```ts
it('相同请求重试只创建一条发布，异参同key被拒绝',async()=>{
 const f=await makeFixture();
 try{
  const draft=await f.ops.createDraft(f.agent,{slotId:'hero',tree:card('A'),baseRevision:0,sourceVersion:'s1'});
  await f.ops.approveDraft(f.owner,{draftId:draft.id,artifactHash:draft.artifactHash,expiresAt:5000});
  const input={draftId:draft.id,artifactHash:draft.artifactHash,expectedRevision:0,idempotencyKey:'request-1'};
  const first=await f.ops.publishDraft(f.agent,input);
  expect(await f.ops.publishDraft(f.agent,input)).toEqual(first);
  await expect(f.ops.publishDraft(f.agent,{...input,expectedRevision:1})).rejects.toThrow('idempotency_conflict');
  expect((await f.store.read()).releases).toHaveLength(1);
 }finally{await f.cleanup();}
});
```

- [ ] 实现 `commitDraft`。在事务内按如下骨架，辅助校验全部复用policy而不是复制：

```ts
const result=await store.transact(async state=>{
 const draft=state.drafts[input.draftId];
 if(!draft)throw new OperationError('not_found');
 authorize(actor,draft.slotId,action);
 if(draft.intent!==action)throw new OperationError('wrong_action');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(input.idempotencyKey))throw new OperationError('invalid_key');
 const key=hash([actor.id,draft.slotId,action,input.idempotencyKey]);
 const fingerprint=hash(input);
 const previous=state.idempotency[key];
 if(previous){if(previous.fingerprint!==fingerprint)throw new OperationError('idempotency_conflict');return previous.receipt;}
 await assertPublishable(state,env,draft,input);
 const revision=(state.pointers[draft.slotId]?.revision??0)+1;
 const receipt={slotId:draft.slotId,revision,artifactHash:draft.artifactHash};
 state.releases.push({...receipt,draftId:draft.id,actor:actor.id,action,at:env.now()});
 state.pointers[draft.slotId]=receipt;
 state.idempotency[key]={fingerprint,receipt};
 return receipt;
});
try{await env.notify(result.slotId);}catch{/* 提交已完成；重连读当前版本补偿通知失败 */}
return result;
```

实现 `assertPublishable(state,env,draft,input):Promise<void>`（publishing.ts私有）：审批hash===input.artifactHash===draft.artifactHash；approval.baseRevision===draft.baseRevision===input.expectedRevision===current；approval未过期；policy版本与artifact相同；sourceVersion===artifact.sourceVersion；validateArtifact(env,...当前source)；任何不满足抛具名OperationError。幂等重试必须先查旧结果，但authorize仍先执行。env.notify需由M提供有界实现，不能让通知挂起吞掉发布成功响应。

核心检查函数内容（types来自V，PublishInput在本计划首段定义；validateArtifact来自Task1）：

```ts
async function assertPublishable(state:State,env:Environment,draft:Draft,input:PublishInput):Promise<void>{
 const artifact=state.artifacts[draft.artifactHash];
 const approval=state.approvals[draft.id];
 if(!artifact||!approval)throw new OperationError('approval_required');
 if(input.artifactHash!==artifact.hash||approval.artifactHash!==artifact.hash)throw new OperationError('hash_mismatch');
 const current=state.pointers[draft.slotId]?.revision??0;
 if(current!==input.expectedRevision||current!==draft.baseRevision||current!==approval.baseRevision)throw new OperationError('conflict');
 if(approval.expiresAt<=env.now())throw new OperationError('approval_expired');
 if(!Object.hasOwn(env.policies,draft.slotId))throw new OperationError('not_found');
 const policy=env.policies[draft.slotId];
 if(artifact.registryVersion!==policy.registryVersion||artifact.rendererVersion!==policy.rendererVersion)throw new OperationError('contract_changed');
 const source=await env.readSource(draft.slotId);
 if(source.version!==artifact.sourceVersion)throw new OperationError('source_changed');
 validateArtifact(env,draft.slotId,artifact.tree,source);
 if(artifact.expiresAt<=env.now())throw new OperationError('expired');
}
```

- [ ] prepareRollback验证rollback权限、expectedRevision，查指定slot目标revision的release；取历史artifact并重读source/当前契约。只有仍有效且版本匹配时建立新Draft（intent='rollback', baseRevision=当前revision, 新id，artifactHash复用）；没有审批即不能调用rollbackSlot。不存在targetRevision→not_found。禁止把pointer直接指向旧revision。
- [ ] 测试两个并发发布同base仅一个成功；重启后的幂等重试只返原receipt；授权撤销后重试forbidden；通知失败仍有新pointer；过期批准、源改变、rendererVersion改变均不发布；正常rollback到新revision且历史保留；过期旧源rollback拒绝。通过后提交 `feat: 实现幂等发布与受审版本回滚`。

### Task 4: 公开投递与状态证据

**Files:** delivery.ts/delivery.test.ts、operations.ts/index.ts、README。
**Interfaces:** `deliver(slotId)`返回version1 Response，成功meta包含revision/artifactHash/sourceVersion；Cache-Control:no-store。`getStatus` desired/readable/browserObservation字段固定。

- [ ] 写测试：有draft无发布deliver=503；发布后tree/hash精确一致；source过期/源失败=503；当前source改变为s2旧版不可读；状态desiredRevision保留但readableRevision=null；未知slot404；不返回审批人、源凭据、draft正文。
- [ ] 实现成功响应与错误映射：

```ts
return new Response(JSON.stringify({version:1,slot:slotId,tree:artifact.tree,
 meta:{revision:pointer.revision,artifactHash:artifact.hash,sourceVersion:artifact.sourceVersion}}),
 {headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
// 源/契约校验失败
return new Response(JSON.stringify({error:'ai_unavailable'}),{status:503,headers:{'cache-control':'no-store'}});
```

读取时再次validateArtifact，不通过则不交付；env.readSource发生在公开交付前，源故障不能stale复活旧活动。getStatus先authorize read，调用同样的可读性判定；browserObservation固定null，不能拿接口200填充浏览器成功。
- [ ] 完成listSlots（只列有read grant且policy存在的slot）与readSlot（只返回本slot pointer和drafts，不跨slot列表）。README给出create→preview→approve→publish→deliver→prepareRollback→approve→rollback完整顺序。
- [ ] `pnpm build && pnpm test && pnpm typecheck`；提交 `feat: 交付已发布产物并区分发布与可读状态`。

## 自审

V类型全部被复用；回滚必有新Draft/Approval/Release；read不引发写入。外部源与文件事务无法跨系统原子锁定，承诺是发布校验时重读源及每次交付再核对，不承诺外部源在校验后永不变化。当前是单站点参考实现，不支持任意事实语义验证或金融促销自动审批。
