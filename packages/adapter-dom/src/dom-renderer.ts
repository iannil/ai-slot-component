import type { Renderer } from "@ai-slot/runtime";

export interface DomComponentDef {
  /** 组件映射到的 HTML 标签 */
  tag: string;
  class?: string;
  /** 写入 props。实现方必须用 textContent 写文本，禁止把 AI 文本塞进 innerHTML。 */
  applyProps?: (el: HTMLElement, props: Record<string, unknown>) => void;
  /** 子元素挂载点，默认组件元素本身 */
  childrenTarget?: (el: HTMLElement) => HTMLElement;
  /** 命名槽位各自的挂载点，必须是组件元素本身或其后代 */
  slotTargets?: Record<string, (el: HTMLElement) => HTMLElement>;
}

/** 内置 DOM 渲染器：按注册表 tag 映射直接建 DOM。未注册组件跳过并警告。默认 children 与命名槽位分别挂载到已声明目标。 */
export function createDomRenderer(components: Record<string, DomComponentDef>): Renderer {
  return (node, ctx) => {
    const def = Object.hasOwn(components, node.component) ? components[node.component] : undefined;
    if (!def) {
      console.warn(`[ai-slot] 组件未在客户端注册，已跳过: ${node.component}`);
      return null;
    }
    const el = document.createElement(def.tag);
    if (def.class) el.className = def.class;
    def.applyProps?.(el, node.props ?? {});
    const target = def.childrenTarget?.(el) ?? el;
    for (const child of ctx.children) target.appendChild(child);
    for (const [name, nodes] of Object.entries(ctx.slots)) {
      const getTarget = Object.hasOwn(def.slotTargets ?? {}, name) ? def.slotTargets?.[name] : undefined;
      if (!getTarget) throw new Error(`unsupported_slot:${name}`);
      const namedTarget = getTarget(el);
      if (namedTarget !== el && !el.contains(namedTarget)) throw new Error(`invalid_slot_target:${name}`);
      for (const child of nodes) namedTarget.appendChild(child);
    }
    return el;
  };
}
