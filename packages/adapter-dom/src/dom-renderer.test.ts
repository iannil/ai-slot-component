import { renderTree } from "@ai-slot/runtime";
import { describe, expect, it, vi } from "vitest";
import { createDomRenderer, type DomComponentDef } from "./dom-renderer.js";

const components: Record<string, DomComponentDef> = {
  "hero-banner": {
    tag: "section",
    class: "hero",
    applyProps: (el, props) => {
      const h1 = document.createElement("h1");
      h1.textContent = String(props.title ?? "");
      el.appendChild(h1);
    },
  },
  "markdown-block": {
    tag: "div",
    class: "markdown",
    applyProps: (el, props) => {
      el.textContent = String(props.content ?? "");
    },
  },
};

describe("createDomRenderer", () => {
  it("按注册表 tag 映射建 DOM，children 挂到父元素", async () => {
    const renderer = createDomRenderer(components);
    const el = await renderTree(renderer, {
      component: "hero-banner",
      props: { title: "AI 标题" },
      children: [{ component: "markdown-block", props: { content: "正文" } }],
    });
    expect(el?.tagName).toBe("SECTION");
    expect(el?.className).toBe("hero");
    expect(el?.querySelector("h1")?.textContent).toBe("AI 标题");
    expect(el?.querySelector(".markdown")?.textContent).toBe("正文");
  });

  it("AI 文本经 textContent 写入，不会被解析为 HTML", async () => {
    const renderer = createDomRenderer(components);
    const el = await renderTree(renderer, {
      component: "markdown-block",
      props: { content: "<img src=x onerror=alert(1)>" },
    });
    expect(el?.querySelector("img")).toBeNull();
    expect(el?.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("未注册的组件跳过并警告，渲染其余部分", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const renderer = createDomRenderer(components);
    const el = await renderTree(renderer, {
      component: "hero-banner",
      props: { title: "ok" },
      children: [{ component: "not-registered" }, { component: "markdown-block", props: { content: "保留" } }],
    });
    expect(el?.querySelector(".markdown")?.textContent).toBe("保留");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not-registered"));
    warn.mockRestore();
  });

  it("原型链上的键（如 constructor）不被当作已注册组件", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const renderer = createDomRenderer(components);
    const el = await renderTree(renderer, {
      component: "hero-banner",
      props: { title: "ok" },
      children: [{ component: "constructor" }, { component: "markdown-block", props: { content: "保留" } }],
    });
    expect(el?.querySelector(".markdown")?.textContent).toBe("保留");
    expect(el?.querySelector("undefined")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("constructor"));
    warn.mockRestore();
  });

  it("childrenTarget 可指定子元素挂载点", async () => {
    const renderer = createDomRenderer({
      card: {
        tag: "article",
        childrenTarget: (el) => {
          const body = document.createElement("div");
          body.className = "card-body";
          el.appendChild(body);
          return body;
        },
      },
      text: { tag: "p", applyProps: (el, props) => { el.textContent = String(props.t ?? ""); } },
    });
    const el = await renderTree(renderer, {
      component: "card",
      children: [{ component: "text", props: { t: "在 body 里" } }],
    });
    expect(el?.querySelector(".card-body p")?.textContent).toBe("在 body 里");
  });
});
