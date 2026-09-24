import { defineRegistry } from "@ai-slot/registry";
import { describe, expect, it, vi } from "vitest";
import { MemoryCacheStore, developerCacheKey, lookup } from "./cache.js";
import { createAiRenderHandler } from "./handler.js";
import type { LLMClient } from "./llm-client.js";
import { prewarm } from "./prewarm.js";

describe("MemoryCacheStore 序列化", () => {
  it("dump/load 往返保留条目与 fresh/stale 语义", () => {
    const store = new MemoryCacheStore();
    store.set("a", { x: 1 }, 1000, 5000, 0);
    store.set("b", "v", 100, 1000, 0); // 立即进入 stale（staleUntil = 1100）
    const json = store.dump();
    const restored = MemoryCacheStore.load(json, 500);
    expect(lookup(restored, "a", 500)).toEqual({ value: { x: 1 }, status: "fresh" });
    expect(lookup(restored, "b", 500)).toEqual({ value: "v", status: "stale" });
  });

  it("load 时剔除已彻底过期的条目", () => {
    const store = new MemoryCacheStore();
    store.set("a", 1, 100, 100, 0); // staleUntil = 200
    const restored = MemoryCacheStore.load(store.dump(), 1000);
    expect(lookup(restored, "a", 1000)).toBeUndefined();
  });

  it("load 非法 JSON 抛错", () => {
    expect(() => MemoryCacheStore.load("不是 json", 0)).toThrow();
  });
});

describe("prewarm", () => {
  const registry = defineRegistry({
    components: { "hero-banner": { description: "", props: { title: "string" }, required: ["title"] } },
  });
  const slot = { slotId: "hero", originalContent: "<h1>x</h1>", contentVersion: "v1" };

  it("成功的槽位写入缓存并计入 ok，失败的计入 failed 且不中断", async () => {
    const llm: LLMClient = {
      complete: vi.fn().mockImplementation((req: { user: string }) => {
        if (req.user.includes("槽位：broken")) return Promise.reject(new Error("boom"));
        return Promise.resolve({ text: JSON.stringify({ tree: { component: "hero-banner", props: { title: "预生成" } } }) });
      }),
    };
    const store = new MemoryCacheStore();
    const handler = createAiRenderHandler({
      registry,
      llm,
      store,
      resolveSlot: (id) => (id === "hero" ? slot : id === "broken" ? { ...slot, slotId: "broken" } : null),
      now: () => 0,
    });
    const result = await prewarm(handler, ["hero", "broken", "unknown"]);
    expect(result).toEqual({ ok: ["hero"], failed: ["broken", "unknown"] });
    // 缓存中已有开发者路径结果（验证用的是 handler 内部同一套 key）
    const hit = lookup(store, developerCacheKey("hero", "v1", "1"), 0);
    expect(hit?.status).toBe("fresh");
    expect((hit?.value as { tree: { props: { title: string } } }).tree.props.title).toBe("预生成");
    // prewarm 结果可序列化、可被新 store 水合
    const hydrated = MemoryCacheStore.load(store.dump(), 0);
    expect(lookup(hydrated, developerCacheKey("hero", "v1", "1"), 0)?.status).toBe("fresh");
  });
});
