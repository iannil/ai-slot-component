import { describe, expect, it } from "vitest";
import { adjacencyToTree } from "./adjacency.js";

describe("adjacencyToTree", () => {
  it("正常转换：根、children、props 提取", () => {
    const tree = adjacencyToTree([
      { id: "a", component: "Row", children: ["b"], justify: "spaceBetween" },
      { id: "b", component: "Text", text: "hi" },
    ]);
    expect(tree).toEqual({
      component: "Row",
      props: { justify: "spaceBetween" },
      children: [{ component: "Text", props: { text: "hi" } }],
    });
  });

  it("空列表 → null", () => {
    expect(adjacencyToTree([])).toBeNull();
  });

  it("重复 id → null", () => {
    expect(adjacencyToTree([
      { id: "a", component: "Text" },
      { id: "a", component: "Text" },
    ])).toBeNull();
  });

  it("孤儿引用 → null", () => {
    expect(adjacencyToTree([{ id: "a", component: "Row", children: ["ghost"] }])).toBeNull();
  });

  it("环 → null", () => {
    expect(adjacencyToTree([
      { id: "a", component: "Row", children: ["b"] },
      { id: "b", component: "Row", children: ["a"] },
    ])).toBeNull();
  });

  it("自引用 → null", () => {
    expect(adjacencyToTree([{ id: "a", component: "Row", children: ["a"] }])).toBeNull();
  });

  it("多父引用（同一 id 被两个 children 引用）→ null（树语义）", () => {
    expect(adjacencyToTree([
      { id: "p1", component: "Row", children: ["shared"] },
      { id: "p2", component: "Row", children: ["shared"] },
      { id: "shared", component: "Text" },
    ])).toBeNull();
  });

  it("多根 → null", () => {
    expect(adjacencyToTree([
      { id: "a", component: "Text" },
      { id: "b", component: "Text" },
    ])).toBeNull();
  });

  it("id/component 缺失或非字符串 → null", () => {
    expect(adjacencyToTree([{ component: "Text" } as never])).toBeNull();
    expect(adjacencyToTree([{ id: 3, component: "Text" } as never])).toBeNull();
    expect(adjacencyToTree([{ id: "a" } as never])).toBeNull();
  });
});
