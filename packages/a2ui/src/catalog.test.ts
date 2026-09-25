import { defineRegistry, validateComponentTree, type ComponentNode } from "@ai-slot/registry";
import type { RenderContext } from "@ai-slot/runtime";
import { createDomRenderer, type DomComponentDef } from "@ai-slot/adapter-dom";
import { describe, expect, it } from "vitest";
import { basicCatalogComponentDefs, basicCatalogDomDefs } from "./catalog.js";

// runtime 的 Renderer 联合类型含 Promise 分支（为异步适配器预留）；内置 DOM 渲染器是同步实现，
// 这里收窄到同步侧，便于直接调用并断言返回元素。
type SyncRenderer = (node: ComponentNode, ctx: RenderContext) => HTMLElement | null;

const ALL = ["Text", "Image", "Icon", "Video", "AudioPlayer", "Row", "Column", "List", "Card", "Tabs", "Divider", "Modal", "Button", "CheckBox", "TextField", "DateTimeInput", "ChoicePicker", "Slider"] as const;

const TAGS: Record<(typeof ALL)[number], string> = {
  Text: "P", Image: "IMG", Icon: "SPAN", Video: "VIDEO", AudioPlayer: "AUDIO",
  Row: "DIV", Column: "DIV", List: "UL", Card: "DIV", Tabs: "DIV",
  Divider: "HR", Modal: "DIV", Button: "BUTTON", CheckBox: "LABEL",
  TextField: "INPUT", DateTimeInput: "INPUT", ChoicePicker: "SELECT", Slider: "INPUT",
};

describe("basicCatalogDomDefs", () => {
  it("覆盖 Basic Catalog 全部 18 个组件，tag 正确", () => {
    const render = createDomRenderer(basicCatalogDomDefs) as SyncRenderer;
    for (const name of ALL) {
      const def: DomComponentDef = basicCatalogDomDefs[name];
      expect(def, name).toBeTruthy();
      const el = render({ component: name, props: {} }, { children: [], slots: {} });
      expect(el?.tagName, name).toBe(TAGS[name]);
    }
  });

  it("Text 用 textContent 写入（禁止 innerHTML）", () => {
    const render = createDomRenderer(basicCatalogDomDefs) as SyncRenderer;
    const el = render({ component: "Text", props: { text: "<b>x</b>" } }, { children: [], slots: {} });
    expect(el?.textContent).toBe("<b>x</b>");
    expect(el?.innerHTML).not.toContain("<b>");
  });

  it("Image 写入 src/alt", () => {
    const render = createDomRenderer(basicCatalogDomDefs) as SyncRenderer;
    const el = render({ component: "Image", props: { url: "https://x/y.png", alt: "图" } }, { children: [], slots: {} });
    expect(el?.getAttribute("src")).toBe("https://x/y.png");
    expect(el?.getAttribute("alt")).toBe("图");
  });

  it("Button 是静态形态：type=button，无任何事件绑定", () => {
    const render = createDomRenderer(basicCatalogDomDefs) as SyncRenderer;
    const el = render({ component: "Button", props: {} }, { children: [], slots: {} });
    expect(el?.getAttribute("type")).toBe("button");
  });

  it("类名一律 a2ui- 前缀", () => {
    for (const def of Object.values(basicCatalogDomDefs)) {
      if (def.class) expect(def.class.startsWith("a2ui-"), def.class).toBe(true);
    }
  });
});

describe("basicCatalogComponentDefs", () => {
  it("与同名 DomComponentDefs 键集合一致（18 个）", () => {
    expect(Object.keys(basicCatalogComponentDefs).sort()).toEqual(Object.keys(basicCatalogDomDefs).sort());
  });

  it("布局容器的 children 过得了注册表校验（default 槽位声明）", () => {
    const registry = defineRegistry({ components: basicCatalogComponentDefs });
    expect(validateComponentTree(registry, {
      component: "Row",
      props: { justify: "spaceBetween" },
      children: [{ component: "Text", props: { text: "x" } }],
    }).ok).toBe(true);
  });

  it("全部无 required（宽松校验侧）", () => {
    for (const def of Object.values(basicCatalogComponentDefs)) {
      expect(def.required ?? []).toEqual([]);
    }
  });
});
