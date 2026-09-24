import { LLMError, type LLMClient } from "./llm-client.js";

export interface OpenAIClientOptions {
  apiKey: string;
  /** 默认 https://api.openai.com/v1，可指向任何 OpenAI 兼容端点 */
  baseUrl?: string;
  /** 测试注入用 */
  fetchImpl?: typeof fetch;
}

/** 基于 fetch 的 OpenAI 兼容适配器：零 SDK 依赖，JSON mode 结构化输出。 */
export function createOpenAIClient(opts: OpenAIClientOptions): LLMClient {
  const baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async complete(req) {
      const timeoutMs = req.timeoutMs ?? 8000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${opts.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: req.model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
            response_format: { type: "json_object" },
            ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new LLMError(`LLM HTTP ${res.status}`);
        const data = (await res.json()) as {
          choices?: { message?: { content?: unknown } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = data.choices?.[0]?.message?.content;
        if (typeof text !== "string") throw new LLMError("LLM 响应缺少内容");
        return {
          text,
          usage: { promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
