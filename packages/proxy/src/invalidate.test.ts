import { describe, expect, it } from "vitest";
import { createInvalidationChannel } from "./invalidate.js";

function subscribe(channel: ReturnType<typeof createInvalidationChannel>, slot?: string) {
  const url = slot === undefined ? "https://edge.example/ai-invalidate" : `https://edge.example/ai-invalidate?slot=${slot}`;
  return channel.handler(new Request(url));
}

async function readChunk(body: ReadableStream<Uint8Array>, ms = 500): Promise<string> {
  const reader = body.getReader();
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
  const { value } = await Promise.race([reader.read(), timeout]);
  reader.releaseLock();
  return new TextDecoder().decode(value);
}

describe("createInvalidationChannel", () => {
  it("缺 slot 参数返回 400", async () => {
    const channel = createInvalidationChannel();
    const res = subscribe(channel);
    expect(res.status).toBe(400);
  });

  it("订阅返回 SSE 流，invalidate 推送到对应槽位", async () => {
    const channel = createInvalidationChannel({ heartbeatMs: 60_000 });
    const res = subscribe(channel, "hero");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(channel.subscriberCount("hero")).toBe(1);
    channel.invalidate("hero");
    const chunk = await readChunk(res.body!);
    expect(chunk).toContain("event: invalidate");
    expect(chunk).toContain('"slot":"hero"');
  });

  it("按 slotId 过滤：其他槽位的订阅者收不到", async () => {
    const channel = createInvalidationChannel({ heartbeatMs: 60_000 });
    const heroRes = subscribe(channel, "hero");
    subscribe(channel, "footer");
    channel.invalidate("footer");
    // hero 订阅者不应收到帧（心跳间隔很长，读应超时）
    await expect(readChunk(heroRes.body!, 200)).rejects.toThrow("timeout");
    expect(channel.subscriberCount("hero")).toBe(1);
    expect(channel.subscriberCount("footer")).toBe(1);
  });

  it("订阅者断开后自动移除", async () => {
    const channel = createInvalidationChannel({ heartbeatMs: 60_000 });
    const res = subscribe(channel, "hero");
    expect(channel.subscriberCount("hero")).toBe(1);
    await res.body!.cancel();
    // cancel 回调异步触发
    await new Promise((r) => setTimeout(r, 10));
    expect(channel.subscriberCount("hero")).toBe(0);
  });

  it("心跳按 heartbeatMs 发送 ping 注释行", async () => {
    const channel = createInvalidationChannel({ heartbeatMs: 30 });
    const res = subscribe(channel, "hero");
    const chunk = await readChunk(res.body!, 500);
    expect(chunk).toContain(": ping");
  });
});


describe("createInvalidationChannel 边界", () => {
  it("限制全通道订阅数并在断开后释放名额", async () => {
    const channel = createInvalidationChannel({ heartbeatMs: 60_000, maxSubscribers: 1, maxQueuedFrames: 1 });
    const first = subscribe(channel, "hero");
    expect(first.status).toBe(200);
    expect(subscribe(channel, "footer").status).toBe(503);
    await first.body!.cancel();
    expect(channel.subscriberCount("hero")).toBe(0);
    const second = subscribe(channel, "footer");
    expect(second.status).toBe(200);
    await second.body!.cancel();
  });

  it("慢消费者超过一帧时关闭流并移除订阅", async () => {
    const channel = createInvalidationChannel({ heartbeatMs: 60_000, maxQueuedFrames: 1 });
    const res = subscribe(channel, "hero");
    channel.invalidate("hero");
    channel.invalidate("hero");
    expect(channel.subscriberCount("hero")).toBe(0);
    const reader = res.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: invalidate");
    expect((await reader.read()).done).toBe(true);
  });

  it("默认模式保持原有多帧队列行为", async () => {
    const channel = createInvalidationChannel({ heartbeatMs: 60_000 });
    const res = subscribe(channel, "hero");
    channel.invalidate("hero");
    channel.invalidate("hero");
    expect(channel.subscriberCount("hero")).toBe(1);
    const reader = res.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
  });

  it("心跳也受待消费帧上限约束", async () => {
    const channel = createInvalidationChannel({ heartbeatMs: 10, maxQueuedFrames: 1 });
    const res = subscribe(channel, "hero");
    await new Promise(resolve => setTimeout(resolve, 35));
    expect(channel.subscriberCount("hero")).toBe(0);
    const reader = res.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(": ping");
    expect((await reader.read()).done).toBe(true);
  });
});
