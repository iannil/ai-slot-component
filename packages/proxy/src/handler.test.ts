import { defineRegistry, type AiRenderResponse } from "@ai-slot/registry";
import { describe, expect, it, vi } from "vitest";
import { createAiRenderHandler, type SlotSource } from "./handler.js";
import type { LLMClient } from "./llm-client.js";

const registry = defineRegistry({
  components: {
    "hero-banner": {
      description: "主视觉",
      props: { title: "string" },
      required: ["title"],
    },
  },
});

const goodTree = { component: "hero-banner", props: { title: "AI 标题" } };

function makeLLM(text: string): LLMClient {
  return { complete: vi.fn().mockResolvedValue({ text }) };
}

const slot: SlotSource = {
  slotId: "hero",
  originalContent: "<h1>原始标题</h1>",
  developerPrompt: "面向开发者重写",
  contentVersion: "v1",
};

function makeHandler(llm: LLMClient, extra: Record<string, unknown> = {}) {
  return createAiRenderHandler({
    registry,
    llm,
    resolveSlot: (id) => (id === "hero" ? slot : null),
    now: () => 1000,
    ...extra,
  });
}

function get(slotId = "hero") {
  return new Request(`https://edge.example/ai-render/${slotId}`);
}

function post(prompt: unknown, headers: Record<string, string> = {}) {
  return new Request("https://edge.example/ai-render/hero", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ prompt }),
  });
}

describe("createAiRenderHandler — GET 开发者路径", () => {
  it("缓存未命中时调用 LLM、校验并返回组件树，meta.reason 为 developer-prompt", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const res = await makeHandler(llm)(get());
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiRenderResponse;
    expect(body).toEqual({ version: 1, slot: "hero", tree: goodTree, meta: { reason: "developer-prompt" } });
    expect(llm.complete).toHaveBeenCalledTimes(1);
    const req = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(req.maxTokens).toBe(2000);
    expect(req.timeoutMs).toBe(8000);
  });

  it("第二次请求命中缓存，不再调用 LLM", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const handler = makeHandler(llm);
    await handler(get());
    const res = await handler(get());
    expect(res.status).toBe(200);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it("LLM 第一次失败时重试一次，第二次成功返回 200", async () => {
    const llm: LLMClient = {
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce({ text: JSON.stringify({ tree: goodTree }) }),
    };
    const res = await makeHandler(llm)(get());
    expect(res.status).toBe(200);
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it("LLM 失败且无缓存时返回 503", async () => {
    const llm: LLMClient = { complete: vi.fn().mockRejectedValue(new Error("boom")) };
    const res = await makeHandler(llm)(get());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_unavailable" });
  });

  it("校验失败（伪造组件名）返回 503 且结果不写入缓存", async () => {
    const llm = makeLLM(JSON.stringify({ tree: { component: "evil", props: {} } }));
    const handler = makeHandler(llm);
    const res = await handler(get());
    expect(res.status).toBe(503);
    // 再次请求仍然调用 LLM（坏结果没有被缓存）
    await handler(get());
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it("LLM 输出非法 JSON 返回 503", async () => {
    const llm = makeLLM("这不是 JSON");
    const res = await makeHandler(llm)(get());
    expect(res.status).toBe(503);
  });

  it("LLM 失败但有 stale 缓存时返回 stale（200）", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    let now = 0;
    const handler = makeHandler(llm, { developerTtlMs: 100, staleMs: 1000, now: () => now });
    await handler(get()); // 写入缓存（fresh 到 t=100）
    now = 500; // 进入 stale 窗口
    (llm.complete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const res = await handler(get());
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiRenderResponse;
    expect(body.tree).toEqual(goodTree);
  });

  it("resolveSlot 抛错时降级为 503，不让 handler reject", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = makeHandler(makeLLM("{}"), {
      resolveSlot: () => {
        throw new Error("db down");
      },
    });
    const res = await handler(get());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_unavailable" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("onUsage 抛错不影响成功响应，结果仍写入缓存", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const onUsage = vi.fn(() => {
      throw new Error("usage sink down");
    });
    const handler = makeHandler(llm, { onUsage });
    const res = await handler(get());
    expect(res.status).toBe(200);
    // 第二次请求命中缓存，说明结果已写入
    await handler(get());
    expect(llm.complete).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("未知槽位返回 404，未匹配路径返回 404", async () => {
    const handler = makeHandler(makeLLM("{}"));
    expect((await handler(get("nope"))).status).toBe(404);
    expect((await handler(new Request("https://edge.example/other"))).status).toBe(404);
  });

  it("LLM 调用成功后记录用量日志", async () => {
    const onUsage = vi.fn();
    const llm: LLMClient = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({ tree: goodTree }),
        usage: { promptTokens: 100, completionTokens: 20 },
      }),
    };
    const handler = makeHandler(llm, { onUsage, models: { developer: "big-model" } });
    await handler(get());
    expect(onUsage).toHaveBeenCalledWith({
      slotId: "hero",
      model: "big-model",
      reason: "developer-prompt",
      usage: { promptTokens: 100, completionTokens: 20 },
      at: 1000,
    });
  });
});

describe("createAiRenderHandler — POST 用户路径", () => {
  it("合法提示词走实时调用，meta.reason 为 user-prompt，用户提示词注入编译后的提示词", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const res = await makeHandler(llm)(post("  再短一点  "));
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiRenderResponse;
    expect(body.meta).toEqual({ reason: "user-prompt" });
    const req = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(req.user).toContain("在保持上述组件约束的前提下，按用户要求调整：再短一点");
  });

  it("非法提示词返回 400", async () => {
    const handler = makeHandler(makeLLM("{}"));
    expect((await handler(post(""))).status).toBe(400);
    expect((await handler(post(123))).status).toBe(400);
    expect((await handler(post("x".repeat(501)))).status).toBe(400);
  });

  it("超过限流返回 429（按 x-forwarded-for 分桶）", async () => {
    const handler = makeHandler(makeLLM(JSON.stringify({ tree: goodTree })), {
      rateLimit: { limit: 2, windowMs: 60_000 },
    });
    const ip = { "x-forwarded-for": "1.2.3.4" };
    expect((await handler(post("a", ip))).status).toBe(200);
    expect((await handler(post("b", ip))).status).toBe(200);
    expect((await handler(post("c", ip))).status).toBe(429);
    expect((await handler(post("c", { "x-forwarded-for": "5.6.7.8" }))).status).toBe(200);
  });

  it("GET 与 POST 使用不同的缓存 key 与模型档位", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const handler = makeHandler(llm, { models: { developer: "big-model", user: "small-model" } });
    await handler(get());
    await handler(post("hi"));
    const calls = (llm.complete as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2); // 缓存互不命中
    expect(calls[0][0].model).toBe("big-model");
    expect(calls[1][0].model).toBe("small-model");
  });

  it("规范化后等价的用户提示词命中同一缓存", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const handler = makeHandler(llm);
    await handler(post("Hello   World"));
    await handler(post("  hello world "));
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });
});
