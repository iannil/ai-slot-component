import { h, type Component, type VNode } from "vue";
import type { ComponentNode } from "@ai-slot/registry";

export type VueComponentMap = Record<string, Component>;

/**
 * 把 AI 组件树映射为 Vue VNode。未注册组件跳过并警告（渲染其余部分）。
 * 默认槽位 children → 默认 slot；命名槽位 → 同名 prop（渲染后的 VNode 数组）。
 */
export function treeToVue(components: VueComponentMap, node: ComponentNode): VNode | null {
  // Object.hasOwn：阻断 "constructor"/"toString" 之类沿原型链命中的组件名
  const Comp = Object.hasOwn(components, node.component) ? components[node.component] : undefined;
  if (!Comp) {
    console.warn(`[ai-slot] 组件未在客户端注册，已跳过: ${node.component}`);
    return null;
  }
  const children = (node.children ?? [])
    .map((child) => treeToVue(components, child))
    .filter((v): v is VNode => v !== null);
  const props: Record<string, unknown> = { ...(node.props ?? {}) };
  for (const [slotName, nodes] of Object.entries(node.slots ?? {})) {
    props[slotName] = nodes
      .map((child) => treeToVue(components, child))
      .filter((v): v is VNode => v !== null);
  }
  return h(Comp, props, () => children);
}
