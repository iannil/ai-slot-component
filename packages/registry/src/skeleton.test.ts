import { describe, expect, it } from "vitest";
import { deriveSkeleton } from "./skeleton.js";

describe("deriveSkeleton", () => {
  it("字符串 prop 置空，非字符串保留，结构保留", () => {
    const skeleton = deriveSkeleton({
      component: "hero-banner",
      props: { title: "标题", count: 3, enabled: true, tags: ["a", "b"], cta: { label: "go", weight: 1 } },
      children: [{ component: "markdown-block", props: { content: "正文" } }],
    });
    expect(skeleton).toEqual({
      component: "hero-banner",
      props: { title: "", count: 3, enabled: true, tags: ["", ""], cta: { label: "", weight: 1 } },
      children: [{ component: "markdown-block", props: { content: "" } }],
    });
  });

  it("命名槽位递归处理", () => {
    const skeleton = deriveSkeleton({
      component: "layout",
      slots: { media: [{ component: "img-box", props: { alt: "图" } }] },
    });
    expect(skeleton).toEqual({
      component: "layout",
      slots: { media: [{ component: "img-box", props: { alt: "" } }] },
    });
  });

  it("不修改原对象（纯函数）", () => {
    const node = { component: "a", props: { t: "x" }, children: [{ component: "b", props: { t: "y" } }] };
    deriveSkeleton(node);
    expect(node.props.t).toBe("x");
    expect(node.children[0].props.t).toBe("y");
  });

  it("缺省 props/children 时字段不凭空出现", () => {
    expect(deriveSkeleton({ component: "a" })).toEqual({ component: "a" });
  });
});
