# 终审跟进项打包实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 wire 调试双件套终审的四个跟进项：测试卫生、validator 双跑消除、SSE tree 帧解析失败区分上报、新 API 文档 + runtime 0.1.2。

**Architecture:** 前三项集中在 `packages/runtime/src/fetch-tree.ts` 及其测试（`validationFailure` 改收 `ValidationResult` 失败分支、`readSSE` 记录 tree 帧解析失败并区分上报）；第四项是三处 README 与版本号。兜底语义零变化。

**Tech Stack:** TypeScript（strict、ES2022、纯 ESM）、Vitest（jsdom）。

**Spec:** docs/superpowers/specs/2026-09-25-final-review-followups-design.md

## Global Constraints

- 注释与提交信息用**中文**，Conventional Commits；每条提交末尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- runtime 零新增依赖；**既有用例零改动通过**（纯内部重构 + 纯新增用例）
- SSE 静默边界：骨架帧始终静默；**流里没有 tree 帧 → 保持静默**；tree 帧到达但解析失败 → 上报 `parse`
- 文档示例的符号名必须与真实导出逐字一致（`configureAiSlot`/`unregisterWireFormat`/`FetchFailure`）
- Task 1 提交前：包内全绿 + `pnpm build && pnpm test && pnpm typecheck` 全链路绿
- 发布（runtime 0.1.2 `pnpm publish`）由用户手动执行，不在本计划内

---

### Task 1: fetch-tree 重构 + SSE 区分上报 + 测试卫生

**Files:**
- Modify: `packages/runtime/src/fetch-tree.ts`
- Modify: `packages/runtime/src/fetch-tree.test.ts`
- Modify: `packages/runtime/src/wire.ts`（无改动——仅测试需要 import `unregisterWireFormat`，其已存在）

**Interfaces:**
- Consumes: `validateComponentTree` / `ValidationResult`（registry）、`parseWithWireFormats` / `unregisterWireFormat`（wire.ts）、`FetchFailure` / `safeReport` / `extractTree`（fetch-tree.ts 既有）
- Produces: 无新导出（`validationFailure` 为模块内私有，签名变为 `(result: Extract<ValidationResult, { ok: false }>) => FetchFailure`）

- [ ] **Step 1: 写失败测试**——`packages/runtime/src/fetch-tree.test.ts` 的 onFailure describe 内追加 2 个用例（放在该 describe 末尾；`unregisterWireFormat` 追加进该文件的 `./wire.js` import）：

```ts
  it("SSE：tree 帧到达但 wire 解析为 null → 上报 parse", async () => {
    registerWireFormat("ft-sse-null", {
      detect: (d) => typeof d === "object" && d !== null && "messages" in d,
      parse: () => null,
    });
    const failures: Array<{ stage: string; message: string }> = [];
    const sse =
      `event: skeleton\ndata: ${JSON.stringify({ messages: [] })}\n\n` +
      `event: tree\ndata: ${JSON.stringify({ messages: [] })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse));
            controller.close();
          },
        }),
        text: () => Promise.resolve(sse),
      }),
    ));
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "parse", message: "wire format parse returned null" }]);
  });

  it("SSE：只有 skeleton 帧、无 tree 帧 → 静默返回 null 且不上报", async () => {
    const failures: Array<{ stage: string; message: string }> = [];
    const sse = `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: { component: "hero-banner", props: { title: "" } } })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse));
            controller.close();
          },
        }),
        text: () => Promise.resolve(sse),
      }),
    ));
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([]);
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/runtime && npx vitest run src/fetch-tree.test.ts`
Expected: 第 1 个新用例 FAIL（当前实现丢弃 tree 帧的 failure → failures 为空）；第 2 个新用例 PASS（静默是现状）；其余全过

- [ ] **Step 3: 实现 fetch-tree.ts**

3a. import 行补 `ValidationResult` 类型：

```ts
import { validateComponentTree, type AiRenderResponse, type ComponentNode, type Registry, type ValidationResult } from "@ai-slot/registry";
```

3b. `validationFailure` 改签名（替换现函数体）：

```ts
/** 校验失败时的观测事件：携带 validator 首错 message（fail-fast 语义）。 */
function validationFailure(result: Extract<ValidationResult, { ok: false }>): FetchFailure {
  return { stage: "validate", message: result.errors[0]?.message ?? "validation failed" };
}
```

3c. `readSSE`：`finalTree` 声明旁新增 `let finalFailure: FetchFailure | undefined;`；tree 帧分支替换为：

```ts
    } else if (event === "tree") {
      const extracted = extractTree(data);
      finalTree = extracted.tree;
      finalFailure = extracted.failure;
    }
```

3d. `readSSE` 末尾替换为（先区分上报，再校验）：

```ts
  if (finalTree === null) {
    // 帧到达但解析失败 → 上报；流里根本没有 tree 帧 → 保持既有静默
    if (finalFailure) safeReport(opts.onFailure, finalFailure);
    return null;
  }
  if (opts.registry) {
    const result = validateComponentTree(opts.registry, finalTree);
    if (!result.ok) {
      safeReport(opts.onFailure, validationFailure(result));
      return null;
    }
  }
  return finalTree;
```

3e. `fetchComponentTree` JSON 路径的校验段替换为（同构，消除双跑）：

```ts
    if (opts.registry) {
      const result = validateComponentTree(opts.registry, tree);
      if (!result.ok) {
        safeReport(opts.onFailure, validationFailure(result));
        return null;
      }
    }
    return tree;
```

3f. 测试卫生（fetch-tree.test.ts）：
- grep 定位含「无 reset API」的注释行，将该短语改为「可用 unregisterWireFormat 清理」（其余注释文字保持）；
- onFailure describe 的 `afterEach(() => vi.unstubAllGlobals());` 改为：

```ts
  afterEach(() => {
    vi.unstubAllGlobals();
    unregisterWireFormat("ft-null");
  });
```

- [ ] **Step 4: 运行确认通过 + 全链路**

Run: `cd packages/runtime && npx vitest run`
Expected: PASS（既有全部 + 新增 2，既有用例零改动）

Run: `pnpm build && pnpm test && pnpm typecheck`
Expected: 全部退出码 0

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/fetch-tree.ts packages/runtime/src/fetch-tree.test.ts
git commit -m "refactor(runtime): 消除 validator 双跑 + SSE tree 帧解析失败区分上报"
```

---

### Task 2: 新 API 文档 + runtime 0.1.2 发布准备

**Files:**
- Modify: `packages/runtime/README.md`
- Modify: `README.md`（Protocol-neutral 小节示例，1 行）
- Modify: `README.zh-CN.md`（同上）
- Modify: `packages/runtime/package.json`（version）

**Interfaces:**
- Consumes: Task 1 已落地的真实导出（`unregisterWireFormat`、`FetchFailure`、`configureAiSlot` 的 `onFailure`）
- Produces: 文档与 0.1.2 版本号（发布由用户手动执行）

- [ ] **Step 1: 修改 `packages/runtime/README.md`**

Usage 脚本中 `configureAiSlot({ registry });` 就地改为：

```ts
  configureAiSlot({ registry, onFailure: (f) => console.debug(f) });
```

`Element attributes: …` 段之后（`> Registration must happen…` 引用块之前）插入：

```md
Wire format APIs: `registerWireFormat(id, format)` / `unregisterWireFormat(id)` plug alternative wire formats into the fetch pipeline. Failures are observed via `onFailure` as `FetchFailure { stage: "http-non-ok" | "parse" | "validate" | "fetch-error", message }` — set it globally in `configureAiSlot` or per call on `fetchComponentTree`. The silent-fallback behavior never changes; the hook is observation only.
```

- [ ] **Step 2: 根 README 双语同步**

`README.md` 的 Protocol-neutral 小节示例中 `configureAiSlot({ registry });` 就地改为：

```ts
configureAiSlot({ registry, onFailure: (f) => console.debug(f) });
```

`README.zh-CN.md` 的「协议中立的设计」小节同样处理（代码示例与英文版逐字一致）。

- [ ] **Step 3: 版本号**

`packages/runtime/package.json` 的 `"version": "0.1.1"` 改为 `"0.1.2"`。

- [ ] **Step 4: 验证 + 提交**

Run: `pnpm build && pnpm test && pnpm typecheck`
Expected: 全部退出码 0

```bash
git add packages/runtime/README.md packages/runtime/package.json README.md README.zh-CN.md
git commit -m "chore(release): runtime 0.1.2 与新 API 文档（onFailure/unregisterWireFormat）"
```

---

## 验收清单（对照 spec §5）

- [ ] 全链路绿（Task 1 Step 4 与 Task 2 Step 4）
- [ ] 既有用例零改动通过；SSE 两个新用例分别锁定「解析失败上报」与「缺帧静默」
- [ ] README 三处符号与真实导出逐字一致；runtime 版本 0.1.2
- [ ] 未做的事没做：FetchFailure 枚举未扩、a2ui 未动、ai-slot.ts 未动
