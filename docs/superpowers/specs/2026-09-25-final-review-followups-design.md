# 终审跟进项打包（测试卫生/双跑消除/SSE 区分/文档+0.1.2）— 设计文档

日期：2026-09-25
状态：设计已经用户确认（四项打包）
来源：wire 调试双件套分支（`83bcc1f`）终审的 Deferred-Minors Triage 与 Recommendations
前置文档：`2026-09-25-wire-debug-followups-design.md`（本设计不改变其任何不变量）

## 1. 背景与目标

wire 调试双件套合入后，终审留下四个不阻塞的跟进项。本设计把它们打包为一次微迭代：

1. 测试卫生：`fetch-tree.test.ts` 的陈旧注释与本分支引入的注册残留清理；
2. `validateComponentTree` 同树双跑消除；
3. SSE `tree` 帧「到达但解析失败」与「缺帧」的区分上报；
4. 新 API（`onFailure` / `unregisterWireFormat`）的 README 文档 + runtime 0.1.2 发布准备。

**不变量**：兜底语义零变化；既有用例零改动通过；runtime 零新增依赖。

## 2. 设计

### 2.1 测试卫生（packages/runtime/src/fetch-tree.test.ts）

- `:191` 附近注释「wireFormats 为模块级全局 Map（无 reset API）」→ 更新为「wireFormats 为模块级全局 Map，可用 unregisterWireFormat 清理」；
- onFailure describe 的 `afterEach` 追加 `unregisterWireFormat("ft-null");`（import 已含 `registerWireFormat`，补 `unregisterWireFormat`）——本分支引入的 API 清理本分支引入的注册残留。

### 2.2 validator 双跑消除（packages/runtime/src/fetch-tree.ts）

`validationFailure` 改签名——从 `(registry, tree)` 改为收**已算好的失败结果**，从类型层面消灭「ok 为 true 还要 message」的死分支：

```ts
import type { ValidationResult } from "@ai-slot/registry";

/** 校验失败时的观测事件：携带 validator 首错 message（fail-fast 语义）。 */
function validationFailure(result: Extract<ValidationResult, { ok: false }>): FetchFailure {
  return { stage: "validate", message: result.errors[0]?.message ?? "validation failed" };
}
```

两处调用点（JSON 路径与 `readSSE` 末尾）统一改为「先跑一次、失败即上报」：

```ts
if (opts.registry) {
  const result = validateComponentTree(opts.registry, tree);
  if (!result.ok) {
    safeReport(opts.onFailure, validationFailure(result));
    return null;
  }
}
```

（`registry` 类型为 `Registry` 非可选时——`readSSE` 末尾的调用点在 `opts.registry` 检查内，类型收窄已保证。）

### 2.3 SSE tree 帧解析失败区分上报（packages/runtime/src/fetch-tree.ts）

`readSSE`：函数内（`finalTree` 旁）新增 `let finalFailure: FetchFailure | undefined;`；tree 帧取 `{ tree, failure }`：

```ts
} else if (event === "tree") {
  const extracted = extractTree(data);
  finalTree = extracted.tree;
  finalFailure = extracted.failure;
}
```

末尾：

```ts
if (finalTree === null) {
  // 帧到达但解析失败 → 上报；流里根本没有 tree 帧 → 保持既有静默
  if (finalFailure) safeReport(opts.onFailure, finalFailure);
  return null;
}
```

骨架帧处理保持静默不变。

### 2.4 文档 + 发布准备

- **`packages/runtime/README.md`**：Usage 脚本示例中的 `configureAiSlot({ registry });` **就地改为** `configureAiSlot({ registry, onFailure: (f) => console.debug(f) });`；`Element attributes` 段之后新增一段 API 速览（两行）：`unregisterWireFormat(id)` 注销线格式；`FetchFailure { stage: "http-non-ok" | "parse" | "validate" | "fetch-error", message }` 经 `configureAiSlot` 或 `fetchComponentTree` 的 `onFailure` 观测。
- **根 `README.md` / `README.zh-CN.md`**：Protocol-neutral 小节示例的 `configureAiSlot({ registry });` 行同步加 `onFailure`（中英各两行以内的增量）。
- **`packages/runtime/package.json`**：`"version": "0.1.1"` → `"0.1.2"`。
- **发布**：合并后由用户手动 `pnpm publish`（0.1.2，含 unregister/onFailure）。

## 3. 不做（YAGNI）

- 不改 `FetchFailure` 枚举、不新增阶段
- 不给 JSON 路径的「空响应」缺省分支（`?? { stage: "parse", message: "empty response" }`）做类型收窄重构——与本次目标无关
- 不动 a2ui 包
- 不改 ai-slot.ts（全局透传已存在）

## 4. 测试

1. 新增 2 用例（fetch-tree.test.ts 的 SSE describe）：
   - 「tree 帧到达但 wire 解析为 null → 返回 null 且上报 `parse`」（skeleton + 坏 tree 帧）；
   - 「只有 skeleton 帧、无 tree 帧 → 返回 null 且不上报」（静默语义锁定）。
2. 既有用例零改动通过（§2.2 为内部重构，validate-stage 用例行为不变；§2.3 改动被既有「SSE validate 上报」用例覆盖）。
3. 验收：`pnpm build && pnpm test && pnpm typecheck` 全绿。

## 5. 验收标准

1. 全链路绿（§4.3）。
2. README 三处与实现一致；runtime 版本 0.1.2。
