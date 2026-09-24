import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { treeToReact } from "./tree-to-react.js";

const components = {
  "hero-banner": ({ title, subtitle, children }: Record<string, unknown>) => (
    <section className="hero">
      <h1>{String(title ?? "")}</h1>
      <p>{String(subtitle ?? "")}</p>
      {children as never}
    </section>
  ),
  "markdown-block": ({ content }: Record<string, unknown>) => <div className="md">{String(content ?? "")}</div>,
};

describe("treeToReact", () => {
  it("把组件树映射为 React 组件并渲染 children", () => {
    const node = {
      component: "hero-banner",
      props: { title: "AI 标题", subtitle: "副标题" },
      children: [{ component: "markdown-block", props: { content: "正文" } }],
    };
    const html = renderToStaticMarkup(<>{treeToReact(components, node)}</>);
    expect(html).toContain("<h1>AI 标题</h1>");
    expect(html).toContain("<p>副标题</p>");
    expect(html).toContain('<div class="md">正文</div>');
  });

  it("未注册组件跳过并警告", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const node = {
      component: "hero-banner",
      props: { title: "t" },
      children: [{ component: "constructor" }, { component: "markdown-block", props: { content: "保留" } }],
    };
    const html = renderToStaticMarkup(<>{treeToReact(components, node)}</>);
    expect(html).toContain("保留");
    expect(html).not.toContain("constructor");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("命名槽位以同名 prop 传给组件", () => {
    const seen: unknown[] = [];
    const map = {
      layout: (props: Record<string, unknown>) => {
        seen.push(props.media);
        return <div>{props.media as never}</div>;
      },
      leaf: () => <span>L</span>,
    };
    renderToStaticMarkup(<>{treeToReact(map, { component: "layout", slots: { media: [{ component: "leaf" }] } })}</>);
    expect(seen).toHaveLength(1);
  });

  it("AI 文本作为 React children 转义，不会被解析为 HTML", () => {
    const html = renderToStaticMarkup(
      <>{treeToReact(components, { component: "markdown-block", props: { content: "<img src=x>" } })}</>,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
