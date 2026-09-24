import type { Registry } from "@ai-slot/registry";
import { fetchComponentTree } from "./fetch-tree.js";
import { subscribeInvalidation, type InvalidationSubscription } from "./live.js";
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
  protected fallbackHTML = "";
  protected editor: HTMLElement | null = null;
  private fallbackCaptured = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private liveSub: InvalidationSubscription | null = null;
  private loadSeq = 0;

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
    // 首次加载推迟到微任务：customElements.define 会同步升级文档中已存在的
    // <ai-slot>，此刻引入方的 registerRenderer/configureAiSlot 可能尚未执行，
    // 同步调用 load() 会因找不到渲染器而静默放弃且不再重试。
    queueMicrotask(() => {
      if (this.isConnected) void this.load();
      if (this.isConnected && this.hasAttribute("live")) this.mountLive();
    });
  }

  disconnectedCallback(): void {
    clearInterval(this.timer);
    this.liveSub?.close();
    this.liveSub = null;
  }

  /** 拉取并渲染组件树；userPrompt 存在时走 POST 用户路径。失败时静默保留当前内容。 */
  async load(userPrompt?: string): Promise<void> {
    const seq = ++this.loadSeq;
    // 终树已应用后置位：渲染较慢的骨架结果到达时不得覆盖终树
    let finalApplied = false;
    const src = this.getAttribute("src");
    const renderer = getRenderer(this.getAttribute("renderer") ?? "dom");
    if (!src || !renderer) return;
    const tree = await fetchComponentTree({
      src,
      userPrompt,
      registry: globalRegistry,
      stream: this.hasAttribute("stream"),
      onSkeleton: (skeleton) => {
        if (seq !== this.loadSeq || finalApplied) return;
        // 骨架帧：先渲染结构（文本占位），终树到达后再替换
        void renderTree(renderer, skeleton).then((el) => {
          if (el && !finalApplied && seq === this.loadSeq) this.setContent(el);
        }).catch(() => {});
      },
    });
    if (!tree) return;
    try {
      const el = await renderTree(renderer, tree);
      if (!el) return;
      if (seq !== this.loadSeq) return; // 已有更新的 load 发起，丢弃过期响应
      finalApplied = true;
      this.setContent(el);
    } catch {
      // 渲染器抛错：静默回退兜底内容
    }
  }

  /** live 属性：订阅失效推送，收到本槽位信号后静默重新加载。 */
  protected mountLive(): void {
    const src = this.getAttribute("live-src") ?? this.getAttribute("src")?.replace(/\/ai-render\/.*$/, "/ai-invalidate");
    const slot = this.getAttribute("name");
    if (!src || !slot || this.liveSub) return;
    this.liveSub = subscribeInvalidation({
      src,
      slot,
      onInvalidate: () => void this.load(),
    });
  }

  /** 恢复为挂载时的原始兜底内容。 */
  restore(): void {
    this.loadSeq += 1; // 使在途 load 的响应失效：恢复后到达的结果不得覆盖兜底
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
