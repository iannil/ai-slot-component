import { describe, expect, it, vi } from "vitest";
import { withRetry, type LLMClient } from "./llm-client.js";

describe("withRetry", () => {
  const ok = { text: "{}" };

  it("第一次就成功则不重试", async () => {
    const complete = vi.fn().mockResolvedValue(ok);
    const client = withRetry({ complete });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).resolves.toBe(ok);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("失败后重试 1 次，第二次成功则返回结果", async () => {
    const complete = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ok);
    const client = withRetry({ complete });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).resolves.toBe(ok);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("重试次数用尽后抛出最后一次错误", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("always"));
    const client = withRetry({ complete });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).rejects.toThrow("always");
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
