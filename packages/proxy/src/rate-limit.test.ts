import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit.js";

describe("RateLimiter（滑动窗口）", () => {
  it("窗口内未超限制全部放行，超限拒绝", () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip1", 1000)).toBe(true);
    expect(limiter.check("ip1", 2000)).toBe(true);
    expect(limiter.check("ip1", 3000)).toBe(false);
  });

  it("不同 key 互不影响", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip2", 0)).toBe(true);
    expect(limiter.check("ip1", 1)).toBe(false);
  });

  it("窗口滑过后恢复放行", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip1", 30_000)).toBe(false);
    expect(limiter.check("ip1", 60_001)).toBe(true);
  });
});
