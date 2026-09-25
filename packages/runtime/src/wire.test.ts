import { describe, expect, it } from "vitest";
import type { ComponentNode } from "@ai-slot/registry";
import { parseWithWireFormats, registerWireFormat, unregisterWireFormat, type WireFormat } from "./wire.js";

const fmt = (marker: string, tree: ComponentNode | null): WireFormat => ({
  detect: (d) => typeof d === "object" && d !== null && (d as Record<string, unknown>).marker === marker,
  parse: () => tree,
});

describe("registerWireFormat / parseWithWireFormats", () => {
  it("命中者生效，未命中者被跳过", () => {
    registerWireFormat("m1-a", fmt("m1", { component: "a" }));
    registerWireFormat("m1-b", fmt("nope", { component: "b" }));
    expect(parseWithWireFormats({ marker: "m1" })).toEqual({ matched: true, tree: { component: "a" } });
  });

  it("按注册顺序，首个命中者生效", () => {
    const order: string[] = [];
    registerWireFormat("m2-a", {
      detect: (d) => (order.push("a"), (d as Record<string, unknown>).marker === "m2"),
      parse: () => ({ component: "a" }),
    });
    registerWireFormat("m2-b", {
      detect: (d) => (order.push("b"), (d as Record<string, unknown>).marker === "m2"),
      parse: () => ({ component: "b" }),
    });
    expect(parseWithWireFormats({ marker: "m2" })).toEqual({ matched: true, tree: { component: "a" } });
    expect(order).toEqual(["a"]);
  });

  it("全部未命中返回 matched: false", () => {
    registerWireFormat("m3", fmt("m3", null));
    expect(parseWithWireFormats({ marker: "其它" })).toEqual({ matched: false, tree: null });
  });

  it("detect 抛异常按未命中处理，继续尝试后续格式", () => {
    registerWireFormat("m4", { detect: () => { throw new Error("boom"); }, parse: () => ({ component: "x" }) });
    registerWireFormat("m4-after", fmt("m4", { component: "ok" }));
    expect(parseWithWireFormats({ marker: "m4" })).toEqual({ matched: true, tree: { component: "ok" } });
  });

  it("parse 抛异常按失败处理（matched 仍为 true，不回退原生路径）", () => {
    registerWireFormat("m5", {
      detect: (d) => (d as Record<string, unknown>).marker === "m5",
      parse: () => { throw new Error("boom"); },
    });
    expect(parseWithWireFormats({ marker: "m5" })).toEqual({ matched: true, tree: null });
  });

  it("同 id 后注册覆盖先注册", () => {
    registerWireFormat("m6", fmt("m6", { component: "first" }));
    registerWireFormat("m6", fmt("m6", { component: "second" }));
    expect(parseWithWireFormats({ marker: "m6" })).toEqual({ matched: true, tree: { component: "second" } });
  });
});

describe("unregisterWireFormat", () => {
  it("注销后 parseWithWireFormats 不再命中该格式", () => {
    registerWireFormat("m7", fmt("m7", { component: "a" }));
    expect(unregisterWireFormat("m7")).toBe(true);
    expect(parseWithWireFormats({ marker: "m7" })).toEqual({ matched: false, tree: null });
  });

  it("注销不存在的 id 返回 false", () => {
    expect(unregisterWireFormat("m8-不存在")).toBe(false);
  });
});
