import { validateComponentTree, type AiRenderResponse, type Registry } from "@ai-slot/registry";
import { getRenderer, renderTree } from "./renderer.js";

let globalRegistry: Registry | undefined;

/** 全局配置：提供 registry 时，客户端在渲染前对 AI 输出再做一次校验（双保险）。 */
export function configureAiSlot(opts: { registry?: Registry }): void {
  globalRegistry = opts.registry;
}

/**
 * <ai-slot> 自定义元素。渐进增强：内部永远先保留原始兜底内容，
 * AI 结果就绪且校验通过后才替换；任何失败静默回退，不白屏、不报错给用户。
 */
export class AiSlotElement extends HTMLElement {
  static observedAttributes = ["src", "renderer", "editable", "refresh-interval"];

  protected fallbackHTML = "";
  protected editor: HTMLElement | null = null;
  private fallbackCaptured = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  connectedCallback(): void {
    // 同一实例可能反复挂载：只在首次捕获兜底，避免被 AI 内容或编辑条污染
    if (!this.fallbackCaptured) {
      this.fallbackHTML = this.innerHTML;
      this.fallbackCaptured = true;
    }
    if (this.hasAttribute("editable")) this.mountEditor();
    const intervalSec = Number(this.getAttribute("refresh-interval") ?? 0);
    if (intervalSec > 0) {
      this.timer = setInterval(() => void this.load(), intervalSec * 1000);
    }
    void this.load();
  }

  disconnectedCallback(): void {
    clearInterval(this.timer);
  }

  /** 拉取并渲染组件树；userPrompt 存在时走 POST 用户路径。失败时静默保留当前内容。 */
  async load(userPrompt?: string): Promise<void> {
    const src = this.getAttribute("src");
    const renderer = getRenderer(this.getAttribute("renderer") ?? "dom");
    if (!src || !renderer) return;
    try {
      const res = await fetch(
        src,
        userPrompt === undefined
          ? undefined
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ prompt: userPrompt }),
            },
      );
      if (!res.ok) return;
      const data = (await res.json()) as AiRenderResponse;
      if (globalRegistry && !validateComponentTree(globalRegistry, data?.tree).ok) return;
      const el = await renderTree(renderer, data.tree);
      if (!el) return;
      this.setContent(el);
    } catch {
      // 静默回退兜底内容
    }
  }

  /** 恢复为挂载时的原始兜底内容。 */
  restore(): void {
    this.innerHTML = this.fallbackHTML;
    if (this.editor) this.appendChild(this.editor);
  }

  protected setContent(el: HTMLElement): void {
    this.replaceChildren(el);
    if (this.editor) this.appendChild(this.editor);
  }

  /** editable 的默认编辑条；样式通过 .ai-slot-editor 完全开放给用户自定义。 */
  protected mountEditor(): void {
    if (this.editor) {
      // 重连时复用已有编辑条，不重复创建
      if (this.editor.parentNode !== this) this.appendChild(this.editor);
      return;
    }
    const form = document.createElement("form");
    form.className = "ai-slot-editor";
    const input = document.createElement("input");
    input.name = "prompt";
    input.maxLength = 500;
    input.placeholder = "用一句话调整这个区域…";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "应用";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "恢复默认";
    form.append(input, submit, reset);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value) void this.load(value);
    });
    reset.addEventListener("click", () => this.restore());
    this.editor = form;
    this.appendChild(form);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("ai-slot")) {
  customElements.define("ai-slot", AiSlotElement);
}
