import type { Renderer } from "@ai-slot/runtime";

export interface DomComponentDef {
  /** 组件映射到的 HTML 标签 */
  tag: string;
  class?: string;
  /** 写入 props。实现方必须用 textContent 写文本，禁止把 AI 文本塞进 innerHTML。 */
  applyProps?: (el: HTMLElement, props: Record<string, unknown>) => void;
  /** 子元素挂载点，默认组件元素本身 */
  childrenTarget?: (el: HTMLElement) => HTMLElement;
}

/** 内置 DOM 渲染器：按注册表 tag 映射直接建 DOM。未注册组件跳过并警告。 */
export function createDomRenderer(components: Record<string, DomComponentDef>): Renderer {
  return (node, ctx) => {
    const def = components[node.component];
    if (!def) {
      console.warn(`[ai-slot] 组件未在客户端注册，已跳过: ${node.component}`);
      return null;
    }
    const el = document.createElement(def.tag);
    if (def.class) el.className = def.class;
    def.applyProps?.(el, node.props ?? {});
    const target = def.childrenTarget?.(el) ?? el;
    for (const child of ctx.children) target.appendChild(child);
    return el;
  };
}
