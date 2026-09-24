import { describe, expect, it } from "vitest";
import { defineRegistry } from "./define-registry.js";

describe("defineRegistry", () => {
  it("把字符串简写 props 规范化为完整 Schema", () => {
    const registry = defineRegistry({
      components: {
        "hero-banner": {
          description: "页面顶部主视觉区",
          props: {
            title: "string",
            cta: { type: "object", props: { label: "string", href: "string" } },
          },
          slots: ["media"],
          dataSources: ["latestPosts"],
        },
      },
    });
    const def = registry.components["hero-banner"];
    expect(def.props.title).toEqual({ type: "string" });
    expect(def.props.cta).toEqual({
      type: "object",
      props: { label: { type: "string" }, href: { type: "string" } },
    });
    expect(def.slots).toEqual(["media"]);
    expect(def.dataSources).toEqual(["latestPosts"]);
  });

  it("为缺省字段补默认值", () => {
    const registry = defineRegistry({
      components: { "markdown-block": { description: "纯内容组件" } },
    });
    expect(registry.components["markdown-block"]).toEqual({
      description: "纯内容组件",
      props: {},
      required: [],
      slots: [],
      dataSources: [],
    });
  });

  it("保留 maxLength / enum 等约束", () => {
    const registry = defineRegistry({
      components: {
        "post-card": {
          description: "文章卡片",
          props: { title: { type: "string", maxLength: 60 }, level: { type: "number", enum: [1, 2, 3] } },
          required: ["title"],
        },
      },
    });
    const def = registry.components["post-card"];
    expect(def.props.title).toEqual({ type: "string", maxLength: 60 });
    expect(def.props.level).toEqual({ type: "number", enum: [1, 2, 3] });
    expect(def.required).toEqual(["title"]);
  });
});
