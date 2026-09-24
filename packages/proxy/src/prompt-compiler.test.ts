import { defineRegistry } from "@ai-slot/registry";
import { describe, expect, it } from "vitest";
import { compilePrompt } from "./prompt-compiler.js";

const registry = defineRegistry({
  components: {
    "hero-banner": {
      description: "页面顶部主视觉区",
      props: { title: { type: "string", maxLength: 60 } },
      required: ["title"],
      slots: ["default"],
    },
  },
});

describe("compilePrompt", () => {
  it("开发者路径：system 含注册表 Schema，user 含原始内容与开发者提示词", () => {
    const result = compilePrompt({
      registry,
      slotId: "hero",
      originalContent: "<h1>我们的产品</h1>",
      developerPrompt: "面向开发者重写",
    });
    expect(result.system).toMatchSnapshot();
    expect(result.user).toMatchSnapshot();
  });

  it("用户路径：用户提示词以受限前缀注入，且排在开发者提示词之后", () => {
    const result = compilePrompt({
      registry,
      slotId: "hero",
      originalContent: "<h1>我们的产品</h1>",
      developerPrompt: "面向开发者重写",
      userPrompt: "再短一点",
      data: { latestPosts: ["a", "b"] },
    });
    expect(result.user).toContain("在保持上述组件约束的前提下，按用户要求调整：再短一点");
    expect(result.user.indexOf("开发者要求")).toBeLessThan(result.user.indexOf("按用户要求调整"));
    expect(result.user).toContain("latestPosts");
    expect(result.user).toMatchSnapshot();
  });

  it("注册表只暴露 description/props/required/slots，不暴露 dataSources", () => {
    const reg = defineRegistry({
      components: { c: { description: "d", dataSources: ["secretQuery"] } },
    });
    const { system } = compilePrompt({ registry: reg, slotId: "s", originalContent: "x" });
    expect(system).not.toContain("secretQuery");
  });
});
