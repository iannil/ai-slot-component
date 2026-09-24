/** LLM 调用的最小抽象：输入分层提示词，输出 JSON 文本。 */

export interface LLMRequest {
  model: string;
  system: string;
  user: string;
  /** token 预算上限 */
  maxTokens?: number;
  /** 超时（ms），默认 8000 */
  timeoutMs?: number;
}

export interface LLMResponse {
  text: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface LLMClient {
  complete(req: LLMRequest): Promise<LLMResponse>;
}

export class LLMError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMError";
  }
}

/** 失败重试：默认重试 1 次（共 2 次尝试）。 */
export function withRetry(client: LLMClient, retries = 1): LLMClient {
  return {
    async complete(req) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await client.complete(req);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    },
  };
}
