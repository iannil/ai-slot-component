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
  const subscriptions: Array<{ close(): void }> = [];
  const subscribe: typeof subscribeInvalidation = (opts) => {
    const sub = subscribeInvalidation(opts);
    subscriptions.push(sub);
    return sub;
  };
  afterEach(() => {
    for (const sub of subscriptions.splice(0)) sub.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("请求带 slot 查询参数", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, body: sseStream([], true) }));
    vi.stubGlobal("fetch", fetchSpy);
    subscribe({ src: "/ai-invalidate", slot: "hero", onInvalidate: () => {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).toHaveBeenCalledWith("/ai-invalidate?slot=hero", expect.objectContaining({ headers: { accept: "text/event-stream" } }));
  });

  it("src 自带 query 时用 & 拼接 slot", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, body: sseStream([], true) }));
    vi.stubGlobal("fetch", fetchSpy);
    subscribe({ src: "/ai-invalidate?token=abc", slot: "hero", onInvalidate: () => {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).toHaveBeenCalledWith("/ai-invalidate?token=abc&slot=hero", expect.objectContaining({ headers: { accept: "text/event-stream" } }));
  });

  it("invalidate 帧跨两个 chunk 到达仍触发回调", async () => {
    const chunks = ["event: inval", `idate\ndata: ${JSON.stringify({ slot: "hero" })}\n\n`];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, body: sseStream(chunks, true) })));
    const hits: number[] = [];
    subscribe({ src: "/x", slot: "hero", onInvalidate: () => hits.push(1) });
    await new Promise((r) => setTimeout(r, 20));
    expect(hits).toHaveLength(1);
  });

  it("收到本槽位 invalidate 帧时回调", async () => {
    const frame = `event: invalidate\ndata: ${JSON.stringify({ slot: "hero" })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, body: sseStream([frame], true) })));
    const hits: number[] = [];
    subscribe({ src: "/ai-invalidate", slot: "hero", onInvalidate: () => hits.push(1) });
    await new Promise((r) => setTimeout(r, 20));
    expect(hits).toHaveLength(1);
  });

  it("CRLF 分隔/行尾的 invalidate 帧同样触发回调", async () => {
    const frame = `event: invalidate\r\ndata: ${JSON.stringify({ slot: "hero" })}\r\n\r\n`;
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, body: sseStream([frame], true) })));
    const hits: number[] = [];
    subscribe({ src: "/ai-invalidate", slot: "hero", onInvalidate: () => hits.push(1) });
    await new Promise((r) => setTimeout(r, 20));
    expect(hits).toHaveLength(1);
  });

  it("非本槽位帧与心跳注释不触发回调", async () => {
    const chunks = [`: ping\n\n`, `event: invalidate\ndata: ${JSON.stringify({ slot: "other" })}\n\n`];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, body: sseStream(chunks, true) })));
    const hits: number[] = [];
    subscribe({ src: "/ai-invalidate", slot: "hero", onInvalidate: () => hits.push(1) });
    await new Promise((r) => setTimeout(r, 20));
    expect(hits).toHaveLength(0);
  });

  it("网络错误静默（不抛、不回调）", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("down"))));
    const hits: number[] = [];
    expect(() => subscribe({ src: "/x", slot: "s", onInvalidate: () => hits.push(1) })).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(hits).toHaveLength(0);
  });

  it("close() 中止读取", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, body: sseStream([], true) })));
    const sub = subscribe({ src: "/x", slot: "s", onInvalidate: () => {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(() => sub.close()).not.toThrow();
  });
});


it("重连成功重新核对且close取消后续重试", async () => {
  vi.useFakeTimers();
  const onConnect = vi.fn();
  const fetchImpl = vi.fn()
    .mockRejectedValueOnce(new Error("断线"))
    .mockResolvedValue(new Response(new ReadableStream({ start() {} })));
  const sub = subscribeInvalidation({ src: "/events", slot: "hero", onInvalidate: vi.fn(),
    onConnect, random: () => 0, fetchImpl });
  await vi.advanceTimersByTimeAsync(499);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(onConnect).toHaveBeenCalledTimes(1);
  sub.close();
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});


describe("subscribeInvalidation 重连行为", () => {
  const subs: Array<{ close(): void }> = [];
  const subscribe: typeof subscribeInvalidation = (opts) => {
    const sub = subscribeInvalidation(opts);
    subs.push(sub);
    return sub;
  };
  afterEach(() => {
    for (const sub of subs.splice(0)) sub.close();
    vi.useRealTimers();
  });
  const open = () => new Response(sseStream([], true));
  const eof = () => new Response(sseStream([], false));
  const tick = async (ms: number) => vi.advanceTimersByTimeAsync(ms);

  it("EOF 后重试", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValueOnce(eof()).mockResolvedValue(open());
    subscribe({ src: "/events", slot: "hero", onInvalidate: vi.fn(), random: () => 0, fetchImpl });
    await tick(499);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("连续 EOF 退避 500、1000、2000ms", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockImplementation(async () => eof());
    subscribe({ src: "/events", slot: "hero", onInvalidate: vi.fn(), random: () => 0, fetchImpl });
    await tick(499); expect(fetchImpl).toHaveBeenCalledTimes(1);
    await tick(1); expect(fetchImpl).toHaveBeenCalledTimes(2);
    await tick(999); expect(fetchImpl).toHaveBeenCalledTimes(2);
    await tick(1); expect(fetchImpl).toHaveBeenCalledTimes(3);
    await tick(1999); expect(fetchImpl).toHaveBeenCalledTimes(3);
    await tick(1); expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("有效 invalidate 帧重置退避次数", async () => {
    vi.useFakeTimers();
    const frame = 'event: invalidate\ndata: {"slot":"hero"}\n\n';
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(sseStream([frame], false)))
      .mockResolvedValue(open());
    const onInvalidate = vi.fn();
    subscribe({ src: "/events", slot: "hero", onInvalidate, random: () => 0, fetchImpl });
    await tick(500); expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    await tick(499); expect(fetchImpl).toHaveBeenCalledTimes(2);
    await tick(1); expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("连接稳定 30s 后重置退避次数", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) { setTimeout(() => controller.close(), 30000); },
      })))
      .mockResolvedValue(open());
    subscribe({ src: "/events", slot: "hero", onInvalidate: vi.fn(), random: () => 0, fetchImpl });
    await tick(500); expect(fetchImpl).toHaveBeenCalledTimes(2);
    await tick(30499); expect(fetchImpl).toHaveBeenCalledTimes(2);
    await tick(1); expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("握手超时后重试", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(open());
    subscribe({ src: "/events", slot: "hero", onInvalidate: vi.fn(), random: () => 0, fetchImpl });
    await tick(8499); expect(fetchImpl).toHaveBeenCalledTimes(1);
    await tick(1); expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("60s 无字节后重试", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(open());
    subscribe({ src: "/events", slot: "hero", onInvalidate: vi.fn(), random: () => 0, fetchImpl });
    await tick(60499); expect(fetchImpl).toHaveBeenCalledTimes(1);
    await tick(1); expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("close 在 fetch 等待时不重连", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockImplementation(() => new Promise(() => {}));
    const sub = subscribe({ src: "/events", slot: "hero", onInvalidate: vi.fn(), fetchImpl });
    sub.close(); await tick(120000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("close 在 reader 等待时不重连", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(open());
    const sub = subscribe({ src: "/events", slot: "hero", onInvalidate: vi.fn(), fetchImpl });
    await tick(0); sub.close(); await tick(120000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("close 在退避时不重连", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const sub = subscribe({ src: "/events", slot: "hero", onInvalidate: vi.fn(), random: () => 0, fetchImpl });
    await tick(0); sub.close(); await tick(120000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("跨 chunk CRLF 帧有效", async () => {
    vi.useFakeTimers();
    const onInvalidate = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(sseStream([
      'event: invalidate\r', '\ndata: {"slot":"hero"}\r', '\n\r', '\n',
    ])));
    subscribe({ src: "/events", slot: "hero", onInvalidate, fetchImpl });
    await tick(0); expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it("损坏帧后好帧仍有效", async () => {
    vi.useFakeTimers();
    const onInvalidate = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(sseStream([
      'event: invalidate\ndata: broken\n\nevent: invalidate\ndata: {"slot":"hero"}\n\n',
    ])));
    subscribe({ src: "/events", slot: "hero", onInvalidate, fetchImpl });
    await tick(0); expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it("其他 slot 不触发", async () => {
    vi.useFakeTimers();
    const onInvalidate = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(sseStream([
      'event: invalidate\ndata: {"slot":"other"}\n\n',
    ])));
    subscribe({ src: "/events", slot: "hero", onInvalidate, fetchImpl });
    await tick(0); expect(onInvalidate).not.toHaveBeenCalled();
  });

  it("大缓冲受控重连且不解析其中帧", async () => {
    vi.useFakeTimers();
    const onInvalidate = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(sseStream([
      'event: invalidate\ndata: {"slot":"hero"}\n\n' + 'x'.repeat(65536),
    ]))).mockResolvedValue(open());
    subscribe({ src: "/events", slot: "hero", onInvalidate, random: () => 0, fetchImpl });
    await tick(499); expect(onInvalidate).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await tick(1); expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("onConnect 抛错不停止读取", async () => {
    vi.useFakeTimers();
    const onInvalidate = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(sseStream([
      'event: invalidate\ndata: {"slot":"hero"}\n\n',
    ])));
    subscribe({ src: "/events", slot: "hero", onInvalidate, onConnect: () => { throw new Error("observer"); }, fetchImpl });
    await tick(0); expect(onInvalidate).toHaveBeenCalledTimes(1);
  });
});
