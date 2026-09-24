import type { ComponentNode } from "./types.js";

/**
 * 派生组件骨架：结构确定、文本占位（所有字符串置空）。
 * 用于 SSE 流式渲染的第一帧；纯函数，不修改入参。
 */
export function deriveSkeleton(node: ComponentNode): ComponentNode {
  const out: ComponentNode = { component: node.component };
  if (node.props !== undefined) out.props = blankStrings(node.props) as Record<string, unknown>;
  if (node.children !== undefined) out.children = node.children.map(deriveSkeleton);
  if (node.slots !== undefined) {
    const slots: Record<string, ComponentNode[]> = {};
    for (const [name, nodes] of Object.entries(node.slots)) {
      slots[name] = nodes.map(deriveSkeleton);
    }
    out.slots = slots;
  }
  return out;
}

function blankStrings(value: unknown): unknown {
  if (typeof value === "string") return "";
  if (Array.isArray(value)) return value.map(blankStrings);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = blankStrings(v);
    return out;
  }
  return value;
}
