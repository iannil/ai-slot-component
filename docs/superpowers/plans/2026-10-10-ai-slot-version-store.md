# AI-SLOT 持久版本存储 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增可独立测试的operations领域类型与单写者持久状态。

**Architecture:** 状态快照原子提交，产物/草稿/批准/发布指针/审计/幂等同一次事务。持久层不知MCP或HTTP，接口由G消费；文件锁防双进程，不做自动抢锁。

**Tech Stack:** Node>=22 fs/crypto、TypeScript、Vitest；仅依赖现有registry。

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

新包 `packages/operations`：package.json/tsconfig.json/vitest.config.ts；src/types.ts（跨任务契约）、canonical.ts（快照/hash）、state.ts（空状态与加载校验）、file-store.ts（持久化/互斥）、index.ts（导出）；同名.test.ts；README.md（单进程限制与恢复）。各文件保持单一职责。暂不放发布策略到file-store。

### Task 1: 类型与不可变产物hash

**Files:** 新包配置、types.ts/canonical.ts/canonical.test.ts/index.ts。
**Interfaces:** 以下类型为V/G/M/I统一契约；其他计划不得另造sourceVersion或revision字段名。

- [ ] 创建package配置，版本0.0.0且private，不进入R发布。tsconfig继承根、include src；vitest为node并alias registry到../registry/src/index.ts。脚本与现有包一致，test不允许passWithNoTests。

```json
{"name":"@ai-slot/operations","version":"0.0.0","private":true,"type":"module","engines":{"node":">=22"},"exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"}},"scripts":{"build":"tsup src/index.ts --format esm --dts --clean","test":"vitest run","typecheck":"tsc --noEmit"},"dependencies":{"@ai-slot/registry":"workspace:*"},"devDependencies":{"@types/node":"^22.0.0","tsup":"^8.3.0","typescript":"^5.6.0","vitest":"^2.1.0"}}
```

- [ ] types.ts写入完整契约：

```ts
import type { ComponentNode,Registry } from '@ai-slot/registry';
export type Action='read'|'draft'|'approve'|'publish'|'rollback';
export interface Principal {id:string; grants:Record<string,Action[]>}
export interface Source {id:string;version:string;expiresAt:number;data:Record<string,unknown>}
export interface SlotPolicy {
 slotId:string;registryVersion:string;rendererVersion:string;sourceId:string;
 allowedComponents:string[];lockedProps:{component:string;prop:string;sourceField:string}[];
 urlProps:{component:string;prop:string}[];allowedOrigins:string[];
}
export interface Artifact {
 hash:string;slotId:string;tree:ComponentNode;sourceVersion:string;
 registryVersion:string;rendererVersion:string;expiresAt:number;
}
export interface Draft {
 id:string;artifactHash:string;slotId:string;baseRevision:number;createdBy:string;
 intent:'publish'|'rollback';createdAt:number;
}
export interface Approval {draftId:string;artifactHash:string;baseRevision:number;approvedBy:string;expiresAt:number}
export interface Release {
 slotId:string;revision:number;artifactHash:string;draftId:string;actor:string;
 action:'publish'|'rollback';at:number;
}
export interface Receipt {revision:number;artifactHash:string;slotId:string}
export interface State {
 format:1;artifacts:Record<string,Artifact>;drafts:Record<string,Draft>;
 approvals:Record<string,Approval>;releases:Release[];pointers:Record<string,Receipt>;
 idempotency:Record<string,{fingerprint:string;receipt:Receipt}>;
}
export interface Store {
 read():Promise<State>;
 transact<T>(change:(state:State)=>T|Promise<T>):Promise<T>;
 close():Promise<void>;
}
export interface Environment {
 registry:Registry;policies:Record<string,SlotPolicy>;
 readSource:(slotId:string)=>Promise<Source>;
 now:()=>number;notify:(slotId:string)=>void|Promise<void>;
}
export class OperationError extends Error {
 constructor(public code:string){super(code);}
}
```

- [ ] canonical.test.ts编写行为测试，运行应因模块缺失失败：

```ts
import {expect,it} from 'vitest';
import {canonical,hash} from './canonical.js';
it('键顺序不影响hash，数组顺序影响hash，拒绝非JSON',()=>{
 expect(hash({b:2,a:1})).toBe(hash({a:1,b:2}));
 expect(hash([1,2])).not.toBe(hash([2,1]));
 expect(()=>canonical({x:undefined})).toThrow();
 expect(()=>canonical({x:NaN})).toThrow();
 const cyclic:Record<string,unknown>={};cyclic.self=cyclic;
 expect(()=>canonical(cyclic)).toThrow();
});
```

- [ ] 实现canonical.ts：

```ts
import {createHash} from 'node:crypto';
export function canonical(value:unknown):string {
 const active=new Set<object>();
 function visit(v:unknown):string {
  if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
  if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
  if(typeof v!=='object'||v===null)throw Error('non_json');
  if(active.has(v))throw Error('cycle');
  if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw Error('non_plain');
  active.add(v);
  try {
   if(Array.isArray(v))return '['+Array.from(v,x=>visit(x)).join(',')+']';
   return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+visit((v as Record<string,unknown>)[k])).join(',')+'}';
  } finally {active.delete(v);}
 }
 return visit(value);
}
export const hash=(v:unknown):string=>createHash('sha256').update(canonical(v)).digest('hex');
```

`index.ts`导出types/canonical。安装并提交workspace lock；运行单包test/build/typecheck；提交 `feat: 定义槽位版本与发布领域契约`。

### Task 2: 原子事务与启动完整性

**Files:** state.ts、state.test.ts、file-store.ts、file-store.test.ts、index.ts、README。
**Interfaces:** `openFileStore(directory:string):Promise<Store>`；`emptyState():State`；`assertState(input:unknown):asserts input is State`。状态容量上限64*1024*1024 bytes，release总数<=1000。

- [ ] 创建空状态函数与失败测试：

```ts
export function emptyState():State {
 return {format:1,artifacts:{},drafts:{},approvals:{},releases:[],pointers:{},idempotency:{}};
}
// file-store.test.ts使用mkdtemp与finally close/rm；root来自node:os tmpdir。
it('完整事务可重启，第二写者拒绝',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'slot-store-'));
 const store=await openFileStore(dir);
 try {
  await expect(openFileStore(dir)).rejects.toThrow();
  const result=await store.transact(s=>{expect(s.format).toBe(1);return 'ok';});
  expect(result).toBe('ok');
 } finally {await store.close();}
 const restored=await openFileStore(dir);
 expect(await restored.read()).toEqual(emptyState());
 await restored.close();await rm(dir,{recursive:true,force:true});
});
```

测试文件显式导入Vitest、fs/promises mkdtemp/rm、path join、os tmpdir及被测函数。另以deferred阻塞第一transact，第二排队，断言第二读取第一结果；不要用sleep制造并发。

- [ ] `pnpm --filter @ai-slot/operations test`预期openFileStore未定义。
- [ ] 在state.ts实现结构与引用校验。必须检查以下条件；用一个校验失败函数 `throw new OperationError('corrupt_state')`，不用 `as State` 跳过实际验证：format===1；六个集合均为对象/数组；所有字符串非空且<=200、hash64位hex、revision非负安全整数/发布revision>=1、时间有限；artifact键等于hash，hash等于剔除hash字段后的canonical摘要；draft指向存在且同slot的artifact；approval指向对应draft且hash/base一致；release关联同slot draft/artifact，逐slot revision从1严格递增；pointer等于最后release；idempotency receipt必须指向真实release，fingerprint64hex。未知对象原型键不沿原型链读取，用Object.hasOwn。没有release的空状态合法。

关键引用代码：

```ts
for(const [key,a] of Object.entries(state.artifacts)) {
 const {hash:stored,...payload}=a;
 if(key!==stored||stored!==hash(payload))fail();
}
const last=new Map<string,Release>();
for(const release of state.releases){
 if(release.revision!==(last.get(release.slotId)?.revision??0)+1)fail();
 last.set(release.slotId,release);
}
for(const [slot,p] of Object.entries(state.pointers)){
 const r=last.get(slot);
 if(!r||p.slotId!==slot||p.revision!==r.revision||p.artifactHash!==r.artifactHash)fail();
}
if(last.size!==Object.keys(state.pointers).length)fail();
```

- [ ] file-store.ts实现事务，核心落盘函数必须包含下列顺序；temp与state在同目录。系统注入点 `fault?: (phase:'beforeRename'|'afterRename')=>void` 仅openFileStore第二个可选测试参数，非业务配置。

```ts
async function writeState(directory:string,state:State,fault?:(p:'beforeRename'|'afterRename')=>void){
 assertState(state);
 const bytes=Buffer.from(canonical(state));
 if(bytes.length>64*1024*1024||state.releases.length>1000)throw new OperationError('storage_limit');
 const temp=join(directory,`state-${randomUUID()}.tmp`);
 let renamed=false;
 try {
  const file=await open(temp,'wx',0o600);
  try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  fault?.('beforeRename');
  await rename(temp,join(directory,'state.json'));renamed=true;
  fault?.('afterRename');
  const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}
 } catch(error){
  if(renamed)throw new OperationError('commit_unknown');
  throw error;
 } finally {await rm(temp,{force:true});}
}
```

openFileStore：mkdir mode0700；open writer.lock 'wx'0600写pid+随机nonce（不是密钥）并sync；打开既有state.json，限制大小后parse/assertState；仅ENOENT创建emptyState，其他错误释放自己刚创建的锁并拒绝。单实例 `tail=Promise.resolve()`，transact用 `const job=tail.then(async()=>{...}); tail=job.then(()=>undefined,()=>undefined)`，闭包内read/assert/structuredClone→change→writeState→clone(result)。change失败不写；commit_unknown置poisoned，后续写拒绝。read也排队，返回clone；close排队、标closed、只删除自身nonce匹配的锁。

- [ ] 测试补足：beforeRename故障重开还是旧状态；afterRename故障返回commit_unknown、旧句柄拒绝再写、close/reopen读取新完整状态；坏JSON/hash/悬空引用拒绝启动；第二进程独占拒绝；异常change不修改原状态；调用方事后修改返回对象不污染磁盘；不存在state时允许空库但存在损坏文件绝不清空。测试产物构造使用真实hash，不能对assertState做mock。
- [ ] README给出恢复步骤：停止唯一服务→备份整个目录→核对writer.lock pid及原服务已退出→人工移走锁→重开执行assertState→用幂等查询确认结果；不自动unlink其他进程的锁。验证超限拒绝且旧状态可读。
- [ ] test/build/typecheck后提交 `feat: 增加单写者原子版本存储与恢复校验`。

## 自审

事务的公开结果只有完整state落盘后才能成功；afterRename不可回滚成“没发生”。V本身可独立测试，不产生发布业务；G负责在transact内生成合法关联数据。试点容量是明确边界，不用自动历史裁剪。
