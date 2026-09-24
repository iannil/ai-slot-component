import { describe, expect, it, vi } from "vitest";
import { createOpenAIClient } from "./openai-client.js";

const fixtureBody = {
  choices: [{ message: { content: '{"version":1,"slot":"hero","tree":{"component":"a"}}' } }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
};

function fakeFetch(impl: (url: string, init: RequestInit) => unknown): typeof fetch {
  return vi.fn((url: unknown, init: unknown) => Promise.resolve(impl(url as string, init as RequestInit))) as unknown as typeof fetch;
}

describe("createOpenAIClient", () => {
  it("发送正确的请求并解析 content 与 usage", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = fakeFetch((url, init) => {
      captured = { url, init };
      return { ok: true, json: () => Promise.resolve(fixtureBody) };
    });
    const client = createOpenAIClient({ apiKey: "sk-test", fetchImpl });
    const res = await client.complete({ model: "gpt-4o-mini", system: "sys", user: "usr", maxTokens: 500 });

    expect(captured?.url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = captured?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    const body = JSON.parse(captured?.init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "usr" }]);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(500);
    expect(res.text).toContain('"version":1');
    expect(res.usage).toEqual({ promptTokens: 100, completionTokens: 20 });
  });

  it("HTTP 非 2xx 抛 LLMError", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 500 }));
    const client = createOpenAIClient({ apiKey: "sk-test", fetchImpl });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).rejects.toThrow("500");
  });

  it("响应缺少 content 时抛 LLMError", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, json: () => Promise.resolve({ choices: [] }) }));
    const client = createOpenAIClient({ apiKey: "sk-test", fetchImpl });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).rejects.toThrow("缺少内容");
  });

  it("支持自定义 baseUrl（OpenAI 兼容端点）", async () => {
    let capturedUrl = "";
    const fetchImpl = fakeFetch((url) => {
      capturedUrl = url;
      return { ok: true, json: () => Promise.resolve(fixtureBody) };
    });
    const client = createOpenAIClient({ apiKey: "k", baseUrl: "https://api.deepseek.com/v1", fetchImpl });
    await client.complete({ model: "deepseek-chat", system: "s", user: "u" });
    expect(capturedUrl).toBe("https://api.deepseek.com/v1/chat/completions");
  });
});
