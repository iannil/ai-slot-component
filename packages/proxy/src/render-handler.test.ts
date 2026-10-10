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
    expect(res.headers.get("content-type")).toContain("text/event-stream");
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

  it("provider 失败时 stale 已过期则返回 503", async () => {
    const f = setup();
    let now = 0;
    let fail = false;
    const produce = vi.fn(async (context: ProviderContext) => {
      if (fail) { now = 21; throw new Error("provider down"); }
      return tree(String(context.slot.data?.title));
    });
    const handler = createRenderHandler({
      ...f.options, now: () => now, ttlMs: 10, staleMs: 10,
      provider: { id: "expiring", produce },
    });
    expect((await handler(request())).status).toBe(200);
    now = 11;
    fail = true;
    expect((await handler(request())).status).toBe(503);
  });

  it("provider 失败时仅回退同版本且仍有效的 stale 树", async () => {
    const f = setup();
    let now = 0;
    let fail = false;
    const produce = vi.fn(async (context: ProviderContext) => {
      if (fail) throw new Error("provider down");
      return tree(String(context.slot.data?.title));
    });
    const handler = createRenderHandler({
      ...f.options, now: () => now, ttlMs: 10, staleMs: 10,
      provider: { id: "stale", produce },
    });
    await handler(request());
    now = 11;
    fail = true;
    expect((await (await handler(request())).json()).tree).toEqual(tree("标题1"));
    f.setVersion("2");
    expect((await handler(request())).status).toBe(503);
  });
});
