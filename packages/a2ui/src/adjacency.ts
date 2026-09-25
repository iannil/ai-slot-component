import type { ComponentNode } from "@ai-slot/registry";
import type { A2uiComponent } from "./types.js";

/**
 * 邻接表 → 嵌套树。违反任一规则整体判 null（调用方静默兜底）：
 * 恰好一个根；孤儿引用 / 重复 id / 环 / 多父引用（树语义）/ 非法 id → null。
 * 节点数与深度上限不在本层实现——转换结果交由 validateComponentTree 统一把关。
 */
export function adjacencyToTree(components: A2uiComponent[]): ComponentNode | null {
  if (!Array.isArray(components) || components.length === 0) return null;
  const byId = new Map<string, A2uiComponent>();
  for (const comp of components) {
    if (typeof comp?.id !== "string" || typeof comp?.component !== "string" || byId.has(comp.id)) return null;
    byId.set(comp.id, comp);
  }
  const referenced = new Set<string>();
  for (const comp of components) {
    for (const child of Array.isArray(comp.children) ? comp.children : []) {
      if (typeof child !== "string" || !byId.has(child) || referenced.has(child)) return null;
      referenced.add(child);
    }
  }
  const roots = components.filter((comp) => !referenced.has(comp.id));
  if (roots.length !== 1) return null;
  const build = (id: string, path: Set<string>): ComponentNode | null => {
    if (path.has(id)) return null; // 环
    const comp = byId.get(id)!;
    const next = new Set(path).add(id);
    const children: ComponentNode[] = [];
    for (const child of Array.isArray(comp.children) ? comp.children : []) {
      const node = build(child, next);
      if (!node) return null;
      children.push(node);
    }
    const { id: _id, component, children: _children, ...props } = comp;
    return {
      component,
      ...(Object.keys(props).length > 0 ? { props } : {}),
      ...(children.length > 0 ? { children } : {}),
    };
  };
  return build(roots[0].id, new Set());
}
