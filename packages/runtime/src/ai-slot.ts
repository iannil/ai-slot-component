import type { Registry } from "@ai-slot/registry";
import { fetchComponentTree, type FetchFailure } from "./fetch-tree.js";
import { subscribeInvalidation, type InvalidationSubscription } from "./live.js";
import { getRenderer, onRendererRegistered, renderTree } from "./renderer.js";

let globalRegistry: Registry | undefined;
let globalOnFailure: ((failure: FetchFailure) => void) | undefined;

/** editable 编辑条文案，可被 configureAiSlot 的 editorLabels 覆盖（默认中文）。 */
export interface EditorLabels {
  placeholder: string;
  submit: string;
  reset: string;
}

const defaultEditorLabels: EditorLabels = {
  placeholder: "用一句话调整这个区域…",
  submit: "应用",
  reset: "恢复默认",
};

let globalEditorLabels: EditorLabels = { ...defaultEditorLabels };

/** 首帧因缺渲染器而搁置的已挂载槽位；任意 registerRenderer 时统一重触发。 */
const pendingFirstLoads = new Set<AiSlotElement>();

onRendererRegistered(() => {
  for (const el of [...pendingFirstLoads]) {
    pendingFirstLoads.delete(el);
    if (el.isConnected) void el.load();
  }
});

/** 全局配置：registry 供渲染前二次校验；onFailure 为可选失败观测（load 时透传给 fetchComponentTree）；editorLabels 覆盖编辑条文案。 */
export function configureAiSlot(opts: {
  registry?: Registry;
  onFailure?: (failure: FetchFailure) => void;
  editorLabels?: Partial<EditorLabels>;
}): void {
  globalRegistry = opts.registry;
  globalOnFailure = opts.onFailure;
  globalEditorLabels = { ...defaultEditorLabels, ...opts.editorLabels };
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
  private mountSeq = 0;
  private displayedExpiresAt: number | undefined;
  private expirationTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly checkVisibleExpiration = (): void => {
    if (document.visibilityState === "visible") this.checkExpiration();
  };

  connectedCallback(): void {
    const mount = ++this.mountSeq;
    if (this.hasAttribute("fresh-only")) {
      document.addEventListener("visibilitychange", this.checkVisibleExpiration);
      this.checkExpiration();
    }
    // 同一实例可能反复挂载：只在首次捕获兜底，避免被 AI 内容或编辑条污染
    if (!this.fallbackCaptured) {
      this.fallbackHTML = this.innerHTML;
      this.fallbackCaptured = true;
    }
    const intervalSec = Number(this.getAttribute("refresh-interval") ?? 0);
    if (intervalSec > 0) {
      this.timer = setInterval(() => void this.load(), intervalSec * 1000);
    }
    // 首次加载与编辑条挂载都推迟到微任务：customElements.define 会同步升级
    // 文档中已存在的 <ai-slot>，此刻引入方的 registerRenderer/configureAiSlot
    // 可能尚未执行——同步 load() 会因找不到渲染器而静默放弃，同步 mountEditor()
    // 会错过 configureAiSlot 配置的 editorLabels。
    queueMicrotask(() => {
      if (!this.isConnected || mount !== this.mountSeq) return;
      if (this.hasAttribute("editable")) this.mountEditor();
      void this.load();
      if (this.hasAttribute("live")) this.mountLive();
    });
  }

  disconnectedCallback(): void {
    this.mountSeq++;
    this.loadSeq++;
    pendingFirstLoads.delete(this);
    clearInterval(this.timer);
    this.liveSub?.close();
    this.liveSub = null;
    document.removeEventListener("visibilitychange", this.checkVisibleExpiration);
    if (this.hasAttribute("fresh-only")) this.restore();
  }

  /** 拉取并渲染组件树；普通槽位失败时保留当前内容，fresh-only 失败时恢复兜底。 */
  async load(userPrompt?: string): Promise<void> {
    const seq = ++this.loadSeq;
    const freshOnly = this.hasAttribute("fresh-only");
    let expiresAt: number | undefined;
    // 终树已应用后置位：渲染较慢的骨架结果到达时不得覆盖终树
    let finalApplied = false;
    // 骨架帧已受理置位（渲染是异步的，可能晚于终树结果返回）：
    // 终树失败时需恢复兜底，不能留空骨架
    let skeletonApplied = false;
    const src = this.getAttribute("src");
    const renderer = getRenderer(this.getAttribute("renderer") ?? "dom");
    if (!src || !renderer) {
      if (freshOnly && this.isConnected && seq === this.loadSeq) this.restore();
      // 渲染器尚未注册（异步注册场景）：挂起等待 registerRenderer 重触发，而非静默放弃
      if (src && this.isConnected) pendingFirstLoads.add(this);
      return;
    }
    pendingFirstLoads.delete(this);
    const tree = await fetchComponentTree({
      src,
      userPrompt,
      registry: globalRegistry,
      onFailure: globalOnFailure,
      stream: this.hasAttribute("stream"),
      onExpiration: (value) => { expiresAt = value; },
      onSkeleton: (skeleton) => {
        if (freshOnly || !this.isConnected || seq !== this.loadSeq || finalApplied) return;
        skeletonApplied = true;
        // 骨架帧：先渲染结构（文本占位），终树到达后再替换
        void renderTree(renderer, skeleton).then((el) => {
          if (el && this.isConnected && !finalApplied && seq === this.loadSeq) this.setContent(el);
        }).catch(() => {});
      },
    });
    if (!tree) {
      // 终树缺失/损坏/校验失败：已渲染（或渲染在途）的骨架不能留给人看，恢复兜底。
      // restore 的 loadSeq 防护同时使在途骨架渲染失效
      if ((freshOnly || skeletonApplied) && this.isConnected && seq === this.loadSeq) this.restore();
      return;
    }
    if (freshOnly && (expiresAt === undefined || expiresAt <= Date.now())) {
      if (this.isConnected && seq === this.loadSeq) this.restore();
      return;
    }
    try {
      const el = await renderTree(renderer, tree);
      if (!this.isConnected || seq !== this.loadSeq) return; // 已卸载或有更新的 load，丢弃过期响应
      if (freshOnly && (expiresAt === undefined || expiresAt <= Date.now())) {
        this.restore(); // 异步渲染越过截止时间，不能落地
        return;
      }
      if (!el) {
        if (freshOnly) this.restore();
        return;
      }
      finalApplied = true;
      this.setContent(el);
      if (freshOnly) {
        this.clearExpiration(); // 新树真正应用后才替换旧计时器
        this.displayedExpiresAt = expiresAt;
        this.checkExpiration();
      }
    } catch {
      if (freshOnly && this.isConnected && seq === this.loadSeq) this.restore();
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
      onConnect: () => void this.load(),
    });
  }

  /** 计时器绑定当前显示产物；长于浏览器上限的间隔分段复核。 */
  private checkExpiration(): void {
    const deadline = this.displayedExpiresAt;
    if (deadline === undefined || !this.isConnected) return;
    this.clearExpirationTimer();
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      this.restore();
      return;
    }
    this.expirationTimer = setTimeout(() => this.checkExpiration(), Math.min(remaining, 2147483647));
  }

  private clearExpirationTimer(): void {
    if (this.expirationTimer !== undefined) clearTimeout(this.expirationTimer);
    this.expirationTimer = undefined;
  }

  private clearExpiration(): void {
    this.clearExpirationTimer();
    this.displayedExpiresAt = undefined;
  }

  /** 恢复为挂载时的原始兜底内容。 */
  restore(): void {
    this.clearExpiration();
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
    input.placeholder = globalEditorLabels.placeholder;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = globalEditorLabels.submit;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = globalEditorLabels.reset;
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
