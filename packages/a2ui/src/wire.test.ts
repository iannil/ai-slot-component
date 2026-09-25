import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectA2ui, parseA2ui } from "./wire.js";

// jsdom 环境的 window.URL 会把 file:// 基准错误解析为页面 URL，故先转本地路径再拼接
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), `fixtures/${name}.json`), "utf8"));

describe("detectA2ui", () => {
  it("官方 fixture（messages 包裹）命中", () => {
    expect(detectA2ui(fixture("simple-text"))).toBe(true);
    expect(detectA2ui(fixture("confirmation-v0.9"))).toBe(true);
  });
  it("裸信封数组与单个信封对象命中", () => {
    expect(detectA2ui([{ version: "v1.0", createSurface: { surfaceId: "s" } }])).toBe(true);
    expect(detectA2ui({ version: "v1.0", updateComponents: { surfaceId: "s", components: [] } })).toBe(true);
  });
  it("原生 AiRenderResponse 永不命中（结构不重叠）", () => {
    expect(detectA2ui({ version: 1, slot: "hero", tree: { component: "x" } })).toBe(false);
    expect(detectA2ui({ version: 1, slot: "hero" })).toBe(false);
  });
  it("非对象 / 空 messages / 缺组件键不命中", () => {
    expect(detectA2ui(null)).toBe(false);
    expect(detectA2ui("x")).toBe(false);
    expect(detectA2ui({ messages: [] })).toBe(true); // messages 键存在即命中，交给 parse 判空兜底
    expect(detectA2ui({ name: "x" })).toBe(false);
  });
});

describe("parseA2ui", () => {
  it("simple-text fixture：单 Text 节点，markdown 文本原样", () => {
    expect(parseA2ui(fixture("simple-text"))).toEqual({
      component: "Text",
      props: { text: "# Hello, Minimal Catalog!" },
    });
  });

  it("row-layout fixture：根 Row 携带两个 Text 子节点与布局 props", () => {
    expect(parseA2ui(fixture("row-layout"))).toEqual({
      component: "Row",
      props: { justify: "spaceBetween", align: "center" },
      children: [
        { component: "Text", props: { text: "Left Content", variant: "body" } },
        { component: "Text", props: { text: "Right Content", variant: "caption" } },
      ],
    });
  });

  it("v0.9 confirmation fixture：mappings 改名 + {path} 绑定降级为 prop 缺失", () => {
    const tree = parseA2ui(fixture("confirmation-v0.9"), {
      mappings: { MaterialCard: "card", MaterialColumn: "column", MaterialText: "Text", MaterialImage: "Image", MaterialDivider: "Divider" },
    });
    expect(tree).not.toBeNull();
    expect(tree!.component).toBe("card"); // 根为 MaterialCard
    // data model 绑定被剥掉：树里不应存在 { path: ... } 形态
    const dump = JSON.stringify(tree);
    expect(dump).not.toContain('"path"');
  });

  it("action 字段被丢弃（交互降级）", () => {
    const tree = parseA2ui({
      version: "v1.0",
      updateComponents: {
        surfaceId: "s",
        components: [{ id: "root", component: "Button", label: "Go", action: { name: "submit" } }],
      },
    });
    expect(tree).toEqual({ component: "Button", props: { label: "Go" } });
  });

  it("同 id 组件后帧覆盖（增量合并）", () => {
    const tree = parseA2ui([
      { version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Text", text: "旧" }] } },
      { version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Text", text: "新" }] } },
    ]);
    expect(tree).toEqual({ component: "Text", props: { text: "新" } });
  });

  it("deleteSurface 指向所选 surface → null（内容被撤）", () => {
    expect(parseA2ui([
      { version: "v1.0", createSurface: { surfaceId: "s" } },
      { version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Text" }] } },
      { version: "v1.0", deleteSurface: { surfaceId: "s" } },
    ])).toBeNull();
  });

  it("多 surface：取首个 createSurface，其余忽略", () => {
    const tree = parseA2ui([
      { version: "v1.0", createSurface: { surfaceId: "s1" } },
      { version: "v1.0", createSurface: { surfaceId: "s2" } },
      { version: "v1.0", updateComponents: { surfaceId: "s1", components: [{ id: "root", component: "Text", text: "一" }] } },
      { version: "v1.0", updateComponents: { surfaceId: "s2", components: [{ id: "root", component: "Text", text: "二" }] } },
    ]);
    expect(tree).toEqual({ component: "Text", props: { text: "一" } });
  });

  it("空 messages / 无 updateComponents / 非法邻接表 → null", () => {
    expect(parseA2ui({ messages: [] })).toBeNull();
    expect(parseA2ui([{ version: "v1.0", createSurface: { surfaceId: "s" } }])).toBeNull();
    expect(parseA2ui([{ version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "a", component: "Row", children: ["ghost"] }] } }])).toBeNull();
  });

  it("mappings 未命中的名字保留原样", () => {
    const tree = parseA2ui({
      version: "v1.0",
      updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Card" }] },
    });
    expect(tree).toEqual({ component: "Card" });
  });
});
