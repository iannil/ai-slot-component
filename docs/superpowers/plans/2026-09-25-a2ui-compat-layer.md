# A2UI 兼容层实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `<ai-slot>` 可消费任意 A2UI 端点的输出（消费侧），并可把 ai-slot 代理的产出重写为 A2UI 格式（生产侧），同时交付 README 双语定位小节、英文博客草稿与 CLAUDE.md 一致性更新。

**Architecture:** 新包 `@ai-slot/a2ui` 持有全部 A2UI 知识；runtime 仅加一个与 `registerRenderer` 对称的 `registerWireFormat` 通用扩展点；proxy 零改动（由 `withA2uiOutput` 高阶函数在外部包住 handler）。消费侧解析产物走现有 `validateComponentTree → renderTree → 静默兜底` 管线，安全边界一行不改。

**Tech Stack:** TypeScript（strict、ES2022、纯 ESM）、tsup（esm + dts）、Vitest（jsdom）、pnpm workspace。

**Spec:** `docs/superpowers/specs/2026-09-25-a2ui-compat-layer-design.md`

## Global Constraints

- 注释与提交信息用**中文**，提交信息用 Conventional Commits；每条提交末尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- runtime 包**不新增任何依赖**（保持零依赖）；`@ai-slot/a2ui` 对 `@ai-slot/runtime`、`@ai-slot/adapter-dom` 只允许 **peerDependency + type-only import**（`@ai-slot/registry` 为普通 dependency）。
- AI 输出永远不可信：解析/校验任何失败 → `null` → 调用方静默兜底。绝不白屏、绝不向终端用户报错。
- 文本写入必须 `textContent`，禁止把 AI 文本塞进 `innerHTML`。
- `basicCatalogDomDefs` **零内置 CSS**：类名仅作为用户 CSS 挂钩（`a2ui-` 前缀）。
- 测试环境 jsdom；各包 vitest alias 一律指向**源码**（`../registry/src/index.ts` 等，不走 dist）。
- 每个任务结束前：包内 `npx vitest run` 通过再提交。
- 最终验收：根目录 `pnpm build && pnpm test && pnpm typecheck` 全绿。

---

### Task 1: runtime wire format 扩展点

**Files:**
- Create: `packages/runtime/src/wire.ts`
- Test: `packages/runtime/src/wire.test.ts`
- Modify: `packages/runtime/src/index.ts`（追加一行导出）

**Interfaces:**
- Consumes: `ComponentNode`（`@ai-slot/registry`，runtime 已依赖）
- Produces: `interface WireFormat { detect(data: unknown): boolean; parse(data: unknown): ComponentNode | null }`、`registerWireFormat(id: string, format: WireFormat): void`、`parseWithWireFormats(data: unknown): { matched: boolean; tree: ComponentNode | null }`（Task 2 消费）

- [ ] **Step 1: 写失败测试** `packages/runtime/src/wire.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { ComponentNode } from "@ai-slot/registry";
import { parseWithWireFormats, registerWireFormat, type WireFormat } from "./wire.js";

const fmt = (marker: string, tree: ComponentNode | null): WireFormat => ({
  detect: (d) => typeof d === "object" && d !== null && (d as Record<string, unknown>).marker === marker,
  parse: () => tree,
});

describe("registerWireFormat / parseWithWireFormats", () => {
  it("命中者生效，未命中者被跳过", () => {
    registerWireFormat("m1-a", fmt("m1", { component: "a" }));
    registerWireFormat("m1-b", fmt("nope", { component: "b" }));
    expect(parseWithWireFormats({ marker: "m1" })).toEqual({ matched: true, tree: { component: "a" } });
  });

  it("按注册顺序，首个命中者生效", () => {
    const order: string[] = [];
    registerWireFormat("m2-a", {
      detect: (d) => (order.push("a"), (d as Record<string, unknown>).marker === "m2"),
      parse: () => ({ component: "a" }),
    });
    registerWireFormat("m2-b", {
      detect: (d) => (order.push("b"), (d as Record<string, unknown>).marker === "m2"),
      parse: () => ({ component: "b" }),
    });
    expect(parseWithWireFormats({ marker: "m2" })).toEqual({ matched: true, tree: { component: "a" } });
    expect(order).toEqual(["a"]);
  });

  it("全部未命中返回 matched: false", () => {
    registerWireFormat("m3", fmt("m3", null));
    expect(parseWithWireFormats({ marker: "其它" })).toEqual({ matched: false, tree: null });
  });

  it("detect 抛异常按未命中处理，继续尝试后续格式", () => {
    registerWireFormat("m4", { detect: () => { throw new Error("boom"); }, parse: () => ({ component: "x" }) });
    registerWireFormat("m4-after", fmt("m4", { component: "ok" }));
    expect(parseWithWireFormats({ marker: "m4" })).toEqual({ matched: true, tree: { component: "ok" } });
  });

  it("parse 抛异常按失败处理（matched 仍为 true，不回退原生路径）", () => {
    registerWireFormat("m5", {
      detect: (d) => (d as Record<string, unknown>).marker === "m5",
      parse: () => { throw new Error("boom"); },
    });
    expect(parseWithWireFormats({ marker: "m5" })).toEqual({ matched: true, tree: null });
  });

  it("同 id 后注册覆盖先注册", () => {
    registerWireFormat("m6", fmt("m6", { component: "first" }));
    registerWireFormat("m6", fmt("m6", { component: "second" }));
    expect(parseWithWireFormats({ marker: "m6" })).toEqual({ matched: true, tree: { component: "second" } });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/runtime && npx vitest run src/wire.test.ts`
Expected: FAIL，`Cannot find module './wire.js'`

- [ ] **Step 3: 实现** `packages/runtime/src/wire.ts`

```ts
import type { ComponentNode } from "@ai-slot/registry";

/**
 * 可插拔线格式：把非原生响应（如 A2UI messages）解析为内部组件树。
 * detect 必须是纯函数且不得抛异常；parse 任何失败返回 null，调用方据此静默兜底。
 */
export interface WireFormat {
  detect(data: unknown): boolean;
  parse(data: unknown): ComponentNode | null;
}

const wireFormats = new Map<string, WireFormat>();

/** 注册线格式解析器（与 registerRenderer 对称）。同 id 后注册覆盖先注册；检测按注册顺序。 */
export function registerWireFormat(id: string, format: WireFormat): void {
  wireFormats.set(id, format);
}

export interface WireParseResult {
  /** 有 wire format 的 detect 命中（命中后无论 parse 成败都不再走原生路径） */
  matched: boolean;
  tree: ComponentNode | null;
}

/** 供 fetch-tree 调用：按注册顺序探测。防御性容错——detect/parse 抛异常按「未命中/失败」处理。 */
export function parseWithWireFormats(data: unknown): WireParseResult {
  for (const format of wireFormats.values()) {
    try {
      if (!format.detect(data)) continue;
    } catch {
      continue;
    }
    try {
      return { matched: true, tree: format.parse(data) };
    } catch {
      return { matched: true, tree: null };
    }
  }
  return { matched: false, tree: null };
}
```

`packages/runtime/src/index.ts` 末尾追加：

```ts
export * from "./wire.js";
```

- [ ] **Step 4: 运行确认通过**

Run: `cd packages/runtime && npx vitest run src/wire.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/wire.ts packages/runtime/src/wire.test.ts packages/runtime/src/index.ts
git commit -m "feat(runtime): 新增 wire format 扩展点 registerWireFormat"
```

---

### Task 2: fetch-tree 接入 wire 检测（JSON + SSE 双路径）

**Files:**
- Modify: `packages/runtime/src/fetch-tree.ts`
- Test: `packages/runtime/src/fetch-tree.test.ts`（文件末尾追加 describe 块）

**Interfaces:**
- Consumes: `parseWithWireFormats`（Task 1）
- Produces: 无新导出——`fetchComponentTree` 行为扩展（wire format 命中 → 其解析树；未命中 → 原生 `AiRenderResponse.tree`）

- [ ] **Step 1: 写失败测试**（追加到 `fetch-tree.test.ts` 末尾；顶部补充 import）

顶部 import 行改为：

```ts
import { defineRegistry } from "@ai-slot/registry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchComponentTree } from "./fetch-tree.js";
import { registerWireFormat, type WireFormat } from "./wire.js";
```

追加测试（放在文件最后一个 describe 之后）：

```ts
describe("fetchComponentTree — wire format 扩展", () => {
  afterEach(() => vi.unstubAllGlobals());

  const a2uiBody = {
    name: "demo",
    messages: [
      { version: "v1.0", createSurface: { surfaceId: "s" } },
      {
        version: "v1.0",
        updateComponents: {
          surfaceId: "s",
          components: [{ id: "root", component: "hero-banner", props: { title: "t" } }],
        },
      },
    ],
  };

  /** 测试用最小 wire format：识别 messages 包裹，取 id==="root" 的组件。 */
  function fakeA2uiFormat(): WireFormat {
    return {
      detect: (d) => typeof d === "object" && d !== null && "messages" in d,
      parse: (d) => {
        const msgs = (d as { messages: Array<{ updateComponents?: { components: Array<{ id: string; component: string; props?: Record<string, unknown> }> } }> }).messages;
        const root = msgs.find((m) => m.updateComponents)?.updateComponents?.components.find((c) => c.id === "root");
        return root ? { component: root.component, props: root.props } : null;
      },
    };
  }

  it("注册 wire format 后：A2UI 响应被解析并过注册表校验", async () => {
    registerWireFormat("test-a2ui", fakeA2uiFormat());
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(a2uiBody) })));
    const tree = await fetchComponentTree({ src: "/x", registry });
    expect(tree).toEqual({ component: "hero-banner", props: { title: "t" } });
  });

  it("wire 解析结果非法时，注册表校验拦截 → null", async () => {
    registerWireFormat("test-bad", {
      detect: (d) => typeof d === "object" && d !== null && "messages" in d,
      parse: () => ({ component: "no-such-comp" }),
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(a2uiBody) })));
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
  });

  it("未注册任何命中格式时，A2UI 响应走原生路径 → data.tree 不存在 → null", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(a2uiBody) })));
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
  });

  it("SSE 帧：wire format 命中的 skeleton/tree 帧同样生效", async () => {
    registerWireFormat("test-a2ui-sse", fakeA2uiFormat());
    const sse =
      `event: skeleton\ndata: ${JSON.stringify({ messages: [{ version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "hero-banner", props: { title: "" } }] } }] })}\n\n` +
      `event: tree\ndata: ${JSON.stringify(a2uiBody)}\n\n`;
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
    const skeletons: unknown[] = [];
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true, onSkeleton: (s) => skeletons.push(s) });
    expect(skeletons).toEqual([{ component: "hero-banner", props: { title: "" } }]);
    expect(tree).toEqual({ component: "hero-banner", props: { title: "t" } });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/runtime && npx vitest run src/fetch-tree.test.ts`
Expected: 新 describe 的 4 个用例 FAIL（现有用例不受影响仍 PASS）——wire 未接入时 A2UI 走原生路径

- [ ] **Step 3: 实现** `packages/runtime/src/fetch-tree.ts`

import 区追加：

```ts
import { parseWithWireFormats } from "./wire.js";
```

`fetchComponentTree` 与 `readSSE` 之间新增辅助函数：

```ts
/** 已解析 JSON → 组件树：先按注册顺序探测 wire formats，全部未命中走原生 AiRenderResponse。 */
function extractTree(data: unknown): ComponentNode | null {
  const wire = parseWithWireFormats(data);
  if (wire.matched) return wire.tree;
  const body = data as AiRenderResponse;
  return body?.tree ?? null;
}
```

JSON 路径（`const data = (await res.json()) as AiRenderResponse;` 起的两行）替换为：

```ts
    const tree = extractTree((await res.json()) as unknown);
    if (tree && opts.registry && !validateComponentTree(opts.registry, tree).ok) return null;
    return tree;
```

`readSSE` 的 skeleton 分支替换为：

```ts
    if (event === "skeleton") {
      // 骨架帧与终树同样过客户端校验（双保险）；非法骨架按损坏帧跳过
      const skeleton = extractTree(data);
      if (skeleton && !(opts.registry && !validateComponentTree(opts.registry, skeleton).ok)) {
        try {
          opts.onSkeleton?.(skeleton);
        } catch {
          // 回调异常不影响主流程
        }
      }
    } else if (event === "tree") {
      finalTree = extractTree(data);
    }
```

- [ ] **Step 4: 运行确认全部通过**

Run: `cd packages/runtime && npx vitest run`
Expected: PASS（含既有用例——原生路径行为不变）

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/fetch-tree.ts packages/runtime/src/fetch-tree.test.ts
git commit -m "feat(runtime): fetch-tree 接入 wire format 检测（JSON 与 SSE 双路径）"
```

---

### Task 3: @ai-slot/a2ui 包脚手架

**Files:**
- Create: `packages/a2ui/package.json`、`packages/a2ui/tsconfig.json`、`packages/a2ui/vitest.config.ts`、`packages/a2ui/README.md`

**Interfaces:**
- Produces: 包骨架；vitest alias `@ai-slot/registry|runtime|adapter-dom` → 各包源码（后续任务的测试都依赖）

- [ ] **Step 1: 创建 `packages/a2ui/package.json`**

```json
{
  "name": "@ai-slot/a2ui",
  "version": "0.1.0",
  "license": "MIT",
  "description": "A2UI wire-format compatibility for ai-slot: consume A2UI agent endpoints and emit A2UI messages from ai-slot proxies.",
  "keywords": ["a2ui", "generative-ui", "ai", "web-components", "adapter"],
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/iannil/ai-slot-component.git",
    "directory": "packages/a2ui"
  },
  "bugs": "https://github.com/iannil/ai-slot-component/issues",
  "homepage": "https://github.com/iannil/ai-slot-component/tree/master/packages/a2ui#readme",
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "sideEffects": false,
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-slot/registry": "workspace:*"
  },
  "peerDependencies": {
    "@ai-slot/adapter-dom": "workspace:*",
    "@ai-slot/runtime": "workspace:*"
  },
  "devDependencies": {
    "@ai-slot/adapter-dom": "workspace:*",
    "@ai-slot/runtime": "workspace:*",
    "jsdom": "^25.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 创建 `packages/a2ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `packages/a2ui/vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ai-slot/registry": fileURLToPath(new URL("../registry/src/index.ts", import.meta.url)),
      "@ai-slot/runtime": fileURLToPath(new URL("../runtime/src/index.ts", import.meta.url)),
      "@ai-slot/adapter-dom": fileURLToPath(new URL("../adapter-dom/src/index.ts", import.meta.url)),
    },
  },
  test: { environment: "jsdom", passWithNoTests: true },
});
```

- [ ] **Step 4: 创建 `packages/a2ui/README.md`**

```md
# @ai-slot/a2ui

[A2UI](https://github.com/a2ui-project/a2ui) wire-format compatibility for ai-slot.

- **Consume** — parse A2UI `messages` envelopes (v0.9 / v0.9.1 / v1.0) into validated ai-slot component trees: `a2uiWireFormat` / `createA2uiWireFormat({ mappings })`.
- **Produce** — rewrite ai-slot proxy responses (JSON or SSE) as A2UI messages: `withA2uiOutput(handler, { surfaceId })`.
- **Basic Catalog** — ready-made tables for the 18 standard A2UI components: `basicCatalogDomDefs` (rendering) and `basicCatalogComponentDefs` (validation).

All parsing failures degrade to `null` — the host `<ai-slot>` silently keeps its fallback content. See the root README for the full picture.
```

- [ ] **Step 5: 安装并验证骨架**

Run: `pnpm install && cd packages/a2ui && npx vitest run`
Expected: `passWithNoTests` 生效，退出码 0

- [ ] **Step 6: 提交**

```bash
git add packages/a2ui/package.json packages/a2ui/tsconfig.json packages/a2ui/vitest.config.ts packages/a2ui/README.md pnpm-lock.yaml
git commit -m "chore(a2ui): 新建 @ai-slot/a2ui 包脚手架"
```

---

### Task 4: 信封类型 + 邻接表转换 + 官方 fixtures

**Files:**
- Create: `packages/a2ui/src/types.ts`、`packages/a2ui/src/adjacency.ts`、`packages/a2ui/src/index.ts`
- Create: `packages/a2ui/src/fixtures/simple-text.json`、`row-layout.json`、`confirmation-v0.9.json`（官方原样）
- Test: `packages/a2ui/src/adjacency.test.ts`

**Interfaces:**
- Consumes: `ComponentNode`（registry）
- Produces: `A2uiMessage`/`A2uiComponent` 类型；`adjacencyToTree(components: A2uiComponent[]): ComponentNode | null`（Task 5 消费）

- [ ] **Step 1: 下载官方 fixtures（原样，不做任何修改）**

```bash
mkdir -p packages/a2ui/src/fixtures
curl -s "https://raw.githubusercontent.com/a2ui-project/a2ui/main/catalogs/basic/v1/examples/00_simple-text.json" -o packages/a2ui/src/fixtures/simple-text.json
curl -s "https://raw.githubusercontent.com/a2ui-project/a2ui/main/catalogs/basic/v1/examples/00_row-layout.json" -o packages/a2ui/src/fixtures/row-layout.json
curl -s "https://raw.githubusercontent.com/a2ui-project/a2ui/main/samples/community/agent/adk/gemini_enterprise/v0_9/examples/0.9/confirmation.json" -o packages/a2ui/src/fixtures/confirmation-v0.9.json
python3 -c "import json; [json.load(open(f'packages/a2ui/src/fixtures/{n}.json')) for n in ['simple-text','row-layout','confirmation-v0.9']]; print('fixtures OK')"
```

Expected: `fixtures OK`

- [ ] **Step 2: 写失败测试** `packages/a2ui/src/adjacency.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { adjacencyToTree } from "./adjacency.js";

describe("adjacencyToTree", () => {
  it("正常转换：根、children、props 提取", () => {
    const tree = adjacencyToTree([
      { id: "a", component: "Row", children: ["b"], justify: "spaceBetween" },
      { id: "b", component: "Text", text: "hi" },
    ]);
    expect(tree).toEqual({
      component: "Row",
      props: { justify: "spaceBetween" },
      children: [{ component: "Text", props: { text: "hi" } }],
    });
  });

  it("空列表 → null", () => {
    expect(adjacencyToTree([])).toBeNull();
  });

  it("重复 id → null", () => {
    expect(adjacencyToTree([
      { id: "a", component: "Text" },
      { id: "a", component: "Text" },
    ])).toBeNull();
  });

  it("孤儿引用 → null", () => {
    expect(adjacencyToTree([{ id: "a", component: "Row", children: ["ghost"] }])).toBeNull();
  });

  it("环 → null", () => {
    expect(adjacencyToTree([
      { id: "a", component: "Row", children: ["b"] },
      { id: "b", component: "Row", children: ["a"] },
    ])).toBeNull();
  });

  it("自引用 → null", () => {
    expect(adjacencyToTree([{ id: "a", component: "Row", children: ["a"] }])).toBeNull();
  });

  it("多父引用（同一 id 被两个 children 引用）→ null（树语义）", () => {
    expect(adjacencyToTree([
      { id: "p1", component: "Row", children: ["shared"] },
      { id: "p2", component: "Row", children: ["shared"] },
      { id: "shared", component: "Text" },
    ])).toBeNull();
  });

  it("多根 → null", () => {
    expect(adjacencyToTree([
      { id: "a", component: "Text" },
      { id: "b", component: "Text" },
    ])).toBeNull();
  });

  it("id/component 缺失或非字符串 → null", () => {
    expect(adjacencyToTree([{ component: "Text" } as never])).toBeNull();
    expect(adjacencyToTree([{ id: 3, component: "Text" } as never])).toBeNull();
    expect(adjacencyToTree([{ id: "a" } as never])).toBeNull();
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `cd packages/a2ui && npx vitest run src/adjacency.test.ts`
Expected: FAIL，`Cannot find module './adjacency.js'`

- [ ] **Step 4: 实现**

`packages/a2ui/src/types.ts`：

```ts
/** A2UI 信封类型（宽松）：只声明本包消费的字段。v0.9 / v0.9.1 / v1.0 信封结构一致，version 不做强校验。 */

export interface A2uiCreateSurface {
  surfaceId: string;
  catalogId?: string;
}

/** 邻接表组件：id + component + children 引用 + 自有 props（text/url/variant…、action、{path} 绑定等）。 */
export interface A2uiComponent {
  id: string;
  component: string;
  children?: string[];
  [key: string]: unknown;
}

export interface A2uiUpdateComponents {
  surfaceId: string;
  components: A2uiComponent[];
}

export interface A2uiDeleteSurface {
  surfaceId: string;
}

export interface A2uiMessage {
  version?: string;
  createSurface?: A2uiCreateSurface;
  updateComponents?: A2uiUpdateComponents;
  deleteSurface?: A2uiDeleteSurface;
  /** updateDataModel 等本包不消费的消息类型原样保留 */
  [key: string]: unknown;
}
```

`packages/a2ui/src/adjacency.ts`：

```ts
import type { ComponentNode } from "@ai-slot/registry";
import type { A2uiComponent } from "./types.js";

/**
 * 邻接表 → 嵌套树。违反任一规则整体判 null（调用方静默兜底）：
 * 恰好一个根；孤儿引用 / 重复 id / 环 / 多父引用（树语义）/ 非法 id → null。
 * 节点数与深度上限不在本层实现——转换结果交由 validateComponentTree 统一把关。
 */
export function adjacencyToTree(components: A2uiComponent[]): ComponentNode | null {
  if (!Array.isArray(components) || components.length === 0) return null;
  const byId = new Map<string, A2uiComponent>();
  for (const comp of components) {
    if (typeof comp?.id !== "string" || typeof comp?.component !== "string" || byId.has(comp.id)) return null;
    byId.set(comp.id, comp);
  }
  const referenced = new Set<string>();
  for (const comp of components) {
    for (const child of Array.isArray(comp.children) ? comp.children : []) {
      if (typeof child !== "string" || !byId.has(child) || referenced.has(child)) return null;
      referenced.add(child);
    }
  }
  const roots = components.filter((comp) => !referenced.has(comp.id));
  if (roots.length !== 1) return null;
  const build = (id: string, path: Set<string>): ComponentNode | null => {
    if (path.has(id)) return null; // 环
    const comp = byId.get(id)!;
    const next = new Set(path).add(id);
    const children: ComponentNode[] = [];
    for (const child of Array.isArray(comp.children) ? comp.children : []) {
      const node = build(child, next);
      if (!node) return null;
      children.push(node);
    }
    const { id: _id, component, children: _children, ...props } = comp;
    return {
      component,
      ...(Object.keys(props).length > 0 ? { props } : {}),
      ...(children.length > 0 ? { children } : {}),
    };
  };
  return build(roots[0].id, new Set());
}
```

`packages/a2ui/src/index.ts`（随任务增量扩充）：

```ts
export * from "./types.js";
export * from "./adjacency.js";
```

- [ ] **Step 5: 运行确认通过**

Run: `cd packages/a2ui && npx vitest run src/adjacency.test.ts`
Expected: PASS（9 个用例）

- [ ] **Step 6: 提交**

```bash
git add packages/a2ui/src/types.ts packages/a2ui/src/adjacency.ts packages/a2ui/src/adjacency.test.ts packages/a2ui/src/index.ts packages/a2ui/src/fixtures
git commit -m "feat(a2ui): 信封类型与邻接表→嵌套树转换（含官方 fixtures）"
```

---

### Task 5: 消费侧 wire format（detect / parse / 改名 / 降级）

**Files:**
- Create: `packages/a2ui/src/wire.ts`
- Modify: `packages/a2ui/src/index.ts`（追加导出）
- Test: `packages/a2ui/src/wire.test.ts`

**Interfaces:**
- Consumes: `adjacencyToTree`（Task 4）、`WireFormat`（Task 1，type-only）
- Produces: `detectA2ui(data: unknown): boolean`、`parseA2ui(data: unknown, opts?): ComponentNode | null`、`a2uiWireFormat: WireFormat`、`createA2uiWireFormat(opts?: { mappings?: Record<string, string> }): WireFormat`（Task 7、8 消费）

- [ ] **Step 1: 写失败测试** `packages/a2ui/src/wire.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectA2ui, parseA2ui } from "./wire.js";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

describe("detectA2ui", () => {
  it("官方 fixture（messages 包裹）命中", () => {
    expect(detectA2ui(fixture("simple-text"))).toBe(true);
    expect(detectA2ui(fixture("confirmation-v0.9"))).toBe(true);
  });
  it("裸信封数组与单个信封对象命中", () => {
    expect(detectA2ui([{ version: "v1.0", createSurface: { surfaceId: "s" } }])).toBe(true);
    expect(detectA2ui({ version: "v1.0", updateComponents: { surfaceId: "s", components: [] } })).toBe(true);
  });
  it("原生 AiRenderResponse 永不命中（结构不重叠）", () => {
    expect(detectA2ui({ version: 1, slot: "hero", tree: { component: "x" } })).toBe(false);
    expect(detectA2ui({ version: 1, slot: "hero" })).toBe(false);
  });
  it("非对象 / 空 messages / 缺组件键不命中", () => {
    expect(detectA2ui(null)).toBe(false);
    expect(detectA2ui("x")).toBe(false);
    expect(detectA2ui({ messages: [] })).toBe(true); // messages 键存在即命中，交给 parse 判空兜底
    expect(detectA2ui({ name: "x" })).toBe(false);
  });
});

describe("parseA2ui", () => {
  it("simple-text fixture：单 Text 节点，markdown 文本原样", () => {
    expect(parseA2ui(fixture("simple-text"))).toEqual({
      component: "Text",
      props: { text: "# Hello, Minimal Catalog!" },
    });
  });

  it("row-layout fixture：根 Row 携带两个 Text 子节点与布局 props", () => {
    expect(parseA2ui(fixture("row-layout"))).toEqual({
      component: "Row",
      props: { justify: "spaceBetween", align: "center" },
      children: [
        { component: "Text", props: { text: "Left Content", variant: "body" } },
        { component: "Text", props: { text: "Right Content", variant: "caption" } },
      ],
    });
  });

  it("v0.9 confirmation fixture：mappings 改名 + {path} 绑定降级为 prop 缺失", () => {
    const tree = parseA2ui(fixture("confirmation-v0.9"), {
      mappings: { MaterialCard: "card", MaterialColumn: "column", MaterialText: "Text", MaterialImage: "Image", MaterialDivider: "Divider" },
    });
    expect(tree).not.toBeNull();
    expect(tree!.component).toBe("card"); // 根为 MaterialCard
    // data model 绑定被剥掉：树里不应存在 { path: ... } 形态
    const dump = JSON.stringify(tree);
    expect(dump).not.toContain('"path"');
  });

  it("action 字段被丢弃（交互降级）", () => {
    const tree = parseA2ui({
      version: "v1.0",
      updateComponents: {
        surfaceId: "s",
        components: [{ id: "root", component: "Button", label: "Go", action: { name: "submit" } }],
      },
    });
    expect(tree).toEqual({ component: "Button", props: { label: "Go" } });
  });

  it("同 id 组件后帧覆盖（增量合并）", () => {
    const tree = parseA2ui([
      { version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Text", text: "旧" }] } },
      { version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Text", text: "新" }] } },
    ]);
    expect(tree).toEqual({ component: "Text", props: { text: "新" } });
  });

  it("deleteSurface 指向所选 surface → null（内容被撤）", () => {
    expect(parseA2ui([
      { version: "v1.0", createSurface: { surfaceId: "s" } },
      { version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Text" }] } },
      { version: "v1.0", deleteSurface: { surfaceId: "s" } },
    ])).toBeNull();
  });

  it("多 surface：取首个 createSurface，其余忽略", () => {
    const tree = parseA2ui([
      { version: "v1.0", createSurface: { surfaceId: "s1" } },
      { version: "v1.0", createSurface: { surfaceId: "s2" } },
      { version: "v1.0", updateComponents: { surfaceId: "s1", components: [{ id: "root", component: "Text", text: "一" }] } },
      { version: "v1.0", updateComponents: { surfaceId: "s2", components: [{ id: "root", component: "Text", text: "二" }] } },
    ]);
    expect(tree).toEqual({ component: "Text", props: { text: "一" } });
  });

  it("空 messages / 无 updateComponents / 非法邻接表 → null", () => {
    expect(parseA2ui({ messages: [] })).toBeNull();
    expect(parseA2ui([{ version: "v1.0", createSurface: { surfaceId: "s" } }])).toBeNull();
    expect(parseA2ui([{ version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "a", component: "Row", children: ["ghost"] }] } }])).toBeNull();
  });

  it("mappings 未命中的名字保留原样", () => {
    const tree = parseA2ui({
      version: "v1.0",
      updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Card" }] },
    });
    expect(tree).toEqual({ component: "Card" });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/a2ui && npx vitest run src/wire.test.ts`
Expected: FAIL，`Cannot find module './wire.js'`

- [ ] **Step 3: 实现** `packages/a2ui/src/wire.ts`

```ts
import type { ComponentNode } from "@ai-slot/registry";
import type { WireFormat } from "@ai-slot/runtime";
import { adjacencyToTree } from "./adjacency.js";
import type { A2uiComponent, A2uiMessage } from "./types.js";

export interface A2uiWireOptions {
  /** A2UI 组件名 → 注册表组件名。优先级最高；未命中的名字保留原样（交给渲染器 defs 表）。 */
  mappings?: Record<string, string>;
}

function isEnvelope(m: unknown): m is A2uiMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    ("createSurface" in m || "updateComponents" in m || "deleteSurface" in m || "updateDataModel" in m)
  );
}

/**
 * 结构检测：messages 包裹对象、信封数组、单个信封对象均可。
 * 判据与原生 AiRenderResponse {version:1, slot, tree} 结构不重叠（有专项测试钉死）。
 */
export function detectA2ui(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  if ("messages" in data) return Array.isArray((data as { messages: unknown }).messages);
  if (Array.isArray(data)) return data.length > 0 && data.every(isEnvelope);
  return isEnvelope(data);
}

/** 抽取消息列表：兼容 {name, description, messages} 包裹、裸数组、单信封。 */
function extractMessages(data: unknown): A2uiMessage[] | null {
  if (typeof data !== "object" || data === null) return null;
  if ("messages" in data) {
    const msgs = (data as { messages: unknown }).messages;
    return Array.isArray(msgs) && msgs.every(isEnvelope) ? (msgs as A2uiMessage[]) : null;
  }
  if (Array.isArray(data)) return data.every(isEnvelope) ? (data as A2uiMessage[]) : null;
  return isEnvelope(data) ? [data as A2uiMessage] : null;
}

/** 解析 A2UI 输出为组件树。任何结构异常返回 null（调用方静默兜底）。 */
export function parseA2ui(data: unknown, opts: A2uiWireOptions = {}): ComponentNode | null {
  const messages = extractMessages(data);
  if (!messages || messages.length === 0) return null;
  const firstSurfaceId = messages.find((m) => m.createSurface)?.createSurface?.surfaceId;
  let components: A2uiComponent[] | null = null;
  const index = new Map<string, number>();
  for (const message of messages) {
    const del = message.deleteSurface;
    // deleteSurface 指向所选 surface：内容被撤 → null 兜底
    if (del && (firstSurfaceId === undefined || del.surfaceId === firstSurfaceId)) return null;
    const update = message.updateComponents;
    if (!update) continue;
    // 取首个 surface，其余忽略
    if (firstSurfaceId !== undefined && update.surfaceId !== firstSurfaceId) continue;
    components ??= [];
    for (const comp of Array.isArray(update.components) ? update.components : []) {
      const at = typeof comp?.id === "string" ? index.get(comp.id) : undefined;
      if (at === undefined) {
        if (typeof comp?.id === "string") index.set(comp.id, components.push(comp) - 1);
        else components.push(comp); // 非法 id 交给 adjacencyToTree 判 null
      } else {
        components[at] = comp; // 同 id 后帧覆盖
      }
    }
  }
  if (!components) return null;
  const tree = adjacencyToTree(components);
  if (!tree) return null;
  return rewriteTree(tree, opts.mappings ?? {});
}

/** 名字改写 + 属性降级：mappings 改名；action 丢弃；{path} 绑定视为 prop 缺失（required 缺失由 validator 拒绝）。 */
function rewriteTree(node: ComponentNode, mappings: Record<string, string>): ComponentNode {
  const cleaned = cleanProps(node.props);
  return {
    component: mappings[node.component] ?? node.component,
    ...(cleaned ? { props: cleaned } : {}),
    ...(node.children?.length ? { children: node.children.map((c) => rewriteTree(c, mappings)) } : {}),
    ...(node.slots ? { slots: node.slots } : {}),
  };
}

function cleanProps(props: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "action") continue; // 交互降级：内容槽位无 agent 回程
    if (isPathBinding(value)) continue; // 绑定降级：数据模型在内容槽位无意义
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isPathBinding(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "path" in value;
}

/** 免配置默认实例。导入方自行 registerWireFormat("a2ui", a2uiWireFormat)——本包不隐式注册。 */
export const a2uiWireFormat: WireFormat = {
  detect: detectA2ui,
  parse: (data) => parseA2ui(data),
};

/** 带配置（mappings）的工厂。 */
export function createA2uiWireFormat(opts: A2uiWireOptions = {}): WireFormat {
  return { detect: detectA2ui, parse: (data) => parseA2ui(data, opts) };
}
```

`packages/a2ui/src/index.ts` 改为：

```ts
export * from "./types.js";
export * from "./adjacency.js";
export * from "./wire.js";
```

- [ ] **Step 4: 运行确认通过**

Run: `cd packages/a2ui && npx vitest run src/wire.test.ts`
Expected: PASS（全部用例；如 fixture 断言与官方文件实际字段有出入，以 fixture 实际内容为准修正断言——fixture 本体永不可改）

- [ ] **Step 5: 提交**

```bash
git add packages/a2ui/src/wire.ts packages/a2ui/src/wire.test.ts packages/a2ui/src/index.ts
git commit -m "feat(a2ui): 消费侧 wire format（信封解析/增量合并/改名/绑定与交互降级）"
```

---

### Task 6: Basic Catalog 双侧静态表

**Files:**
- Create: `packages/a2ui/src/catalog.ts`
- Modify: `packages/a2ui/src/index.ts`（追加 `export * from "./catalog.js";`）
- Test: `packages/a2ui/src/catalog.test.ts`

**Interfaces:**
- Consumes: `DomComponentDef`（adapter-dom，type-only）、`ComponentDefInput`（registry）
- Produces: `basicCatalogDomDefs: Record<string, DomComponentDef>`、`basicCatalogComponentDefs: Record<string, ComponentDefInput>`（Task 8 与文档消费）

- [ ] **Step 1: 写失败测试** `packages/a2ui/src/catalog.test.ts`

```ts
import { defineRegistry, validateComponentTree } from "@ai-slot/registry";
import { createDomRenderer, type DomComponentDef } from "@ai-slot/adapter-dom";
import { describe, expect, it } from "vitest";
import { basicCatalogComponentDefs, basicCatalogDomDefs } from "./catalog.js";

const ALL = ["Text", "Image", "Icon", "Video", "AudioPlayer", "Row", "Column", "List", "Card", "Tabs", "Divider", "Modal", "Button", "CheckBox", "TextField", "DateTimeInput", "ChoicePicker", "Slider"] as const;

const TAGS: Record<(typeof ALL)[number], string> = {
  Text: "P", Image: "IMG", Icon: "SPAN", Video: "VIDEO", AudioPlayer: "AUDIO",
  Row: "DIV", Column: "DIV", List: "UL", Card: "DIV", Tabs: "DIV",
  Divider: "HR", Modal: "DIV", Button: "BUTTON", CheckBox: "LABEL",
  TextField: "INPUT", DateTimeInput: "INPUT", ChoicePicker: "SELECT", Slider: "INPUT",
};

describe("basicCatalogDomDefs", () => {
  it("覆盖 Basic Catalog 全部 18 个组件，tag 正确", () => {
    const render = createDomRenderer(basicCatalogDomDefs);
    for (const name of ALL) {
      const def: DomComponentDef = basicCatalogDomDefs[name];
      expect(def, name).toBeTruthy();
      const el = render({ component: name, props: {} }, { children: [], slots: {} });
      expect(el?.tagName, name).toBe(TAGS[name]);
    }
  });

  it("Text 用 textContent 写入（禁止 innerHTML）", () => {
    const render = createDomRenderer(basicCatalogDomDefs);
    const el = render({ component: "Text", props: { text: "<b>x</b>" } }, { children: [], slots: {} });
    expect(el?.textContent).toBe("<b>x</b>");
    expect(el?.innerHTML).not.toContain("<b>");
  });

  it("Image 写入 src/alt", () => {
    const render = createDomRenderer(basicCatalogDomDefs);
    const el = render({ component: "Image", props: { url: "https://x/y.png", alt: "图" } }, { children: [], slots: {} });
    expect(el?.getAttribute("src")).toBe("https://x/y.png");
    expect(el?.getAttribute("alt")).toBe("图");
  });

  it("Button 是静态形态：type=button，无任何事件绑定", () => {
    const render = createDomRenderer(basicCatalogDomDefs);
    const el = render({ component: "Button", props: {} }, { children: [], slots: {} });
    expect(el?.getAttribute("type")).toBe("button");
  });

  it("类名一律 a2ui- 前缀", () => {
    for (const def of Object.values(basicCatalogDomDefs)) {
      if (def.class) expect(def.class.startsWith("a2ui-"), def.class).toBe(true);
    }
  });
});

describe("basicCatalogComponentDefs", () => {
  it("与同名 DomComponentDefs 键集合一致（18 个）", () => {
    expect(Object.keys(basicCatalogComponentDefs).sort()).toEqual(Object.keys(basicCatalogDomDefs).sort());
  });

  it("布局容器的 children 过得了注册表校验（default 槽位声明）", () => {
    const registry = defineRegistry({ components: basicCatalogComponentDefs });
    expect(validateComponentTree(registry, {
      component: "Row",
      props: { justify: "spaceBetween" },
      children: [{ component: "Text", props: { text: "x" } }],
    }).ok).toBe(true);
  });

  it("全部无 required（宽松校验侧）", () => {
    for (const def of Object.values(basicCatalogComponentDefs)) {
      expect(def.required ?? []).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/a2ui && npx vitest run src/catalog.test.ts`
Expected: FAIL，`Cannot find module './catalog.js'`

- [ ] **Step 3: 实现** `packages/a2ui/src/catalog.ts`

```ts
import type { ComponentDefInput } from "@ai-slot/registry";
import type { DomComponentDef } from "@ai-slot/adapter-dom";

/**
 * Basic Catalog 18 组件的 DOM 定义（渲染侧）。零样式假设：类名仅作为用户 CSS 挂钩。
 * 用法：createDomRenderer({ ...basicCatalogDomDefs, ...myBrandDefs })
 */
export const basicCatalogDomDefs: Record<string, DomComponentDef> = {
  Text: {
    tag: "p",
    applyProps: (el, props) => {
      if (typeof props.text === "string") el.textContent = props.text;
    },
  },
  Image: {
    tag: "img",
    applyProps: (el, props) => {
      if (typeof props.url === "string") el.setAttribute("src", props.url);
      if (typeof props.alt === "string") el.setAttribute("alt", props.alt);
    },
  },
  Icon: {
    tag: "span",
    class: "a2ui-icon",
    applyProps: (el, props) => {
      if (typeof props.name === "string") el.dataset.icon = props.name;
    },
  },
  Video: {
    tag: "video",
    class: "a2ui-video",
    applyProps: (el, props) => {
      if (typeof props.url === "string") el.setAttribute("src", props.url);
      el.setAttribute("controls", "");
    },
  },
  AudioPlayer: {
    tag: "audio",
    class: "a2ui-audio",
    applyProps: (el, props) => {
      if (typeof props.url === "string") el.setAttribute("src", props.url);
      el.setAttribute("controls", "");
    },
  },
  Row: { tag: "div", class: "a2ui-row" },
  Column: { tag: "div", class: "a2ui-column" },
  List: { tag: "ul", class: "a2ui-list" },
  Card: { tag: "div", class: "a2ui-card" },
  Tabs: { tag: "div", class: "a2ui-tabs" },
  Divider: { tag: "hr" },
  Modal: { tag: "div", class: "a2ui-modal" },
  Button: {
    tag: "button",
    class: "a2ui-button",
    // action 已在解析层丢弃：内容槽位中是静态形态
    applyProps: (el) => el.setAttribute("type", "button"),
  },
  CheckBox: { tag: "label", class: "a2ui-checkbox" },
  TextField: {
    tag: "input",
    class: "a2ui-input",
    applyProps: (el) => el.setAttribute("type", "text"),
  },
  DateTimeInput: {
    tag: "input",
    class: "a2ui-input",
    applyProps: (el) => el.setAttribute("type", "datetime-local"),
  },
  ChoicePicker: { tag: "select", class: "a2ui-choice" },
  Slider: {
    tag: "input",
    class: "a2ui-slider",
    applyProps: (el) => el.setAttribute("type", "range"),
  },
};

/**
 * 同名组件的宽松注册表定义（校验侧）。全部 props 可选、无 required。
 * 没有它，客户端双保险校验会用用户自己的 registry 拒掉未映射的基础组件名。
 * 布局容器必须声明 slots: ["default"]，children 才能过校验。
 * 用法：defineRegistry({ components: { ...basicCatalogComponentDefs, ...myComponents } })
 */
export const basicCatalogComponentDefs: Record<string, ComponentDefInput> = {
  Text: { description: "A2UI basic catalog: text", props: { text: "string", variant: "string", usageHint: "string" } },
  Image: { description: "A2UI basic catalog: image", props: { url: "string", alt: "string", fit: "string" } },
  Icon: { description: "A2UI basic catalog: icon", props: { name: "string" } },
  Video: { description: "A2UI basic catalog: video", props: { url: "string" } },
  AudioPlayer: { description: "A2UI basic catalog: audio", props: { url: "string" } },
  Row: { description: "A2UI basic catalog: horizontal layout", props: { justify: "string", align: "string" }, slots: ["default"] },
  Column: { description: "A2UI basic catalog: vertical layout", props: { align: "string" }, slots: ["default"] },
  List: { description: "A2UI basic catalog: list", slots: ["default"] },
  Card: { description: "A2UI basic catalog: card container", slots: ["default"] },
  Tabs: { description: "A2UI basic catalog: tabs", slots: ["default"] },
  Divider: { description: "A2UI basic catalog: divider", props: { axis: "string" } },
  Modal: { description: "A2UI basic catalog: modal", slots: ["default"] },
  Button: { description: "A2UI basic catalog: button (static in content slots)", props: { label: "string", variant: "string" }, slots: ["default"] },
  CheckBox: { description: "A2UI basic catalog: checkbox", props: { label: "string" } },
  TextField: { description: "A2UI basic catalog: text field", props: { label: "string", value: "string", placeholder: "string" } },
  DateTimeInput: { description: "A2UI basic catalog: date/time input", props: { label: "string" } },
  ChoicePicker: { description: "A2UI basic catalog: choice picker", props: { label: "string" }, slots: ["default"] },
  Slider: { description: "A2UI basic catalog: slider", props: { min: "number", max: "number", value: "number" } },
};
```

`packages/a2ui/src/index.ts` 追加一行：

```ts
export * from "./catalog.js";
```

- [ ] **Step 4: 运行确认通过**

Run: `cd packages/a2ui && npx vitest run src/catalog.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/a2ui/src/catalog.ts packages/a2ui/src/catalog.test.ts packages/a2ui/src/index.ts
git commit -m "feat(a2ui): Basic Catalog 双侧静态表（DOM 渲染 defs + 注册表校验 defs）"
```

---

### Task 7: 生产侧 toA2uiMessages + withA2uiOutput

**Files:**
- Create: `packages/a2ui/src/output.ts`
- Modify: `packages/a2ui/src/index.ts`（追加 `export * from "./output.js";`）
- Test: `packages/a2ui/src/output.test.ts`

**Interfaces:**
- Consumes: `ComponentNode`/`AiRenderResponse`（registry）、`parseA2ui`（Task 5，仅测试）
- Produces: `toA2uiMessages(tree, opts): A2uiMessage[]`、`withA2uiOutput(handler, opts): (req: Request) => Promise<Response>`（Task 8 与文档消费）

- [ ] **Step 1: 写失败测试** `packages/a2ui/src/output.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { ComponentNode } from "@ai-slot/registry";
import { parseA2ui } from "./wire.js";
import { toA2uiMessages, withA2uiOutput } from "./output.js";

const tree: ComponentNode = {
  component: "Row",
  props: { justify: "spaceBetween" },
  children: [
    { component: "Text", props: { text: "a" } },
    { component: "Image", props: { url: "u" } },
  ],
};

describe("toA2uiMessages", () => {
  it("产出 [createSurface, updateComponents]，邻接表 children 引用正确", () => {
    const messages = toA2uiMessages(tree, { surfaceId: "s1" });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ version: "v1.0", createSurface: { surfaceId: "s1" } });
    const update = messages[1].updateComponents!;
    expect(update.surfaceId).toBe("s1");
    const row = update.components.find((c) => c.component === "Row")!;
    expect(row.children).toHaveLength(2);
    expect(update.components.filter((c) => c.component === "Text")).toHaveLength(1);
  });

  it("includeSurface: false 只产出 updateComponents", () => {
    const messages = toA2uiMessages(tree, { surfaceId: "s1", includeSurface: false });
    expect(messages).toHaveLength(1);
    expect(messages[0].updateComponents).toBeTruthy();
  });

  it("往返等价：tree → A2UI messages → parseA2ui → tree", () => {
    const messages = toA2uiMessages(tree, { surfaceId: "s1" });
    expect(parseA2ui(messages)).toEqual(tree);
  });
});

describe("withA2uiOutput", () => {
  const handler = (body: unknown, contentType = "application/json"): ((req: Request) => Promise<Response>) =>
    async () => new Response(JSON.stringify(body), { headers: { "content-type": contentType } });

  const aiResponse = { version: 1, slot: "hero", tree };

  it("JSON 响应体重写为 A2UI messages，状态与 content-type 保留", async () => {
    const wrapped = withA2uiOutput(handler(aiResponse), { surfaceId: "s1" });
    const res = await wrapped(new Request("https://x/ai-render/hero"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const messages = (await res.json()) as Array<Record<string, unknown>>;
    expect(messages[0]).toEqual({ version: "v1.0", createSurface: { surfaceId: "s1" } });
    expect(messages[1].updateComponents).toBeTruthy();
  });

  it("非 JSON 响应原样透传", async () => {
    const wrapped = withA2uiOutput(handler("plain", "text/plain"), { surfaceId: "s1" });
    const res = await wrapped(new Request("https://x/"));
    expect(await res.text()).toBe('"plain"');
  });

  it("非法 JSON 响应原样透传", async () => {
    const wrapped = withA2uiOutput(async () => new Response("not-json", { headers: { "content-type": "application/json" } }), { surfaceId: "s1" });
    const res = await wrapped(new Request("https://x/"));
    expect(await res.text()).toBe("not-json");
  });

  it("SSE：skeleton 帧带 createSurface，tree 帧只发 updateComponents，event 名不变", async () => {
    const sse =
      `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: { component: "Text", props: { text: "" } } })}\n\n` +
      `event: tree\ndata: ${JSON.stringify(aiResponse)}\n\n`;
    const wrapped = withA2uiOutput(async () => new Response(sse, { headers: { "content-type": "text/event-stream" } }), { surfaceId: "s1" });
    const res = await wrapped(new Request("https://x/ai-render/hero"));
    const text = await res.text();
    const frames = text.split("\n\n").filter(Boolean);
    expect(frames).toHaveLength(2);
    expect(frames[0].startsWith("event: skeleton")).toBe(true);
    const skeleton = JSON.parse(frames[0].match(/^data: (.+)$/m)![1]) as Array<Record<string, unknown>>;
    expect(skeleton).toHaveLength(2); // createSurface + updateComponents
    expect(frames[1].startsWith("event: tree")).toBe(true);
    const final = JSON.parse(frames[1].match(/^data: (.+)$/m)![1]) as Array<Record<string, unknown>>;
    expect(final).toHaveLength(1); // 仅 updateComponents
    expect(final[0].updateComponents).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/a2ui && npx vitest run src/output.test.ts`
Expected: FAIL，`Cannot find module './output.js'`

- [ ] **Step 3: 实现** `packages/a2ui/src/output.ts`

```ts
import type { AiRenderResponse, ComponentNode } from "@ai-slot/registry";
import type { A2uiMessage } from "./types.js";

export interface ToA2uiOptions {
  surfaceId: string;
  /** 默认 "v1.0" */
  version?: string;
  /** false 时只产出 updateComponents（SSE 后续帧用），默认 true */
  includeSurface?: boolean;
}

/** 嵌套树 → A2UI messages。id 自动生成（n0、n1…）；命名槽位内容按序并入 children。 */
export function toA2uiMessages(tree: ComponentNode, opts: ToA2uiOptions): A2uiMessage[] {
  const version = opts.version ?? "v1.0";
  const components: Array<{ id: string; component: string; children?: string[] } & Record<string, unknown>> = [];
  let counter = 0;
  const flatten = (node: ComponentNode): string => {
    const id = `n${counter++}`;
    const childIds = [...(node.children ?? []), ...Object.values(node.slots ?? {}).flat()].map(flatten);
    components.push({
      id,
      component: node.component,
      ...(childIds.length > 0 ? { children: childIds } : {}),
      ...(node.props ?? {}),
    });
    return id;
  };
  flatten(tree);
  const messages: A2uiMessage[] = [];
  if (opts.includeSurface !== false) {
    messages.push({ version, createSurface: { surfaceId: opts.surfaceId } });
  }
  messages.push({ version, updateComponents: { surfaceId: opts.surfaceId, components } });
  return messages;
}

export interface WithA2uiOutputOptions {
  surfaceId: string;
  version?: string;
}

/**
 * 包住 createAiRenderHandler 的产物：JSON 响应体与 SSE 帧重写为 A2UI messages；其它响应原样透传。
 * proxy 本身零改动——这是「槽位协议可替换」的演示位。
 */
export function withA2uiOutput(
  handler: (req: Request) => Promise<Response>,
  opts: WithA2uiOutputOptions,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      const text = await res.text();
      return new Response(rewriteSse(text, opts), { status: res.status, headers: res.headers });
    }
    if (!contentType.includes("application/json")) return res;
    const body = (await res.json().catch(() => null)) as AiRenderResponse | null;
    if (!isAiRenderResponse(body)) return res;
    const messages = toA2uiMessages(body.tree, { surfaceId: opts.surfaceId, version: opts.version });
    return new Response(JSON.stringify(messages), { status: res.status, headers: res.headers });
  };
}

/** SSE 帧重写：skeleton 帧带 createSurface；tree 帧只发 updateComponents；event 名与帧结构不变。 */
function rewriteSse(text: string, opts: WithA2uiOutputOptions): string {
  const frames = text.split("\n\n").filter((frame) => frame.length > 0);
  const rewritten = frames.map((frame) => {
    const event = frame.match(/^event: (.+)$/m)?.[1];
    const raw = frame.match(/^data: (.+)$/m)?.[1];
    if (!event || !raw) return frame;
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return frame;
    }
    if (!isAiRenderResponse(body)) return frame;
    const messages = toA2uiMessages(body.tree, {
      surfaceId: opts.surfaceId,
      version: opts.version,
      includeSurface: event !== "tree",
    });
    return frame.replace(/^data: .*$/m, `data: ${JSON.stringify(messages)}`);
  });
  const trailing = text.endsWith("\n\n") ? "\n\n" : "";
  return rewritten.join("\n\n") + trailing;
}

function isAiRenderResponse(body: unknown): body is AiRenderResponse {
  return typeof body === "object" && body !== null && "tree" in body && (body as AiRenderResponse).tree != null;
}
```

`packages/a2ui/src/index.ts` 最终为：

```ts
export * from "./types.js";
export * from "./adjacency.js";
export * from "./wire.js";
export * from "./catalog.js";
export * from "./output.js";
```

- [ ] **Step 4: 运行确认通过**

Run: `cd packages/a2ui && npx vitest run`
Expected: PASS（此前所有测试文件一起跑）

- [ ] **Step 5: 提交**

```bash
git add packages/a2ui/src/output.ts packages/a2ui/src/output.test.ts packages/a2ui/src/index.ts
git commit -m "feat(a2ui): 生产侧 toA2uiMessages 与 withA2uiOutput（JSON/SSE 响应重写）"
```

---

### Task 8: runtime 组合集成测试（A2UI 端点 → 校验 → DOM 渲染）

**Files:**
- Create: `packages/a2ui/src/integration.test.ts`

**Interfaces:**
- Consumes: Task 1-7 全部公共导出；`fetchComponentTree`/`renderTree`/`registerWireFormat`（runtime 源码 alias）；`createDomRenderer`（adapter-dom 源码 alias）
- Produces: 端到端语义验证（无新导出）

- [ ] **Step 1: 写测试** `packages/a2ui/src/integration.test.ts`

```ts
import { readFileSync } from "node:fs";
import { defineRegistry } from "@ai-slot/registry";
import { createDomRenderer } from "@ai-slot/adapter-dom";
import { fetchComponentTree, registerWireFormat, renderTree } from "@ai-slot/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { a2uiWireFormat, basicCatalogComponentDefs, basicCatalogDomDefs, createA2uiWireFormat } from "./index.js";

const registry = defineRegistry({ components: basicCatalogComponentDefs });
const rowLayout = JSON.parse(readFileSync(new URL("./fixtures/row-layout.json", import.meta.url), "utf8"));

const stubA2uiResponse = (body: unknown): void => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })));
};

describe("A2UI 端点 → ai-slot 交付层（组合集成）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("未注册 wire format：A2UI 响应走原生路径 → null（兜底语义不被破坏）", async () => {
    stubA2uiResponse(rowLayout);
    expect(await fetchComponentTree({ src: "/ai-render/hero", registry })).toBeNull();
  });

  it("注册 wire 后：官方 fixture → 校验通过 → DOM 渲染出真实元素", async () => {
    registerWireFormat("a2ui", a2uiWireFormat);
    stubA2uiResponse(rowLayout);
    const tree = await fetchComponentTree({ src: "/ai-render/hero", registry });
    expect(tree).not.toBeNull();
    const el = await renderTree(createDomRenderer(basicCatalogDomDefs), tree!);
    expect(el?.className).toBe("a2ui-row");
    expect(el?.children).toHaveLength(2);
    expect(el?.textContent).toContain("Left Content");
  });

  it("mappings 把 A2UI 组件改写为注册表品牌组件并渲染", async () => {
    const brandRegistry = defineRegistry({
      components: { ...basicCatalogComponentDefs, "hero-card": { description: "品牌卡片", slots: ["default"] } },
    });
    registerWireFormat("a2ui-mapped", createA2uiWireFormat({ mappings: { Row: "hero-card" } }));
    stubA2uiResponse(rowLayout);
    const tree = await fetchComponentTree({ src: "/ai-render/hero", registry: brandRegistry });
    expect(tree?.component).toBe("hero-card");
    const el = await renderTree(createDomRenderer({ ...basicCatalogDomDefs, "hero-card": { tag: "section", class: "brand-hero" } }), tree!);
    expect(el?.tagName).toBe("SECTION");
    expect(el?.className).toBe("brand-hero");
  });

  it("注册表里没有的组件名：校验拒绝 → null（静默兜底）", async () => {
    const strictRegistry = defineRegistry({ components: { "hero-card": { description: "", slots: ["default"] } } });
    registerWireFormat("a2ui-strict", a2uiWireFormat);
    stubA2uiResponse(rowLayout); // Row/Text 不在 strictRegistry
    expect(await fetchComponentTree({ src: "/ai-render/hero", registry: strictRegistry })).toBeNull();
  });

  it("超深度链：validator 上限拦截 → null（parse 层不做上限，统一由 validator 把关）", async () => {
    registerWireFormat("a2ui-deep", a2uiWireFormat);
    const deep = {
      version: "v1.0",
      updateComponents: {
        surfaceId: "s",
        components: [
          { id: "n0", component: "Column", children: ["n1"] },
          { id: "n1", component: "Column", children: ["n2"] },
          { id: "n2", component: "Column", children: ["n3"] },
          { id: "n3", component: "Column", children: ["n4"] },
          { id: "n4", component: "Column", children: ["n5"] },
          { id: "n5", component: "Text", text: "底" },
        ],
      },
    };
    stubA2uiResponse(deep); // 树深 6 > 默认 maxDepth 5
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认通过（本任务是纯测试任务，实现已在 Task 1-7 落地；若失败先修测试环境假设，不改被测语义）**

Run: `cd packages/a2ui && npx vitest run src/integration.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 3: 提交**

```bash
git add packages/a2ui/src/integration.test.ts
git commit -m "test(a2ui): runtime 组合集成测试（A2UI 端点→校验→DOM 渲染/兜底）"
```

---

### Task 9: 文档定位内容 + 全链路验证

**Files:**
- Modify: `README.md`、`README.zh-CN.md`、`CLAUDE.md`
- Create: `docs/blog/2026-09-25-a2ui-on-the-existing-web.md`

**Interfaces:**
- Consumes: Task 3-8 的公共导出名（文档示例必须与真实 API 逐字一致）
- Produces: 定位内容落盘；全链路验证记录

- [ ] **Step 1: README.md（EN）新增小节**（插在 `## Features` 之前）

```md
## Protocol-neutral by design

ai-slot separates three layers:

1. **Slot protocol** — the wire format between the AI endpoint and the page. Native JSON today; [A2UI](https://github.com/a2ui-project/a2ui) (Google's open protocol for agent-driven UI) works too via [`@ai-slot/a2ui`](./packages/a2ui).
2. **Delivery runtime** — `<ai-slot>`, client-side re-validation, and the guaranteed fallback.
3. **Lifecycle infrastructure** — two-tier caching, build-time pregeneration, invalidation push, rate limiting.

Any A2UI-compliant agent endpoint can feed an existing page:

```ts
import { defineRegistry } from "@ai-slot/registry";
import { createDomRenderer } from "@ai-slot/adapter-dom";
import { configureAiSlot, registerRenderer, registerWireFormat } from "@ai-slot/runtime";
import { a2uiWireFormat, basicCatalogComponentDefs, basicCatalogDomDefs } from "@ai-slot/a2ui";

const registry = defineRegistry({
  components: { ...basicCatalogComponentDefs /* , your brand components */ },
});
registerWireFormat("a2ui", a2uiWireFormat);
registerRenderer("dom", createDomRenderer(basicCatalogDomDefs));
configureAiSlot({ registry });
```

| | A2UI / AG-UI | ai-slot |
|---|---|---|
| Layer | Wire format for agent ↔ in-app UI (Google / CopilotKit) | Delivery layer for public web content slots — speaks A2UI via `@ai-slot/a2ui` |
| Existing pages | Legacy content isolated in sandboxed iframes | Wraps existing HTML in place, zero rewrite |
| SEO & crawlers | Client-rendered; crawlers see nothing (including Googlebot) | Original content always in the HTML — visible to crawlers and AI search |
| Lifecycle | No server-side component (no cache, prewarm or invalidation) | Two-tier TTL, build-time prewarm, invalidation push, rate limiting |
```

同时更新安装说明行（`> All packages are on npm...`），在 client 包清单中加入 `@ai-slot/a2ui`：

```md
> All packages are on npm as `@ai-slot/*` (currently `0.1.0`): client — `npm install @ai-slot/runtime @ai-slot/adapter-dom` (+ `@ai-slot/a2ui` for A2UI endpoints); server — `npm install @ai-slot/proxy @ai-slot/registry`.
```

- [ ] **Step 2: README.zh-CN.md 同步**（同样位置插入对应中文小节）

```md
## 协议中立的设计

ai-slot 分为三层：

1. **槽位协议** —— AI 端点与页面之间的线格式。原生 JSON 之外，[A2UI](https://github.com/a2ui-project/a2ui)（Google 开源的 agent 驱动 UI 协议）经 [`@ai-slot/a2ui`](./packages/a2ui) 同样可用。
2. **交付运行时** —— `<ai-slot>`、客户端二次校验、保证回退。
3. **生命周期基础设施** —— 双层缓存、构建期预热、失效推送、限流。

任何 A2UI 兼容端点都能喂给存量页面：

（代码示例与英文版相同）

| | A2UI / AG-UI | ai-slot |
|---|---|---|
| 层级 | agent ↔ 应用内 UI 的线格式（Google / CopilotKit） | 公开网页内容槽位的交付层——经 `@ai-slot/a2ui` 说 A2UI |
| 存量页面 | 遗留内容被 iframe 沙箱隔离 | 原地包裹既有 HTML，零改写 |
| SEO 与爬虫 | 客户端渲染，爬虫不可见（包括 Googlebot） | 原始内容永在 HTML 里——爬虫与 AI 搜索可见 |
| 生命周期 | 无服务端组件（无缓存、预热、失效） | 双层 TTL、构建期预热、失效推送、限流 |
```

中文版安装说明做与英文版相同的清单更新。

- [ ] **Step 3: 写博客草稿** `docs/blog/2026-09-25-a2ui-on-the-existing-web.md`

英文，约 1500 词，标题 `A2UI on the existing web: what the protocol doesn't cover`。结构与必备事实（每条引用规范原文或仓库实测）：

1. **引子（写明论点）**：A2UI 把「agent 说 UI」标准化了，这是好事；但它按定位不覆盖存量 Web 的交付问题。这不是批评，是边界。
2. **A2UI 是什么**：声明式组件树、可信目录、"safe like data, expressive like code"；信封 `messages` + `createSurface`/`updateComponents`；引用 v1.0 规范 Transport 一节（HTTP 请求-响应是官方传输之一）。
3. **它结构上不覆盖的四件事**（逐条给证据）：
   - 无服务端组件（规范架构仅 生成→传输→解析→渲染，无缓存/预热/失效）
   - 无 SEO/爬虫概念（客户端渲染；Smart Wrapper 对遗留内容的方案是 iframe 隔离）
   - 面向应用内 GenUI 而非公开内容页（无渐进增强、无兜底内容概念）
   - 无访客级个人化闭环（协议里 UI 由 agent 会话驱动，无 per-slot 访客提示词）
4. **交付层演示**：完整可运行代码（与 README Step 1 示例一致）+ 官方 row-layout fixture 作为响应体的例子。
5. **对比表**：README 同款表格。
6. **收尾**：A2UI 生态越大，「存量 Web 交付层」的必要性越显性；ai-slot 选择兼容而非对抗。
7. **文末标注**：`> Draft — not yet published. Target channels: Hacker News / r/webdev / dev.to.`

- [ ] **Step 4: CLAUDE.md 一致性更新**

「项目概况」中「六个包 + 一个纯 HTML 端到端示例」改为「七个包 + 一个纯 HTML 端到端示例」；架构图改为：

```
registry（协议核心，无依赖）
  ↑ 被下面所有包消费
proxy（服务端）        runtime（客户端 Web Components）
                          ↑
              adapter-dom / adapter-react / adapter-vue
                          ↑
        a2ui（可选兼容层，不反向依赖；接入点见下）
```

「`packages/adapter-*`」条目之后新增条目：

```md
- **`packages/a2ui`** —— 可选兼容层（A2UI wire format ⇄ 组件树，全仓唯一持有 A2UI 知识的包）：消费侧 `createA2uiWireFormat({ mappings })` / `a2uiWireFormat` 经 runtime 的 `registerWireFormat` 接入（信封解析、邻接表→嵌套树、mappings 改名、`{path}` 绑定与 `action` 降级、`deleteSurface` → 兜底）；生产侧 `withA2uiOutput(handler)` 包住 proxy handler 重写 JSON/SSE 响应（proxy 零改动）。Basic Catalog 双侧静态表：`basicCatalogDomDefs`（渲染，零内置 CSS）+ `basicCatalogComponentDefs`（校验，全部可选、容器声明 default 槽位）。官方 fixtures 回放测试，`tree → A2UI → parse → tree` 往返等价锁定。
```

- [ ] **Step 5: 全链路验证**

Run: `pnpm build && pnpm test && pnpm typecheck`
Expected: 全部 PASS/退出码 0（含新包 build/typecheck；typecheck 依赖 dist 类型，build 必须在前）

- [ ] **Step 6: 提交**

```bash
git add README.md README.zh-CN.md CLAUDE.md docs/blog/2026-09-25-a2ui-on-the-existing-web.md
git commit -m "docs: A2UI 兼容层定位内容（README 双语/对比表/博客草稿/CLAUDE.md）"
```

---

## 验收清单（对照 spec §9）

- [ ] `pnpm build && pnpm test && pnpm typecheck` 全绿（a2ui 包纳入全链路）
- [ ] 官方 fixture 作为 `<ai-slot src>` 响应：正常渲染、非法输入兜底、原生响应不受影响（Task 8）
- [ ] `tree → toA2uiMessages → parseA2ui → tree` 往返等价（Task 7）
- [ ] README 双语、博客草稿、CLAUDE.md 落盘且 API 示例与真实导出逐字一致（Task 9）
- [ ] 明确不做项未被触碰：proxy/registry/adapter-* 源码零改动（runtime 仅 wire.ts + fetch-tree 接入）、无 npm 发布、无博客对外发布
