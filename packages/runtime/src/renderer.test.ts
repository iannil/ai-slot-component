import type { ComponentNode } from "@ai-slot/registry";
import { describe, expect, it, vi } from "vitest";
import { getRenderer, registerRenderer, renderTree, type Renderer } from "./renderer.js";

describe("registerRenderer / getRenderer", () => {
  it("注册后可按名字取回", () => {
    const r: Renderer = () => null;
    registerRenderer("test-basic", r);
    expect(getRenderer("test-basic")).toBe(r);
    expect(getRenderer("not-exists")).toBeUndefined();
  });
});

describe("renderTree", () => {
  it("自底向上组装：子节点先渲染为 HTMLElement，再交给父节点", async () => {
    const renderer: Renderer = (node, ctx) => {
      const el = document.createElement(node.component === "root" ? "section" : "p");
      el.textContent = (node.props?.text as string) ?? "";
      for (const child of ctx.children) el.appendChild(child);
      return el;
    };
    const tree: ComponentNode = {
      component: "root",
      children: [{ component: "leaf", props: { text: "子内容" } }],
    };
    const el = await renderTree(renderer, tree);
    expect(el?.tagName).toBe("SECTION");
    expect(el?.querySelector("p")?.textContent).toBe("子内容");
  });

  it("命名槽位的节点渲染后按槽位名分组传入 ctx.slots", async () => {
    const renderer: Renderer = (node, ctx) => {
      const el = document.createElement("div");
      el.dataset.component = node.component;
      for (const [name, els] of Object.entries(ctx.slots)) {
        for (const child of els) {
          child.dataset.slot = name;
          el.appendChild(child);
        }
      }
      return el;
    };
    const el = await renderTree(renderer, {
      component: "layout",
      slots: { media: [{ component: "img-box" }] },
    });
    expect(el?.querySelector("[data-component=img-box]")?.getAttribute("data-slot")).toBe("media");
  });

  it("Renderer 返回 null 的节点被跳过", async () => {
    const renderer: Renderer = (node, ctx) => {
      if (node.component === "skip") return null;
      const el = document.createElement("div");
      for (const child of ctx.children) el.appendChild(child);
      return el;
    };
    const el = await renderTree(renderer, {
      component: "root",
      children: [{ component: "skip" }, { component: "keep" }],
    });
    expect(el?.childNodes).toHaveLength(1);
  });
});
