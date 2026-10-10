# AI-SLOT 数据交付 P0a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 不配置 LLM 也能把版本化数据映射为经过校验的组件树，更新已有页面的单个槽位。

**Architecture:** 新增公开 GET 数据入口，保留现有 AI GET/POST 行为。两个入口复用响应格式，缓存 namespace 隔离；数据路径先读版本化快照，再校验、缓存、交付。真实浏览器示例使用现有 runtime 和 DOM adapter。

**Tech Stack:** TypeScript、Vitest 2、Node >=18 Web API、pnpm workspace、现有 Playwright。

**Spec:** [首阶段设计：数据交付子项目](../specs/2026-10-10-ai-slot-phase-one-design.md)

## Global Constraints

- 项目文档与注释使用中文。
- AI 从不输出 HTML；组件树必须通过注册表校验后渲染。
- 保留原始兜底内容，不能把失败结果渲染为页面空白。
- Node >= 18；核心包不新增运行时依赖。
- 官网继续使用 aislot.dev；本次不迁移域名、不部署、不发布 npm。
- 仅修改任务列明文件；不暂存既有研究报告与其他无关未跟踪文件。
- 既有公开 MCP 只读文档，管理型 MCP 仍为规划能力。

执行方式由用户选择，尚未选择前不派生子代理。提交使用精确路径；首次执行先看 git status，已有同文件变更须保留。

---

## 文件与依赖图

| 文件 | 职责 |
|---|---|
| packages/proxy/src/render-response.ts | 现有 JSON 与 SSE 双帧编码 |
| packages/proxy/src/handler.ts | 保留 AI 行为，仅引用共用响应函数 |
| packages/proxy/src/provider.ts | 数据 provider 契约 |
| packages/proxy/src/render-handler.ts | GET 路由、预算、版本缓存、校验 |
| packages/proxy/src/render-handler.test.ts | 输入与失效边界、缓存隔离、超时 |
| packages/proxy/src/provider-prewarm.test.ts | 预热与缓存恢复 |
| packages/proxy/src/index.ts | 导出新入口与类型 |
| examples/plain-html/data-source.mjs | 本地版本化数据读取与映射 |
| examples/plain-html/cms-data.json | 无敏感信息的演示数据 |
| examples/plain-html/data.html | 原页兜底与真实运行时 |
| examples/plain-html/server.mjs | 挂接数据示例路由 |
| examples/plain-html/e2e/data-source.spec.ts | 浏览器局部更新及兜底 |
| packages/proxy/README.md、examples/plain-html/README.md | 新 API 与成本/部署边界 |

Task 1 → Task 2 → Task 3 → Task 4。实现前读原始 SDK 设计与上方首阶段设计，运行 git status。先 `pnpm build` 生成类型依赖；本轮不改 runtime、registry 或缓存存储类型。新入口服务公开内容；namespace 不是鉴权，不可用于私有内容隔离。

### Task 1: 提取响应编码，保持 AI 行为

**Files:**
- Create: `packages/proxy/src/render-response.ts`
- Modify: `packages/proxy/src/handler.ts`（json、sse 函数与 import）
- Test: `packages/proxy/src/handler.test.ts`、`packages/proxy/src/handler-sse.test.ts`（现有行为契约）

**Interfaces:**
- Consumes: `AiRenderResponse`、`deriveSkeleton(response.tree)`，均来自 registry。
- Produces: `json(body:unknown,status:number):Response`、`sse(response:AiRenderResponse):Response`。

- [x] **Step 1: 运行已有特征测试**。

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/handler.test.ts src/handler-sse.test.ts`。
Expected: PASS。此任务是无行为变化提取，不制造无意义的失败断言。

- [x] **Step 2: 创建响应模块**。

```ts
import { deriveSkeleton, type AiRenderResponse } from "@ai-slot/registry";

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function sse(response: AiRenderResponse): Response {
  const skeleton: AiRenderResponse = {
    ...response,
    tree: deriveSkeleton(response.tree),
    meta: { ...response.meta, phase: "skeleton" },
  };
  const body =
    `event: skeleton\ndata: ${JSON.stringify(skeleton)}\n\n` +
    `event: tree\ndata: ${JSON.stringify(response)}\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}
```

- [x] **Step 3: 修改旧 handler**。删除其中两个同名私有函数、移除 deriveSkeleton import，增加：

```ts
import { json, sse } from "./render-response.js";
```

不修改旧缓存 key、提示词清洗、LLM retry 或用量回调。

- [x] **Step 4: 重跑 Step 1 命令**，预期 PASS，既有精确响应断言不改。
- [x] **Step 5: 提交**。

```sh
git add packages/proxy/src/render-response.ts packages/proxy/src/handler.ts
git commit -m "refactor: 共用组件树响应编码"
```

### Task 2: 版本化数据 provider 与受控 GET 入口

**Files:**
- Create: `packages/proxy/src/provider.ts`
- Create: `packages/proxy/src/render-handler.ts`
- Create: `packages/proxy/src/render-handler.test.ts`
- Modify: `packages/proxy/src/index.ts`

**Interfaces:**
- Consumes: `SlotSource`（既有 handler 导出的 slotId/originalContent/contentVersion/promptVersion/data）；`MemoryCacheStore`、`lookup`；`validateComponentTree`；Task 1 响应函数。
- Produces: 下列完整类型和 `createRenderHandler(options:RenderHandlerOptions):(req:Request)=>Promise<Response>`。provider 不接受任意请求 URL；只有服务端 resolveSlot 能访问外部数据。

- [x] **Step 1: 创建失败测试文件**。

```ts
import { defineRegistry } from "@ai-slot/registry";
import { describe, expect, it, vi } from "vitest";
import { MemoryCacheStore } from "./cache.js";
import { createRenderHandler } from "./render-handler.js";
import type { ProviderContext } from "./provider.js";

const registry = defineRegistry({ components: {
  hero: { description: "介绍区", props: { title: "string" }, required: ["title"] },
} });
const request = () => new Request("https://example.test/ai-render/hero");
const source = (version = "1") => ({
  slotId: "hero", originalContent: "原文", contentVersion: version,
  data: { title: `标题${version}` },
});
const tree = (title: string) => ({ component: "hero", props: { title } });

function setup() {
  let version = "1";
  const produce = vi.fn(async ({ slot }: ProviderContext) =>
    tree(String(slot.data?.title)));
  const options = {
    registry, registryVersion: "r1", namespace: "public-site",
    provider: { id: "cms-v1", produce },
    resolveSlot: () => source(version),
    now: () => 0,
  };
  return { options, produce, setVersion: (v: string) => { version = v; } };
}

describe("公开数据交付", () => {
  it("无 llm 参数也可返回树；同源版本命中缓存，新版本重新映射", async () => {
    const f = setup();
    const handler = createRenderHandler(f.options);
    expect((await (await handler(request())).json()).tree).toEqual(tree("标题1"));
    await handler(request());
    expect(f.produce).toHaveBeenCalledTimes(1);
    f.setVersion("2");
    expect((await (await handler(request())).json()).tree).toEqual(tree("标题2"));
    expect(f.produce).toHaveBeenCalledTimes(2);
  });

  it("POST 返回 405，不调用 provider", async () => {
    const f = setup();
    const res = await createRenderHandler(f.options)(new Request(request(), { method: "POST" }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
    expect(f.produce).not.toHaveBeenCalled();
  });

  it.each([{ component: "evil" }, tree("x".repeat(10001))])("拒绝非法树并不缓存", async bad => {
    const f = setup();
    const produce = vi.fn(async () => bad);
    const handler = createRenderHandler({ ...f.options, provider: { id: "bad", produce } });
    expect((await handler(request())).status).toBe(503);
    expect((await handler(request())).status).toBe(503);
    expect(produce).toHaveBeenCalledTimes(2);
  });

  it("共享 store 不串 namespace、provider 或 registry 版本", async () => {
    const f = setup();
    const store = new MemoryCacheStore();
    for (const extra of [
      {}, { namespace: "other" }, { registryVersion: "r2" },
      { provider: { id: "other", produce: f.produce } },
    ]) await createRenderHandler({ ...f.options, store, ...extra })(request());
    expect(f.produce).toHaveBeenCalledTimes(4);
  });

  it("源失败、源身份错误和未知槽位不回传缓存", async () => {
    const f = setup();
    const store = new MemoryCacheStore();
    await createRenderHandler({ ...f.options, store })(request());
    for (const resolveSlot of [
      async () => { throw Error("source down"); },
      async () => ({ ...source(), slotId: "wrong" }),
    ]) expect((await createRenderHandler({ ...f.options, store, resolveSlot })(request())).status).toBe(503);
    expect((await createRenderHandler({ ...f.options, resolveSlot: () => null })(request())).status).toBe(404);
  });

  it("GET SSE 保留骨架与终树协议", async () => {
    const f = setup();
    const res = await createRenderHandler(f.options)(new Request(request(), {
      headers: { accept: "text/event-stream" },
    }));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const body = await res.text();
    expect(body).toContain("event: skeleton");
    expect(body).toContain("event: tree");
    expect(body).toContain("标题1");
  });

  it("源读取也受预算限制并收到中止信号", async () => {
    vi.useFakeTimers();
    try {
      const f = setup();
      let received: AbortSignal | undefined;
      const resolveSlot = (_id: string, signal: AbortSignal) => {
        received = signal;
        return new Promise<null>(() => {});
      };
      const pending = createRenderHandler({ ...f.options, resolveSlot })(request());
      await vi.advanceTimersByTimeAsync(8000);
      expect((await pending).status).toBe(503);
      expect(received?.aborted).toBe(true);
      expect(f.produce).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("源与 provider 共用 8 秒预算，超时后不写入缓存", async () => {
    vi.useFakeTimers();
    try {
      const f = setup();
      const store = new MemoryCacheStore();
      let finish!: (value: unknown) => void;
      const produce = vi.fn(() => new Promise<unknown>(resolve => { finish = resolve; }));
      const handler = createRenderHandler({ ...f.options, store, provider: { id: "slow", produce } });
      const pending = handler(request());
      await vi.advanceTimersByTimeAsync(8000);
      expect((await pending).status).toBe(503);
      finish(tree("过晚结果"));
      await vi.advanceTimersByTimeAsync(0);
      expect(store.dump()).toBe("{}");
    } finally { vi.useRealTimers(); }
  });
});
```

- [x] **Step 2: 运行失败测试**。

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/render-handler.test.ts`。
Expected: FAIL，render-handler 模块不存在。

- [x] **Step 3: 创建 provider.ts**。

```ts
import type { Registry } from "@ai-slot/registry";
import type { SlotSource } from "./handler.js";
import type { MemoryCacheStore } from "./cache.js";

export interface ProviderContext {
  slot: SlotSource;
  signal: AbortSignal;
}
export interface ContentProvider {
  /** 映射逻辑变化时必须更换 id */
  id: string;
  produce(context: ProviderContext): unknown | Promise<unknown>;
}
export interface RenderHandlerOptions {
  registry: Registry;
  registryVersion: string;
  /** 同一 store 中不同站点的公开内容命名空间；不是权限机制 */
  namespace: string;
  provider: ContentProvider;
  resolveSlot(slotId: string, signal: AbortSignal): SlotSource | null | Promise<SlotSource | null>;
  store?: MemoryCacheStore;
  ttlMs?: number;
  staleMs?: number;
  now?: () => number;
}
```

- [x] **Step 4: 创建 render-handler.ts 的配置与响应部分**。

```ts
import { validateComponentTree, type AiRenderResponse, type ComponentNode } from "@ai-slot/registry";
import { MemoryCacheStore, lookup } from "./cache.js";
import type { RenderHandlerOptions } from "./provider.js";
import { json, sse } from "./render-response.js";

export function createRenderHandler(opts: RenderHandlerOptions): (req: Request) => Promise<Response> {
  if (![opts.namespace, opts.registryVersion, opts.provider.id].every(v => typeof v === "string" && v.length > 0)) {
    throw new Error("namespace、registryVersion 与 provider.id 必须非空");
  }
  const store = opts.store ?? new MemoryCacheStore();
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? 60_000;
  const stale = opts.staleMs ?? 0;
  if (![ttl, stale].every(v => Number.isFinite(v) && v >= 0)) throw new Error("缓存时间必须为非负有限数");

  return async (req: Request): Promise<Response> => {
    const match = new URL(req.url).pathname.match(/^\/ai-render\/([\w-]+)\/?$/);
    if (!match) return json({ error: "not_found" }, 404);
    if (req.method !== "GET") {
      const response = json({ error: "method_not_allowed" }, 405);
      response.headers.set("allow", "GET");
      return response;
    }
    const slotId = match[1];
    const wantsSSE = req.headers.get("accept")?.includes("text/event-stream") ?? false;
    const unavailable = () => json({ error: "ai_unavailable" }, 503);
    const encode = (value: AiRenderResponse) => wantsSSE ? sse(value) : json(value, 200);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
```

- [x] **Step 5: 在同一个返回函数内接续数据读取和缓存逻辑**。

```ts
    const work = async (): Promise<Response> => {
      const slot = await opts.resolveSlot(slotId, controller.signal);
      if (controller.signal.aborted) return unavailable();
      if (!slot) return json({ error: "unknown_slot" }, 404);
      if (slot.slotId !== slotId || typeof slot.contentVersion !== "string" || !slot.contentVersion) return unavailable();
      const key = `provider:${JSON.stringify([
        opts.namespace, opts.provider.id, opts.registryVersion,
        slotId, slot.contentVersion, slot.promptVersion ?? "1",
      ])}`;
      const hit = lookup<AiRenderResponse>(store, key, now());
      const cached = hit?.value;
      const validHit = cached?.version === 1 && cached.slot === slotId &&
        validateComponentTree(opts.registry, cached.tree).ok ? hit : undefined;
      if (validHit?.status === "fresh") return encode(validHit.value);
      try {
        const output = await opts.provider.produce({ slot, signal: controller.signal });
        if (controller.signal.aborted) return unavailable();
        if (!validateComponentTree(opts.registry, output).ok) throw new Error("invalid_tree");
        const response: AiRenderResponse = {
          version: 1, slot: slotId, tree: output as ComponentNode,
          meta: { reason: "data-source", sourceVersion: slot.contentVersion, registryVersion: opts.registryVersion },
        };
        store.set(key, response, ttl, stale, now());
        return encode(response);
      } catch {
        return !controller.signal.aborted && validHit ? encode(validHit.value) : unavailable();
      }
    };
```

- [x] **Step 6: 接续预算控制并结束函数**。

```ts
    const deadline = new Promise<Response>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(unavailable()); }, 8000);
    });
    try {
      const response = await Promise.race([work().catch(unavailable), deadline]);
      response.headers.set("cache-control", "no-store");
      return response;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
```

不得把管理发布逻辑塞入这个读取入口。超时后 work 可能仍在外部运行，但 abort 检查阻止其写缓存；实际网络读取应遵从 signal。

- [x] **Step 7: 导出新 API**。

```ts
// packages/proxy/src/index.ts 追加
export * from "./provider.js";
export * from "./render-handler.js";
```

- [x] **Step 8: 运行测试**。执行 Step 2 命令，预期 PASS；再运行 `pnpm --filter @ai-slot/proxy test`，旧 AI 精确响应与缓存前置测试均应保持通过。
- [x] **Step 9: 提交**。

```sh
git add packages/proxy/src/provider.ts packages/proxy/src/render-handler.ts packages/proxy/src/render-handler.test.ts packages/proxy/src/index.ts
git commit -m "feat: 增加无需模型的数据组件树交付入口"
```

### Task 3: 验证预热恢复和同版本降级边界

**Files:**
- Create: `packages/proxy/src/provider-prewarm.test.ts`
- Modify: `packages/proxy/README.md`
- Test: 新测试与现有 prewarm.test.ts

**Interfaces:**
- Consumes: Task 2 的 createRenderHandler；既有 `prewarm(handler,slotIds)`、`MemoryCacheStore.dump/load`。
- Produces: 已验证的序列化/版本边界与接入说明；不增加第二种预热函数。

- [x] **Step 1: 创建测试**。

```ts
import { defineRegistry } from "@ai-slot/registry";
import { expect, it, vi } from "vitest";
import { MemoryCacheStore } from "./cache.js";
import { prewarm } from "./prewarm.js";
import { createRenderHandler } from "./render-handler.js";

it("预热恢复可复用，非法缓存值必须重新生产", async () => {
  const registry = defineRegistry({ components: { text: { description: "文本", props: { value: "string" } } } });
  const produce = vi.fn(async () => ({ component: "text", props: { value: "已生成" } }));
  const options = {
    registry, registryVersion: "1", namespace: "site", provider: { id: "cms", produce },
    resolveSlot: () => ({ slotId: "hero", originalContent: "原文", contentVersion: "1" }), now: () => 0,
  };
  const store = new MemoryCacheStore();
  expect(await prewarm(createRenderHandler({ ...options, store }), ["hero"])).toEqual({ ok: ["hero"], failed: [] });
  const restored = MemoryCacheStore.load(store.dump(), 0);
  await prewarm(createRenderHandler({ ...options, store: restored }), ["hero"]);
  expect(produce).toHaveBeenCalledTimes(1);
  const corrupt = JSON.parse(store.dump());
  for (const entry of Object.values(corrupt) as Array<{ value: { tree: unknown } }>) entry.value.tree = { component: "evil" };
  await prewarm(createRenderHandler({ ...options, store: MemoryCacheStore.load(JSON.stringify(corrupt), 0) }), ["hero"]);
  expect(produce).toHaveBeenCalledTimes(2);
});

it("仅显式允许同版本 stale；新源版本失败不复用旧结果", async () => {
  let time = 0;
  let version = "1";
  let fail = false;
  const registry = defineRegistry({ components: { text: { description: "文本" } } });
  const handler = createRenderHandler({
    registry, registryVersion: "1", namespace: "site", ttlMs: 10, staleMs: 100,
    now: () => time,
    resolveSlot: () => ({ slotId: "hero", originalContent: "原文", contentVersion: version }),
    provider: { id: "cms", produce: async () => { if (fail) throw Error("down"); return { component: "text" }; } },
  });
  const request = () => new Request("https://example.test/ai-render/hero");
  expect((await handler(request())).status).toBe(200);
  time = 20; fail = true;
  expect((await handler(request())).status).toBe(200);
  version = "2";
  expect((await handler(request())).status).toBe(503);
  version = "1"; time = 111;
  expect((await handler(request())).status).toBe(503);
});
```

- [x] **Step 2: 运行行为验证**。

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/provider-prewarm.test.ts src/prewarm.test.ts`。
Expected: PASS，因为复用的是既有预热 API；若失败，只修正 Task 2 逻辑，不更改缓存数据结构或放宽断言。

- [x] **Step 3: 在 proxy README 增加以下 API 说明和完整示例**。

```ts
import { defineRegistry } from "@ai-slot/registry";
import { createRenderHandler } from "@ai-slot/proxy";

const registry = defineRegistry({ components: {
  title: { description: "标题", props: { text: "string" }, required: ["text"] },
} });
export const handler = createRenderHandler({
  registry, registryVersion: "1", namespace: "public-homepage",
  resolveSlot: async (id, signal) => {
    if (id !== "hero") return null;
    const response = await fetch("https://cms.example.com/public/hero.json", { signal });
    if (!response.ok) throw new Error("数据源不可用");
    const data = await response.json();
    if (typeof data.version !== "string" || typeof data.title !== "string") throw new Error("数据源格式错误");
    return { slotId: id, originalContent: "原始标题", contentVersion: data.version, data: { title: data.title } };
  },
  provider: { id: "title-map-v1", produce: ({ slot }) => ({ component: "title", props: { text: slot.data?.title } }) },
});
```

在示例前说明 cms.example.com 是需替换为用户固定服务端数据源的说明域名，不能把来访 URL 当数据源。文档列明 GET-only、公开内容、8000ms、默认 ttl 60000/stale 0、源变化必须更新版本、映射变化必须更新 provider.id、原 AI API 不变。传入 registry 和配置视为初始化后不变；若改变则创建新 handler 并递增版本。密钥只能留服务端，输出 data 只选展示字段。

- [x] **Step 4: 提交**。

```sh
git add packages/proxy/src/provider-prewarm.test.ts packages/proxy/README.md
git commit -m "test: 验证数据预热恢复与降级边界"
```

### Task 4: 真实页面示例与端到端验收

**Files:**
- Create: `examples/plain-html/data-source.mjs`、`cms-data.json`、`data.html`
- Create: `examples/plain-html/e2e/data-source.spec.ts`
- Modify: `examples/plain-html/server.mjs`
- Create or Modify: `examples/plain-html/README.md`（若已存在则追加章节）

**Interfaces:**
- Consumes: Task 2 的 createRenderHandler；现有 registry、domComponents、configureAiSlot、registerRenderer。
- Produces: `createDataHandler(readSource)`；`dataHandler`；GET `/ai-render/data-hero`；`/data.html` 本地示例。readSource 为 `()=>Promise<{version:string,title:string}>`。

- [x] **Step 1: 创建端到端失败测试**。

```ts
import { expect, test } from "@playwright/test";

test("数据组件树局部更新不替换页面其他节点，失败初载显示兜底", async ({ page }) => {
  // 使用示例 factory 与真实 handler，测试只替换数据源，不伪造响应协议。
  const { createDataHandler } = await import("../data-source.mjs");
  let version = "1";
  let fail = false;
  const handler = createDataHandler(async () => {
    if (fail) throw Error("数据源中断");
    return { version, title: `产品介绍${version}` };
  });
  await page.route("**/ai-render/data-hero", async route => {
    const res = await handler(new Request(route.request().url()));
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });
  await page.goto("/data.html");
  const slot = page.locator('ai-slot[name="data-hero"]');
  await expect(slot).toContainText("产品介绍1");
  await page.locator("#outside").evaluate(el => el.setAttribute("data-marker", "same-node"));
  version = "2";
  await page.getByRole("button", { name: "刷新局部" }).click();
  await expect(slot).toContainText("产品介绍2");
  await expect(page.locator("#outside")).toHaveAttribute("data-marker", "same-node");
  fail = true;
  await page.reload();
  await expect(slot).toContainText("原始产品介绍");
});
```

- [x] **Step 2: 运行失败测试**。`pnpm --filter example-plain-html exec playwright test e2e/data-source.spec.ts`，预期因 data-source.mjs 尚不存在失败。确保无旧的 4173 服务复用；CI 模式下由配置启动新的服务。
- [x] **Step 3: 创建 data-source.mjs 与数据文件**。

```js
import { readFile } from "node:fs/promises";
import { createRenderHandler } from "@ai-slot/proxy";
import { registry } from "./registry.mjs";

/** 数据源必须返回一致的版本与内容快照；这里只读展示字段。 */
export function createDataHandler(readSource) {
  return createRenderHandler({
    registry, registryVersion: "1", namespace: "plain-html-data",
    resolveSlot: async id => {
      if (id !== "data-hero") return null;
      const data = await readSource();
      if (typeof data.version !== "string" || typeof data.title !== "string") throw new Error("数据源格式错误");
      return { slotId: id, originalContent: "原始产品介绍", contentVersion: data.version, data: { title: data.title } };
    },
    provider: { id: "hero-map-v1", produce: ({ slot }) => ({ component: "hero-banner", props: { title: slot.data.title } }) },
  });
}
export const dataHandler = createDataHandler(async () =>
  JSON.parse(await readFile(new URL("./cms-data.json", import.meta.url), "utf8")));
```

```json
{"version":"1","title":"数据驱动的产品介绍"}
```

- [x] **Step 4: 接入 server.mjs**。增加 import；在原 `/ai-render/` 分支内部，仅替换 handler 选择语句，其他静态文件与 SSE 路由不变。

```js
import { dataHandler } from "./data-source.mjs";
// 原 /ai-render/ 分支内
const activeHandler = url.pathname === "/ai-render/data-hero" ? dataHandler : handler;
const webRes = await activeHandler(await toWebRequest(req));
```

- [x] **Step 5: 创建 data.html**。

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AI-SLOT 数据交付示例</title>
  <script type="importmap">
  {"imports":{
    "@ai-slot/registry":"/vendor/registry/index.js",
    "@ai-slot/runtime":"/vendor/runtime/index.js",
    "@ai-slot/adapter-dom":"/vendor/adapter-dom/index.js"
  }}
  </script>
</head>
<body>
  <p id="outside">这部分由原页面维护。</p>
  <ai-slot name="data-hero" src="/ai-render/data-hero">
    <h1>原始产品介绍</h1>
  </ai-slot>
  <button type="button" id="refresh">刷新局部</button>
  <p>修改本地 cms-data.json 的 title 和 version 后刷新局部，不需要重新构建。</p>
  <script type="module">
    import { configureAiSlot, registerRenderer } from '@ai-slot/runtime';
    import { createDomRenderer } from '@ai-slot/adapter-dom';
    import { registry } from '/registry-client.mjs';
    import { domComponents } from '/components.mjs';
    configureAiSlot({ registry });
    registerRenderer('dom', createDomRenderer(domComponents));
    document.querySelector('#refresh').addEventListener('click', () => {
      void document.querySelector('ai-slot').load();
    });
  </script>
</body>
</html>
```

- [x] **Step 6: 构建后验证新示例**。运行 `pnpm build`，再 `pnpm --filter example-plain-html exec playwright test e2e/data-source.spec.ts`，预期 PASS。测试无真实模型请求；生产示例读取本地文件，测试使用同一个 factory 的内存源，不声称已对接商业 CMS。
- [x] **Step 7: 在示例 README 加入操作说明**。

“运行 pnpm build 后启动 node examples/plain-html/server.mjs，打开 http://localhost:4173/data.html。修改 cms-data.json 的 title，同时将 version 改为新值；点击刷新局部观察变化。文件必须是完整合法 JSON。原始兜底保留，不调用模型，不提供编辑权限、自动重连或持久发布历史。该示例由本地 Node 服务提供，未接入 worker.mjs/build-public 的托管演示发布。”

- [x] **Step 8: 全体验收**。运行 `pnpm test`、`pnpm typecheck`、`pnpm --filter example-plain-html test:e2e`。手动编辑数据文件验证一次，随后恢复 fixture 初始值；检查其他页面元素和 Git 差异。只有出现新问题才重复完整测试。
- [x] **Step 9: 提交**。

```sh
git add examples/plain-html/data-source.mjs examples/plain-html/cms-data.json examples/plain-html/data.html examples/plain-html/e2e/data-source.spec.ts examples/plain-html/server.mjs examples/plain-html/README.md
git commit -m "feat: 增加数据源驱动的局部页面示例"
```

## 自审与交付边界

| 首阶段要求 | 任务 |
|---|---|
| 旧 AI API 兼容、JSON/SSE 协议 | Task 1、Task 2 |
| 无 LLM、版本缓存、校验、超时 | Task 2 |
| 预热、缓存恢复、明确 stale 语义 | Task 3 |
| 真实 runtime、局部更新、原始兜底 | Task 4 |
| 接入文档与限制 | Task 3、Task 4 |

未实现且不宣称完成：统一 AI provider、POST 个性化新协议、管理 MCP、版本库、CMS 平台插件、SSE 自动重连。该计划是上位 P0 的第一份可执行交付，不是整个商业路线图完成。
