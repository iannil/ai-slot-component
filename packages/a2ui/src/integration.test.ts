import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRegistry } from "@ai-slot/registry";
import { createDomRenderer } from "@ai-slot/adapter-dom";
import { fetchComponentTree, registerWireFormat, renderTree } from "@ai-slot/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { a2uiWireFormat, basicCatalogComponentDefs, basicCatalogDomDefs, createA2uiWireFormat } from "./index.js";

const registry = defineRegistry({ components: basicCatalogComponentDefs });
// jsdom 环境的 window.URL 会把 file:// 基准错误解析为页面 URL，故先转本地路径再拼接
const rowLayout = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/row-layout.json"), "utf8"),
);

const stubA2uiResponse = (body: unknown): void => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })));
};

describe("A2UI 端点 → ai-slot 交付层（组合集成）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("未注册 wire format：A2UI 响应走原生路径 → null（兜底语义不被破坏）", async () => {
    stubA2uiResponse(rowLayout);
    expect(await fetchComponentTree({ src: "/ai-render/hero", registry })).toBeNull();
  });

  it("注册 wire 后：官方 fixture → 校验通过 → DOM 渲染出真实元素", async () => {
    registerWireFormat("a2ui", a2uiWireFormat);
    stubA2uiResponse(rowLayout);
    const tree = await fetchComponentTree({ src: "/ai-render/hero", registry });
    expect(tree).not.toBeNull();
    const el = await renderTree(createDomRenderer(basicCatalogDomDefs), tree!);
    expect(el?.className).toBe("a2ui-row");
    expect(el?.children).toHaveLength(2);
    expect(el?.textContent).toContain("Left Content");
  });

  it("mappings 把 A2UI 组件改写为注册表品牌组件并渲染", async () => {
    const brandRegistry = defineRegistry({
      // hero-card 须声明 Row 携带的 justify/align，否则改写后未声明 prop 被 validator 拒绝（安全语义）
      components: {
        ...basicCatalogComponentDefs,
        "hero-card": { description: "品牌卡片", props: { justify: "string", align: "string" }, slots: ["default"] },
      },
    });
    // wireFormats 是模块级 Map（同 id 覆盖、按注册顺序探测）：上一用例已注册 "a2ui"，
    // 此处必须同名覆盖，否则先注册的未映射格式会先命中导致 mappings 永不生效
    registerWireFormat("a2ui", createA2uiWireFormat({ mappings: { Row: "hero-card" } }));
    stubA2uiResponse(rowLayout);
    const tree = await fetchComponentTree({ src: "/ai-render/hero", registry: brandRegistry });
    expect(tree?.component).toBe("hero-card");
    const el = await renderTree(
      createDomRenderer({ ...basicCatalogDomDefs, "hero-card": { tag: "section", class: "brand-hero" } }),
      tree!,
    );
    expect(el?.tagName).toBe("SECTION");
    expect(el?.className).toBe("brand-hero");
  });

  it("注册表里没有的组件名：校验拒绝 → null（静默兜底）", async () => {
    const strictRegistry = defineRegistry({ components: { "hero-card": { description: "", slots: ["default"] } } });
    // 覆盖回未映射格式，保证本用例解析出的是 Row/Text（均不在 strictRegistry）
    registerWireFormat("a2ui", a2uiWireFormat);
    stubA2uiResponse(rowLayout); // Row/Text 不在 strictRegistry
    expect(await fetchComponentTree({ src: "/ai-render/hero", registry: strictRegistry })).toBeNull();
  });

  it("超深度链：validator 上限拦截 → null（parse 层不做上限，统一由 validator 把关）", async () => {
    registerWireFormat("a2ui", a2uiWireFormat); // 与上一用例同格式，显式重注册保持自包含
    const deep = {
      version: "v1.0",
      updateComponents: {
        surfaceId: "s",
        components: [
          { id: "n0", component: "Column", children: ["n1"] },
          { id: "n1", component: "Column", children: ["n2"] },
          { id: "n2", component: "Column", children: ["n3"] },
          { id: "n3", component: "Column", children: ["n4"] },
          { id: "n4", component: "Column", children: ["n5"] },
          { id: "n5", component: "Text", text: "底" },
        ],
      },
    };
    stubA2uiResponse(deep); // 树深 6 > 默认 maxDepth 5
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
  });
});
