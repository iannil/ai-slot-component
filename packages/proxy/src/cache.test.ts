import { describe, expect, it } from "vitest";
import {
  MemoryCacheStore,
  developerCacheKey,
  hashKey,
  lookup,
  normalizeUserPrompt,
  userCacheKey,
} from "./cache.js";

describe("MemoryCacheStore + lookup", () => {
  it("TTL 内返回 fresh，超过 TTL 但在 stale 窗口内返回 stale，之后彻底失效", () => {
    const store = new MemoryCacheStore();
    store.set("k", "v", 1000, 5000, 0);
    expect(lookup(store, "k", 500)).toEqual({ value: "v", status: "fresh" });
    expect(lookup(store, "k", 2000)).toEqual({ value: "v", status: "stale" });
    expect(lookup(store, "k", 6001)).toBeUndefined();
    expect(lookup(store, "k", 99999)).toBeUndefined();
  });

  it("未命中的 key 返回 undefined", () => {
    expect(lookup(new MemoryCacheStore(), "nope", 0)).toBeUndefined();
  });
});

describe("key 生成", () => {
  it("hashKey 稳定且为字符串", () => {
    expect(hashKey("a|b|c")).toBe(hashKey("a|b|c"));
    expect(typeof hashKey("a|b|c")).toBe("string");
    expect(hashKey("a|b|c")).not.toBe(hashKey("a|b|d"));
  });

  it("developerCacheKey 随内容/提示词版本变化", () => {
    const base = developerCacheKey("hero", "v1", "p1");
    expect(base).toBe(developerCacheKey("hero", "v1", "p1"));
    expect(base).not.toBe(developerCacheKey("hero", "v2", "p1"));
    expect(base).not.toBe(developerCacheKey("hero", "v1", "p2"));
    expect(base.startsWith("dev:")).toBe(true);
  });

  it("normalizeUserPrompt 做大小写与空白归一", () => {
    expect(normalizeUserPrompt("  换成   更短的 标题 \n")).toBe("换成 更短的 标题");
    expect(normalizeUserPrompt("Hello  World")).toBe("hello world");
  });

  it("userCacheKey 对规范化后等价的提示词命中同一 key", () => {
    expect(userCacheKey("hero", "  Hello   World ")).toBe(userCacheKey("hero", "hello world"));
    expect(userCacheKey("hero", "hello world")).not.toBe(userCacheKey("hero", "hello"));
    expect(userCacheKey("hero", "x").startsWith("usr:")).toBe(true);
  });
});
