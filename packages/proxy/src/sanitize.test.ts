import { describe, expect, it } from "vitest";
import { sanitizeUserPrompt } from "./sanitize.js";

describe("sanitizeUserPrompt", () => {
  it("接受正常输入并 trim", () => {
    expect(sanitizeUserPrompt("  再短一点  ")).toBe("再短一点");
  });

  it("拒绝非字符串 / 空串 / 纯空白", () => {
    expect(sanitizeUserPrompt(undefined)).toBeNull();
    expect(sanitizeUserPrompt(123)).toBeNull();
    expect(sanitizeUserPrompt("")).toBeNull();
    expect(sanitizeUserPrompt("   ")).toBeNull();
  });

  it("拒绝超长输入（默认 500 字符）", () => {
    expect(sanitizeUserPrompt("x".repeat(500))).toHaveLength(500);
    expect(sanitizeUserPrompt("x".repeat(501))).toBeNull();
  });

  it("剥离控制字符", () => {
    expect(sanitizeUserPrompt("a\u0007b")).toBe("a b");
    expect(sanitizeUserPrompt("a\u0085b")).toBe("ab");
    expect(sanitizeUserPrompt("a\u009Fb")).toBe("ab");
  });

  it("保留连字符等正常标点", () => {
    expect(sanitizeUserPrompt("short-term title")).toBe("short-term title");
  });

  it("maxLength 可配置", () => {
    expect(sanitizeUserPrompt("12345", 4)).toBeNull();
    expect(sanitizeUserPrompt("1234", 4)).toBe("1234");
  });
});
