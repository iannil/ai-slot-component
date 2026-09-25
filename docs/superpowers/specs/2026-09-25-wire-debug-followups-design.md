# wire 调试双件套（unregister + onFailure 钩子）— 设计文档

日期：2026-09-25
状态：设计已经用户确认（双层对称钩子）
来源：A2UI 兼容层终审遗留「合并后跟进」项（progress.md 已随 SDD 工作区清理，事实记录在案：wireFormats Map 无 reset；fetchComponentTree 静默 null 不带原因）
前置文档：`2026-09-25-a2ui-compat-layer-design.md`（本设计不改变其任何不变量）

## 1. 背景与目标

终审确认的两个运营性缺口：

1. `wireFormats` 是模块级 Map 且只有注册没有注销——测试隔离靠约定（不相交 marker / 同 id 覆盖），运行时无法动态换装。
2. `fetchComponentTree` 一切失败都坍缩为 `null`（符合「静默兜底」不变量），但没有任何观测面——`<ai-slot>` 用户看到兜底内容时无法知道「为什么」。

目标：补一个注销 API + 一个可选失败原因钩子。**兜底语义零变化**：钩子只是旁路观测，回调任何异常不得影响既有行为。

## 2. 设计

### 2.1 `unregisterWireFormat`（packages/runtime/src/wire.ts）

```ts
/** 注销线格式解析器。返回是否确实删除了条目（Map.delete 语义）。用于测试隔离与动态换装。 */
export function unregisterWireFormat(id: string): boolean {
  return wireFormats.delete(id);
}
```

### 2.2 `onFailure` 钩子（双层对称，单一机制）

```ts
// fetch-tree.ts
export interface FetchFailure {
  stage: "http-non-ok" | "parse" | "validate" | "fetch-error";
  /** 英文短语（API 面向国际用户）；validate 阶段携带 validator 首错 message（与 fail-fast 一致） */
  message: string;
}

export interface FetchTreeOptions {
  // …既有字段不变…
  /** 可选失败观测：每次失败路径触发一次。回调异常被吞掉，绝不影响兜底。 */
  onFailure?: (failure: FetchFailure) => void;
}
```

调用点（fetch-tree.ts 内统一经 `safeReport(onFailure, failure)` 包裹 try/catch）：

| 阶段 | 触发点 | message 示例 |
|------|--------|--------------|
| `http-non-ok` | `res.ok` 为 false | `HTTP ${res.status}` |
| `parse` | wire 命中但 parse 返回 null；或原生路径 `data?.tree` 为空 | `wire format parse returned null` / `response carried no component tree` |
| `validate` | `validateComponentTree` 不通过（终树；JSON 与 SSE 两路径） | validator 首错 message |
| `fetch-error` | 既有 catch 分支（fetch 抛异常/响应损坏） | `e instanceof Error ? e.message : "unknown error"` |

SSE 骨架帧跳过保持静默（瞬态、设计使然）；终树校验失败会报告。

### 2.3 全局面（packages/runtime/src/ai-slot.ts）

```ts
let globalOnFailure: ((failure: FetchFailure) => void) | undefined;

export function configureAiSlot(opts: { registry?: Registry; onFailure?: (f: FetchFailure) => void }): void
```

`load()` 的 `fetchComponentTree` 调用透传 `onFailure: globalOnFailure`（骨架帧经 onSkeleton 回调处理，不经此钩子）。与既有 `globalRegistry` 完全对称：第二个可选全局配置，不新增 DOM 属性、不引入新的全局状态模式。

## 3. 不做（YAGNI）

- 默认 console 输出、日志分级
- 错误分类枚举扩展、结构化堆栈
- `<ai-slot>` 新 DOM 属性
- 重试/重载联动
- live / editable 等特性路径的专属钩子（它们都经 `load()`，自动被覆盖）

## 4. 测试

1. **wire.test.ts**：注销后 `parseWithWireFormats` 不再命中；注销不存在的 id 返回 `false`。
2. **fetch-tree.test.ts**：四种 stage 各一（非 2xx / wire parse null / registry 校验拒绝 / fetch 抛异常，各断言 stage 与 message 关键内容）；`onFailure` 自身抛异常时 `fetchComponentTree` 仍返回 null 且不抛。
3. **ai-slot.test.ts**（jsdom）：`configureAiSlot({ onFailure })` 后，元素 load 命中失败路径（如非 2xx）时全局钩子被调用。

## 5. 验收标准

1. `pnpm build && pnpm test && pnpm typecheck` 全绿（runtime 包新增 ~10 行实现 + ~60 行测试）。
2. 既有全部用例零改动通过（纯增量：新导出 + 新可选参数）。
