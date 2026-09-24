import type { ComponentNode } from "@ai-slot/registry";

export interface RenderContext {
  /** 已渲染完成的默认槽位子元素 */
  children: HTMLElement[];
  /** 已渲染完成的命名槽位子元素，按槽位名分组 */
  slots: Record<string, HTMLElement[]>;
}

/** 把单个组件树节点映射为真实元素；返回 null 表示跳过该节点。 */
export type Renderer = (
  node: ComponentNode,
  ctx: RenderContext,
) => HTMLElement | null | Promise<HTMLElement | null>;

const renderers = new Map<string, Renderer>();

/** 注册渲染适配器，如 registerRenderer("dom", createDomRenderer(...))。渲染器必须与导入 runtime 的代码在同一 module graph 中同步注册（custom elements upgrade 是同步的，首个 load 只推迟到一个 microtask）。 */
export function registerRenderer(name: string, renderer: Renderer): void {
  renderers.set(name, renderer);
}

export function getRenderer(name: string): Renderer | undefined {
  return renderers.get(name);
}

/** 递归渲染组件树：先渲染子节点与命名槽位，再交给 Renderer 组装当前节点。 */
export async function renderTree(renderer: Renderer, node: ComponentNode): Promise<HTMLElement | null> {
  const children: HTMLElement[] = [];
  for (const child of node.children ?? []) {
    const el = await renderTree(renderer, child);
    if (el) children.push(el);
  }
  const slots: Record<string, HTMLElement[]> = {};
  for (const [name, nodes] of Object.entries(node.slots ?? {})) {
    slots[name] = [];
    for (const child of nodes) {
      const el = await renderTree(renderer, child);
      if (el) slots[name].push(el);
    }
  }
  return renderer(node, { children, slots });
}
