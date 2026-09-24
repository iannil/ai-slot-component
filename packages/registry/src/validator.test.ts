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

describe("validateComponentTree — 槽位与数量上限", () => {
  const reg = defineRegistry({
    components: {
      layout: { description: "", slots: ["default", "media"] },
      leaf: { description: "" },
    },
  });

  it("拒绝向未声明 default 槽位的组件塞 children", () => {
    const r = validateComponentTree(reg, { component: "leaf", children: [{ component: "leaf" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("slot");
  });

  it("拒绝未声明的命名槽位", () => {
    const r = validateComponentTree(reg, { component: "layout", slots: { sidebar: [{ component: "leaf" }] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("slot");
  });

  it("接受声明过的命名槽位", () => {
    const r = validateComponentTree(reg, { component: "layout", slots: { media: [{ component: "leaf" }] } });
    expect(r).toEqual({ ok: true });
  });

  it("拒绝嵌套炸弹（深度超限）", () => {
    let tree: unknown = { component: "leaf" };
    for (let i = 0; i < 10; i++) tree = { component: "layout", children: [tree] };
    const r = validateComponentTree(reg, tree);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("depth");
  });

  it("拒绝节点炸弹（宽度超限）", () => {
    const tree = {
      component: "layout",
      children: Array.from({ length: 60 }, () => ({ component: "leaf" })),
    };
    const r = validateComponentTree(reg, tree);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("nodes");
  });

  it("上限可配置", () => {
    let tree: unknown = { component: "leaf" };
    for (let i = 0; i < 3; i++) tree = { component: "layout", children: [tree] };
    expect(validateComponentTree(reg, tree, { maxDepth: 2 }).ok).toBe(false);
    expect(validateComponentTree(reg, tree, { maxDepth: 10 })).toEqual({ ok: true });
  });
});

describe("validateComponentTree — 原型链对抗", () => {
  it("拒绝原型链上的伪造组件名（toString/constructor/hasOwnProperty/__proto__）且不抛异常", () => {
    for (const name of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      const r = validateComponentTree(registry, { component: name });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0].rule).toBe("unknown-component");
    }
  });

  it("伪造组件名携带 children 时校验器不抛异常（静默回退）", () => {
    const r = validateComponentTree(registry, { component: "toString", children: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("unknown-component");
  });

  it("拒绝原型链上的未声明 prop 键（constructor/toString/__proto__）", () => {
    const loose = defineRegistry({ components: { b: { description: "", props: { t: "string" } } } });
    const cases: unknown[] = [
      { t: "ok", constructor: "x" },
      { t: "ok", toString: "x" },
      JSON.parse('{"t":"ok","__proto__":{"x":1}}'),
    ];
    for (const props of cases) {
      const r = validateComponentTree(loose, { component: "b", props });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0].rule).toBe("props");
    }
  });
});
