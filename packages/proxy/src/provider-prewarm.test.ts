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
