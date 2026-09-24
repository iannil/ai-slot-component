import { describe, expect, it } from "vitest";
import { defineRegistry } from "./define-registry.js";
import { validateComponentTree } from "./validator.js";

const registry = defineRegistry({
  components: {
    "hero-banner": {
      description: "主视觉",
      props: { title: { type: "string", maxLength: 60 } },
      required: ["title"],
      slots: ["default"],
    },
    "markdown-block": {
      description: "纯内容",
      props: { content: "string" },
    },
  },
});

describe("validateComponentTree — 结构与组件名", () => {
  it("接受合法的组件树", () => {
    const result = validateComponentTree(registry, {
      component: "hero-banner",
      props: { title: "你好" },
      children: [{ component: "markdown-block", props: { content: "正文" } }],
    });
    expect(result).toEqual({ ok: true });
  });

  it("拒绝伪造的组件名", () => {
    const result = validateComponentTree(registry, { component: "evil-script", props: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].rule).toBe("unknown-component");
  });

  it("拒绝非对象节点（null / 数组 / 字符串 / 数字）", () => {
    for (const bad of [null, [], "text", 42]) {
      const result = validateComponentTree(registry, bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].rule).toBe("structure");
    }
  });

  it("拒绝缺少 component 字段的节点", () => {
    const result = validateComponentTree(registry, { props: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].rule).toBe("structure");
  });

  it("错误信息带路径", () => {
    const result = validateComponentTree(registry, {
      component: "hero-banner",
      props: { title: "ok" },
      children: [{ component: "nope" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe("tree.children[0]");
  });
});
