import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeInvalidation } from "./live.js";

function sseStream(chunks: string[], hang = true): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (!hang) controller.close();
      // hang=true：保持打开，模拟长连接
    },
  });
}

describe("subscribeInvalidation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("请求带 slot 查询参数", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, body: sseStream([], true) }));
    vi.stubGlobal("fetch", fetchSpy);
    subscribeInvalidation({ src: "/ai-invalidate", slot: "hero", onInvalidate: () => {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).toHaveBeenCalledWith("/ai-invalidate?slot=hero", expect.objectContaining({ headers: { accept: "text/event-stream" } }));
  });

  it("收到本槽位 invalidate 帧时回调", async () => {
    const frame = `event: invalidate\ndata: ${JSON.stringify({ slot: "hero" })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, body: sseStream([frame], true) })));
    const hits: number[] = [];
    subscribeInvalidation({ src: "/ai-invalidate", slot: "hero", onInvalidate: () => hits.push(1) });
    await new Promise((r) => setTimeout(r, 20));
    expect(hits).toHaveLength(1);
  });

  it("非本槽位帧与心跳注释不触发回调", async () => {
    const chunks = [`: ping\n\n`, `event: invalidate\ndata: ${JSON.stringify({ slot: "other" })}\n\n`];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, body: sseStream(chunks, true) })));
    const hits: number[] = [];
    subscribeInvalidation({ src: "/ai-invalidate", slot: "hero", onInvalidate: () => hits.push(1) });
    await new Promise((r) => setTimeout(r, 20));
    expect(hits).toHaveLength(0);
  });

  it("网络错误静默（不抛、不回调）", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("down"))));
    const hits: number[] = [];
    expect(() => subscribeInvalidation({ src: "/x", slot: "s", onInvalidate: () => hits.push(1) })).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(hits).toHaveLength(0);
  });

  it("close() 中止读取", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, body: sseStream([], true) })));
    const sub = subscribeInvalidation({ src: "/x", slot: "s", onInvalidate: () => {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(() => sub.close()).not.toThrow();
  });
});
