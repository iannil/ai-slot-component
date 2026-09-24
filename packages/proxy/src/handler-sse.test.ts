import { defineRegistry } from "@ai-slot/registry";
import { describe, expect, it, vi } from "vitest";
import { createAiRenderHandler } from "./handler.js";
import type { LLMClient } from "./llm-client.js";

const registry = defineRegistry({
  components: {
    "hero-banner": {
      description: "",
      props: { title: "string", count: "number" },
      required: ["title"],
    },
  },
});

const goodTree = { component: "hero-banner", props: { title: "AI 标题", count: 3 } };
const slot = { slotId: "hero", originalContent: "<h1>x</h1>", contentVersion: "v1" };

function makeHandler(llm: LLMClient) {
  return createAiRenderHandler({ registry, llm, resolveSlot: () => slot, now: () => 1000 });
}

function sseGet() {
  return new Request("https://edge.example/ai-render/hero", {
    headers: { accept: "text/event-stream" },
  });
}

function parseSSE(body: string): { event: string; data: unknown }[] {
  return body
    .split("\n\n")
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const data = chunk.match(/^data: (.+)$/m)?.[1];
      return { event: event!, data: JSON.parse(data!) };
    });
}

describe("handler SSE 传输", () => {
  it("Accept: text/event-stream 时返回 SSE 双帧（skeleton → tree）", async () => {
    const llm: LLMClient = { complete: vi.fn().mockResolvedValue({ text: JSON.stringify({ tree: goodTree }) }) };
    const res = await makeHandler(llm)(sseGet());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const frames = parseSSE(await res.text());
    expect(frames).toHaveLength(2);
    expect(frames[0].event).toBe("skeleton");
    expect((frames[0].data as { tree: { props: { title: string; count: number } } }).tree.props).toEqual({ title: "", count: 3 });
    expect(frames[1].event).toBe("tree");
    expect((frames[1].data as { tree: typeof goodTree }).tree).toEqual(goodTree);
  });

  it("缓存命中（fresh）协商 SSE 时同样发双帧", async () => {
    const llm: LLMClient = { complete: vi.fn().mockResolvedValue({ text: JSON.stringify({ tree: goodTree }) }) };
    const handler = makeHandler(llm);
    await handler(new Request("https://edge.example/ai-render/hero")); // 写缓存（JSON 请求）
    const res = await handler(sseGet());
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(parseSSE(await res.text())).toHaveLength(2);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it("不带 SSE Accept 时行为不变（JSON）", async () => {
    const llm: LLMClient = { complete: vi.fn().mockResolvedValue({ text: JSON.stringify({ tree: goodTree }) }) };
    const res = await makeHandler(llm)(new Request("https://edge.example/ai-render/hero"));
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("错误路径永远返回 JSON（不走 SSE）", async () => {
    const llm: LLMClient = { complete: vi.fn().mockRejectedValue(new Error("boom")) };
    const res = await makeHandler(llm)(sseGet());
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
