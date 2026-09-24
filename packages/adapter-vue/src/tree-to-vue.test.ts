import { renderToString } from "@vue/server-renderer";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import { treeToVue } from "./tree-to-vue.js";

const components = {
  "hero-banner": defineComponent({
    props: ["title", "subtitle"],
    setup(props, { slots }) {
      return () => h("section", { class: "hero" }, [h("h1", String(props.title ?? "")), slots.default?.()]);
    },
  }),
  "markdown-block": defineComponent({
    props: ["content"],
    setup: (props) => () => h("div", { class: "md" }, String(props.content ?? "")),
  }),
};

describe("treeToVue", () => {
  it("把组件树映射为 Vue VNode 并渲染 children", async () => {
    const vnode = treeToVue(components, {
      component: "hero-banner",
      props: { title: "AI 标题" },
      children: [{ component: "markdown-block", props: { content: "正文" } }],
    });
    const html = await renderToString(h("div", [vnode]));
    expect(html).toContain("<h1>AI 标题</h1>");
    expect(html).toContain("正文");
  });

  it("未注册组件跳过并警告", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const vnode = treeToVue(components, {
      component: "hero-banner",
      props: { title: "t" },
      children: [{ component: "constructor" }, { component: "markdown-block", props: { content: "保留" } }],
    });
    const html = await renderToString(h("div", [vnode]));
    expect(html).toContain("保留");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("constructor"));
    warn.mockRestore();
  });
});
