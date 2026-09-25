# wire 调试双件套实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** runtime 包补两个终审跟进项：`unregisterWireFormat` 注销 API + 双层对称的 `onFailure` 失败观测钩子（`FetchTreeOptions` 逐次 + `configureAiSlot` 全局透传）。

**Architecture:** 纯增量。wire.ts 加一个 `Map.delete` 包装；fetch-tree.ts 的 `extractTree` 返回值带上失败原因，所有失败路径在 `return null` 前经 `safeReport`（try/catch 包裹回调，异常吞掉）旁路上报；ai-slot.ts 增加与 `globalRegistry` 对称的 `globalOnFailure` 并在 `load()` 透传。兜底语义零变化。

**Tech Stack:** TypeScript（strict、ES2022、纯 ESM）、Vitest（jsdom）。

**Spec:** docs/superpowers/specs/2026-09-25-wire-debug-followups-design.md

## Global Constraints

- 注释与提交信息用**中文**，Conventional Commits；每条提交末尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- runtime 包**不新增任何依赖**
- **兜底语义零变化**：钩子是旁路观测，回调抛异常必须被吞掉；既有全部用例零改动通过（纯增量：新导出 + 新可选参数）
- 钩子的 `message` 用英文短语（API 面向国际用户）；`validate` 阶段携带 validator 首错 message
- SSE 骨架帧跳过保持静默（瞬态设计使然）；SSE 缺终树帧保持既有静默（spec 未列入上报）
- 每个任务：包内 `npx vitest run` 全绿再提交；Task 2 提交前跑 `pnpm build && pnpm test && pnpm typecheck` 全链路

---

### Task 1: unregisterWireFormat 注销 API

**Files:**
- Modify: `packages/runtime/src/wire.ts`（在 `registerWireFormat` 之后追加）
- Test: `packages/runtime/src/wire.test.ts`（文件末尾追加 2 个用例，import 行补 `unregisterWireFormat`）

**Interfaces:**
- Consumes: 模块级 `wireFormats: Map<string, WireFormat>`（已存在）
- Produces: `unregisterWireFormat(id: string): boolean`（Task 2 不依赖；公开 API）

- [ ] **Step 1: 写失败测试**——`packages/runtime/src/wire.test.ts` 顶部 import 改为：

```ts
import { parseWithWireFormats, registerWireFormat, unregisterWireFormat, type WireFormat } from "./wire.js";
```

文件末尾追加：

```ts
describe("unregisterWireFormat", () => {
  it("注销后 parseWithWireFormats 不再命中该格式", () => {
    registerWireFormat("m7", fmt("m7", { component: "a" }));
    expect(unregisterWireFormat("m7")).toBe(true);
    expect(parseWithWireFormats({ marker: "m7" })).toEqual({ matched: false, tree: null });
  });

  it("注销不存在的 id 返回 false", () => {
    expect(unregisterWireFormat("m8-不存在")).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/runtime && npx vitest run src/wire.test.ts`
Expected: FAIL，`No export named unregisterWireFormat`（或等价的未导出错误）

- [ ] **Step 3: 实现**——`packages/runtime/src/wire.ts` 的 `registerWireFormat` 函数之后追加：

```ts
/** 注销线格式解析器。返回是否确实删除了条目（Map.delete 语义）。用于测试隔离与动态换装。 */
export function unregisterWireFormat(id: string): boolean {
  return wireFormats.delete(id);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd packages/runtime && npx vitest run src/wire.test.ts`
Expected: PASS（既有 8 + 新增 2）

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/wire.ts packages/runtime/src/wire.test.ts
git commit -m "feat(runtime): 新增 unregisterWireFormat 注销 API"
```

---

### Task 2: onFailure 失败观测钩子（fetch-tree 层 + configureAiSlot 全局层）

**Files:**
- Modify: `packages/runtime/src/fetch-tree.ts`
- Modify: `packages/runtime/src/ai-slot.ts`
- Test: `packages/runtime/src/fetch-tree.test.ts`（末尾追加 describe）
- Test: `packages/runtime/src/ai-slot.test.ts`（末尾追加 1 个用例）

**Interfaces:**
- Consumes: `parseWithWireFormats`（wire.ts，已存在）、`validateComponentTree`（registry，已存在）
- Produces: `interface FetchFailure { stage: "http-non-ok" | "parse" | "validate" | "fetch-error"; message: string }`、`FetchTreeOptions.onFailure?: (failure: FetchFailure) => void`、`configureAiSlot(opts: { registry?: Registry; onFailure?: (failure: FetchFailure) => void }): void`

- [ ] **Step 1: 写失败测试**——`packages/runtime/src/fetch-tree.test.ts` 顶部 import 补充：`fetchComponentTree` 的既有 import 行不变；新增用例追加到文件末尾：

```ts
describe("fetchComponentTree — onFailure 观测钩子", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("http-non-ok：非 2xx 报状态码", async () => {
    const failures: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    const tree = await fetchComponentTree({ src: "/x", registry, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "http-non-ok", message: "HTTP 503" }]);
  });

  it("parse：wire 命中但解析为 null", async () => {
    registerWireFormat("ft-null", {
      detect: (d) => typeof d === "object" && d !== null && "messages" in d,
      parse: () => null,
    });
    const failures: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ messages: [] }) })));
    const tree = await fetchComponentTree({ src: "/x", registry, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "parse", message: "wire format parse returned null" }]);
  });

  it("parse：原生响应缺 tree", async () => {
    const failures: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ version: 1, slot: "hero" }) })));
    const tree = await fetchComponentTree({ src: "/x", registry, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "parse", message: "response carried no component tree" }]);
  });

  it("validate：registry 拒绝时携带 validator 首错 message", async () => {
    const failures: Array<{ stage: string; message: string }> = [];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ version: 1, slot: "hero", tree: { component: "no-such-comp" } }) })));
    const tree = await fetchComponentTree({ src: "/x", registry, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toHaveLength(1);
    expect(failures[0].stage).toBe("validate");
    expect(failures[0].message.length).toBeGreaterThan(0);
  });

  it("fetch-error：fetch 抛异常携带 message；回调自身抛异常不影响返回 null", async () => {
    const failures: Array<{ stage: string; message: string }> = [];
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("网络断了");
    }));
    const tree = await fetchComponentTree({
      src: "/x",
      registry,
      onFailure: (f) => {
        failures.push(f);
        throw new Error("回调异常");
      },
    });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "fetch-error", message: "网络断了" }]);
  });
});
```

（若文件顶部未导入 `registerWireFormat`/`WireFormat`，按既有 import 风格补上：`import { registerWireFormat } from "./wire.js";`——该文件在 wire 扩展任务已有导入则复用。）

`packages/runtime/src/ai-slot.test.ts` 末尾追加（在既有顶层 describe 之外）：

```ts
describe("configureAiSlot — 全局 onFailure", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // 复位全局配置，避免泄漏到其它用例
    configureAiSlot({ registry });
  });

  it("元素 load 命中失败路径时，全局钩子被调用且兜底内容保留", async () => {
    const failures: Array<{ stage: string; message: string }> = [];
    configureAiSlot({ registry, onFailure: (f) => failures.push(f) });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush();
    expect(failures).toEqual([{ stage: "http-non-ok", message: "HTTP 503" }]);
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
  });
});
```

（`configureAiSlot`/`AiSlotElement` 已在该测试文件导入；`flush`/`registry` 复用文件内既有 helper。若顶层 import 未含 `vi`/`afterEach`，按既有头部补齐。）

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/runtime && npx vitest run src/fetch-tree.test.ts src/ai-slot.test.ts`
Expected: FAIL——`onFailure` 不在类型/实现中（fetch-tree 6 个新用例失败；ai-slot 1 个新用例失败）

- [ ] **Step 3: 实现 fetch-tree.ts**

3a. `FetchTreeOptions` 追加字段（`onSkeleton` 之后、`fetchImpl` 之前）与新增导出类型：

```ts
  /** 可选失败观测：每个失败路径触发一次。回调异常被吞掉，绝不影响兜底。 */
  onFailure?: (failure: FetchFailure) => void;
  /** 测试注入用 */
  fetchImpl?: typeof fetch;
```

```ts
/** 失败观测事件：stage 标识失败阶段，message 为人读原因（英文短语，API 面向国际用户）。 */
export interface FetchFailure {
  stage: "http-non-ok" | "parse" | "validate" | "fetch-error";
  message: string;
}
```

3b. import 区之后新增两个模块级 helper（`fetchComponentTree` 之前）：

```ts
/** 上报失败观测；回调异常一律吞掉——钩子绝不能破坏兜底路径。 */
function safeReport(onFailure: ((failure: FetchFailure) => void) | undefined, failure: FetchFailure): void {
  if (!onFailure) return;
  try {
    onFailure(failure);
  } catch {
    // 观测回调异常不影响兜底
  }
}

/** 校验失败时的观测事件：携带 validator 首错 message（fail-fast 语义）。 */
function validationFailure(registry: Registry, tree: ComponentNode): FetchFailure {
  const result = validateComponentTree(registry, tree);
  const message = result.ok ? "validation failed" : (result.errors[0]?.message ?? "validation failed");
  return { stage: "validate", message };
}
```

3c. `extractTree` 改为携带失败原因（替换现函数体）：

```ts
/** 已解析 JSON → 组件树：先按注册顺序探测 wire formats，全部未命中走原生 AiRenderResponse。失败时附带观测事件。 */
function extractTree(data: unknown): { tree: ComponentNode | null; failure?: FetchFailure } {
  const wire = parseWithWireFormats(data);
  if (wire.matched) {
    return wire.tree
      ? { tree: wire.tree }
      : { tree: null, failure: { stage: "parse", message: "wire format parse returned null" } };
  }
  const body = data as AiRenderResponse;
  return body?.tree
    ? { tree: body.tree }
    : { tree: null, failure: { stage: "parse", message: "response carried no component tree" } };
}
```

3d. `fetchComponentTree` 的四处失败路径接入上报（`res.ok` 检查、JSON 路径、catch 分支；`userPrompt`/`headers`/`init` 构造不变）：

```ts
    const res = await doFetch(opts.src, init);
    if (!res.ok) {
      safeReport(opts.onFailure, { stage: "http-non-ok", message: `HTTP ${res.status}` });
      return null;
    }
```

JSON 路径（替换现 `extractTree` 调用与校验段）：

```ts
    const { tree, failure } = extractTree((await res.json()) as unknown);
    if (!tree) {
      // failure 由 extractTree 构造保证存在；?? 仅为类型完备
      safeReport(opts.onFailure, failure ?? { stage: "parse", message: "empty response" });
      return null;
    }
    if (opts.registry && !validateComponentTree(opts.registry, tree).ok) {
      safeReport(opts.onFailure, validationFailure(opts.registry, tree));
      return null;
    }
    return tree;
  } catch (error) {
    safeReport(opts.onFailure, {
      stage: "fetch-error",
      message: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
```

3e. `readSSE` 末尾的终树校验接入上报（骨架帧保持静默；缺终树帧保持既有静默）：

```ts
  if (finalTree === null) return null;
  if (opts.registry && !validateComponentTree(opts.registry, finalTree).ok) {
    safeReport(opts.onFailure, validationFailure(opts.registry, finalTree));
    return null;
  }
  return finalTree;
```

- [ ] **Step 4: 实现 ai-slot.ts**

```ts
import { fetchComponentTree, type FetchFailure } from "./fetch-tree.js";
```

```ts
let globalRegistry: Registry | undefined;
let globalOnFailure: ((failure: FetchFailure) => void) | undefined;

/** 全局配置：registry 供渲染前二次校验；onFailure 为可选失败观测（load 时透传给 fetchComponentTree）。 */
export function configureAiSlot(opts: { registry?: Registry; onFailure?: (failure: FetchFailure) => void }): void {
  globalRegistry = opts.registry;
  globalOnFailure = opts.onFailure;
}
```

`load()` 内 `fetchComponentTree` 的 opts 对象在 `registry: globalRegistry,` 之后加一行：

```ts
      onFailure: globalOnFailure,
```

- [ ] **Step 5: 运行确认通过 + 全链路**

Run: `cd packages/runtime && npx vitest run`
Expected: PASS（既有全部 + 新增 7，零改动既有用例）

Run: `pnpm build && pnpm test && pnpm typecheck`
Expected: 全部退出码 0

- [ ] **Step 6: 提交**

```bash
git add packages/runtime/src/fetch-tree.ts packages/runtime/src/fetch-tree.test.ts packages/runtime/src/ai-slot.ts packages/runtime/src/ai-slot.test.ts
git commit -m "feat(runtime): fetch-tree 失败观测钩子 onFailure（fetch-tree 层 + configureAiSlot 全局层）"
```

---

## 验收清单（对照 spec §5）

- [ ] `pnpm build && pnpm test && pnpm typecheck` 全绿
- [ ] 既有全部用例零改动通过（纯增量）
- [ ] 四种 stage 均有专项测试；回调抛异常不破坏兜底有专项测试
