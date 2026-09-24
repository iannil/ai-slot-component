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

describe("validateComponentTree — props 对抗性校验", () => {
  const strict = defineRegistry({
    components: {
      "post-card": {
        description: "文章卡片",
        props: {
          title: { type: "string", maxLength: 10 },
          level: { type: "number", enum: [1, 2, 3] },
          pinned: "boolean",
          tags: { type: "array", maxItems: 3, items: "string" },
          cta: { type: "object", props: { label: "string", href: "string" } },
        },
        required: ["title"],
      },
    },
  });

  it("拒绝超长的字符串 prop", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { title: "这是一段非常非常长的标题" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].path).toBe("tree.props.title");
  });

  it("拒绝枚举之外的值", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { title: "ok", level: 99 } });
    expect(r.ok).toBe(false);
  });

  it("拒绝类型错误的 prop", () => {
    for (const props of [{ title: 123 }, { title: "ok", pinned: "yes" }, { title: "ok", tags: "a,b" }]) {
      const r = validateComponentTree(strict, { component: "post-card", props });
      expect(r.ok).toBe(false);
    }
  });

  it("拒绝未声明的 prop（防 AI 夹带私货，如 onclick）", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { title: "ok", onclick: "alert(1)" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("props");
  });

  it("拒绝缺少必填 prop", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { pinned: true } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toContain("必填");
  });

  it("拒绝超过 maxItems 的数组", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { title: "ok", tags: ["a", "b", "c", "d"] } });
    expect(r.ok).toBe(false);
  });

  it("校验嵌套 object 的内部属性", () => {
    const bad = validateComponentTree(strict, { component: "post-card", props: { title: "ok", cta: { label: 1 } } });
    expect(bad.ok).toBe(false);
    const good = validateComponentTree(strict, { component: "post-card", props: { title: "ok", cta: { label: "开始", href: "/docs" } } });
    expect(good).toEqual({ ok: true });
  });

  it("注入文本作为字符串 prop 是合法的——它只是惰性文本，安全由『永不渲染为 HTML』保证", () => {
    const loose = defineRegistry({ components: { b: { description: "", props: { t: "string" } } } });
    const r = validateComponentTree(loose, { component: "b", props: { t: "<script>alert(1)</script>" } });
    expect(r).toEqual({ ok: true });
  });
});
