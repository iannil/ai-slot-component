import { createElement, Fragment, type ComponentType, type ReactNode } from "react";
import type { ComponentNode } from "@ai-slot/registry";

export type ReactComponentMap = Record<string, ComponentType<Record<string, unknown>>>;

/**
 * 把 AI 组件树映射为 React 元素。未注册组件跳过并警告（渲染其余部分）。
 * 默认槽位 children → 组件 children；命名槽位 → 同名 prop（渲染后的 ReactNode 数组）。
 */
export function treeToReact(components: ReactComponentMap, node: ComponentNode): ReactNode {
  // Object.hasOwn：阻断 "constructor"/"toString" 之类沿原型链命中的组件名
  const Comp = Object.hasOwn(components, node.component) ? components[node.component] : undefined;
  if (!Comp) {
    console.warn(`[ai-slot] 组件未在客户端注册，已跳过: ${node.component}`);
    return null;
  }
  const children = (node.children ?? []).map((child, i) =>
    createElement(Fragment, { key: i }, treeToReact(components, child)),
  );
  const props: Record<string, unknown> = { ...(node.props ?? {}) };
  for (const [slotName, nodes] of Object.entries(node.slots ?? {})) {
    props[slotName] = nodes.map((child, i) =>
      createElement(Fragment, { key: i }, treeToReact(components, child)),
    );
  }
  return createElement(Comp, props, ...children);
}
