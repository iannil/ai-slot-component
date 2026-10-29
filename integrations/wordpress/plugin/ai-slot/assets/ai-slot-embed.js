// ../../packages/registry/dist/index.js
function defineRegistry(input) {
  const components = {};
  for (const [name, def] of Object.entries(input.components)) {
    components[name] = {
      description: def.description,
      props: normalizeProps(def.props ?? {}),
      required: def.required ?? [],
      slots: def.slots ?? [],
      dataSources: def.dataSources ?? []
    };
  }
  return { components };
}
function normalizeProps(props) {
  const out = {};
  for (const [key, schema] of Object.entries(props)) {
    out[key] = normalizeSchema(schema);
  }
  return out;
}
function normalizeSchema(schema) {
  if (typeof schema === "string") return { type: schema };
  const out = { ...schema };
  if (schema.props) out.props = normalizeProps(schema.props);
  if (schema.items) out.items = normalizeSchema(schema.items);
  return out;
}
function validateComponentTree(registry, tree, options = {}) {
  const maxDepth = options.maxDepth ?? 5;
  const maxNodes = options.maxNodes ?? 50;
  const maxStringLength = options.maxStringLength ?? 1e4;
  const maxArrayItems = options.maxArrayItems ?? 200;
  const errors = [];
  let nodeCount = 0;
  const fail = (path, rule, message) => {
    errors.push({ path, rule, message });
  };
  function visit(node, path, depth) {
    if (errors.length > 0) return;
    if (depth > maxDepth) return fail(path, "depth", `\u5D4C\u5957\u6DF1\u5EA6\u8D85\u8FC7\u4E0A\u9650 ${maxDepth}`);
    nodeCount += 1;
    if (nodeCount > maxNodes) return fail(path, "nodes", `\u8282\u70B9\u603B\u6570\u8D85\u8FC7\u4E0A\u9650 ${maxNodes}`);
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      return fail(path, "structure", "\u8282\u70B9\u5FC5\u987B\u662F\u5BF9\u8C61");
    }
    const n = node;
    if (typeof n.component !== "string") {
      return fail(path, "structure", "\u8282\u70B9\u7F3A\u5C11 component \u5B57\u6BB5");
    }
    if (!Object.hasOwn(registry.components, n.component)) {
      return fail(path, "unknown-component", `\u7EC4\u4EF6\u672A\u6CE8\u518C: ${n.component}`);
    }
    const def = registry.components[n.component];
    if (n.props !== void 0) {
      validateProps(def.props, def.required, n.props, `${path}.props`);
      if (errors.length > 0) return;
    }
    if (n.children !== void 0) {
      if (!def.slots.includes("default")) {
        return fail(path, "slot", `\u7EC4\u4EF6 ${n.component} \u4E0D\u5141\u8BB8 children`);
      }
      if (!Array.isArray(n.children)) return fail(path, "structure", "children \u5FC5\u987B\u662F\u6570\u7EC4");
      for (let i = 0; i < n.children.length; i++) visit(n.children[i], `${path}.children[${i}]`, depth + 1);
    }
    if (errors.length > 0) return;
    if (n.slots !== void 0) {
      if (typeof n.slots !== "object" || n.slots === null || Array.isArray(n.slots)) {
        return fail(path, "structure", "slots \u5FC5\u987B\u662F\u5BF9\u8C61");
      }
      for (const [slotName, nodes] of Object.entries(n.slots)) {
        if (!def.slots.includes(slotName)) {
          return fail(path, "slot", `\u7EC4\u4EF6 ${n.component} \u4E0D\u652F\u6301\u69FD\u4F4D ${slotName}`);
        }
        if (!Array.isArray(nodes)) return fail(path, "structure", `\u69FD\u4F4D ${slotName} \u5FC5\u987B\u662F\u6570\u7EC4`);
        for (let i = 0; i < nodes.length; i++) visit(nodes[i], `${path}.slots.${slotName}[${i}]`, depth + 1);
        if (errors.length > 0) return;
      }
    }
  }
  function validateProps(schemas, required, value, path) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return fail(path, "props", "props \u5FC5\u987B\u662F\u5BF9\u8C61");
    }
    const props = value;
    for (const key of required) {
      if (!(key in props)) return fail(`${path}.${key}`, "props", `\u7F3A\u5C11\u5FC5\u586B prop: ${key}`);
    }
    for (const [key, v] of Object.entries(props)) {
      const schema = Object.hasOwn(schemas, key) ? schemas[key] : void 0;
      if (!schema) return fail(`${path}.${key}`, "props", `\u672A\u58F0\u660E\u7684 prop: ${key}`);
      validateValue(schema, v, `${path}.${key}`);
      if (errors.length > 0) return;
    }
  }
  function validateValue(schema, value, path) {
    switch (schema.type) {
      case "string": {
        if (typeof value !== "string") return fail(path, "props", "\u671F\u671B string");
        const cap = Math.min(schema.maxLength ?? maxStringLength, maxStringLength);
        if (value.length > cap) {
          return fail(path, "props", `\u8D85\u8FC7\u957F\u5EA6\u4E0A\u9650 ${cap}`);
        }
        if (schema.enum && !schema.enum.includes(value)) return fail(path, "props", "\u4E0D\u5728\u679A\u4E3E\u8303\u56F4\u5185");
        return;
      }
      case "number": {
        if (typeof value !== "number" || !Number.isFinite(value)) return fail(path, "props", "\u671F\u671B number");
        if (schema.enum && !schema.enum.includes(value)) return fail(path, "props", "\u4E0D\u5728\u679A\u4E3E\u8303\u56F4\u5185");
        return;
      }
      case "boolean": {
        if (typeof value !== "boolean") return fail(path, "props", "\u671F\u671B boolean");
        if (schema.enum && !schema.enum.includes(value)) return fail(path, "props", "\u4E0D\u5728\u679A\u4E3E\u8303\u56F4\u5185");
        return;
      }
      case "object": {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          return fail(path, "props", "\u671F\u671B object");
        }
        if (schema.props) {
          const nestedRequired = Object.entries(schema.props).filter(([, s]) => typeof s === "object" && s.required === true).map(([key]) => key);
          validateProps(schema.props, nestedRequired, value, path);
        }
        return;
      }
      case "array": {
        if (!Array.isArray(value)) return fail(path, "props", "\u671F\u671B array");
        const cap = Math.min(schema.maxItems ?? maxArrayItems, maxArrayItems);
        if (value.length > cap) {
          return fail(path, "props", `\u8D85\u8FC7\u5143\u7D20\u6570\u4E0A\u9650 ${cap}`);
        }
        if (schema.items) {
          for (let i = 0; i < value.length; i++) {
            validateValue(schema.items, value[i], `${path}[${i}]`);
            if (errors.length > 0) return;
          }
        }
        return;
      }
      default: {
        return fail(path, "props", "\u672A\u77E5\u7684 schema \u7C7B\u578B");
      }
    }
  }
  visit(tree, "tree", 1);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ../../packages/runtime/dist/index.js
var wireFormats = /* @__PURE__ */ new Map();
function parseWithWireFormats(data) {
  for (const format of wireFormats.values()) {
    try {
      if (!format.detect(data)) continue;
    } catch {
      continue;
    }
    try {
      return { matched: true, tree: format.parse(data) };
    } catch {
      return { matched: true, tree: null };
    }
  }
  return { matched: false, tree: null };
}
function safeReport(onFailure, failure) {
  if (!onFailure) return;
  try {
    onFailure(failure);
  } catch {
  }
}
function reportExpiration(value, callback) {
  try {
    callback?.(typeof value === "number" && Number.isFinite(value) ? value : void 0);
  } catch {
  }
}
function validationFailure(result) {
  return { stage: "validate", message: result.errors[0]?.message ?? "validation failed" };
}
async function fetchComponentTree(opts) {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const headers = {};
    if (opts.stream) headers.accept = "text/event-stream";
    const init = opts.userPrompt === void 0 ? opts.stream ? { headers } : void 0 : {
      method: "POST",
      headers: { "content-type": "application/json", ...opts.stream ? { accept: headers.accept } : {} },
      body: JSON.stringify({ prompt: opts.userPrompt })
    };
    const res = await doFetch(opts.src, init);
    if (!res.ok) {
      safeReport(opts.onFailure, { stage: "http-non-ok", message: `HTTP ${res.status}` });
      return null;
    }
    if (opts.stream && res.headers?.get("content-type")?.includes("text/event-stream")) {
      return await readSSE(res, opts);
    }
    const { tree, failure, expiresAt } = extractTree(await res.json());
    if (!tree) {
      safeReport(opts.onFailure, failure ?? { stage: "parse", message: "empty response" });
      return null;
    }
    if (opts.registry) {
      const result = validateComponentTree(opts.registry, tree);
      if (!result.ok) {
        safeReport(opts.onFailure, validationFailure(result));
        return null;
      }
    }
    reportExpiration(opts.registry ? expiresAt : void 0, opts.onExpiration);
    return tree;
  } catch (error) {
    safeReport(opts.onFailure, {
      stage: "fetch-error",
      message: error instanceof Error ? error.message : "unknown error"
    });
    return null;
  }
}
function extractTree(data) {
  const wire = parseWithWireFormats(data);
  if (wire.matched) {
    return wire.tree ? { tree: wire.tree } : { tree: null, failure: { stage: "parse", message: "wire format parse returned null" } };
  }
  const body = data;
  return body?.tree ? { tree: body.tree, expiresAt: body.meta?.expiresAt } : { tree: null, failure: { stage: "parse", message: "response carried no component tree" } };
}
async function readSSE(res, opts) {
  const text = (await readBody(res)).replace(/\r\n/g, "\n");
  let finalTree = null;
  let finalFailure;
  let finalExpiresAt;
  for (const chunk of text.split("\n\n")) {
    const event = chunk.match(/^event: (.+)$/m)?.[1];
    const raw = chunk.match(/^data: (.+)$/m)?.[1];
    if (!event || !raw) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    if (event === "skeleton") {
      const skeleton = extractTree(data).tree;
      if (skeleton && !(opts.registry && !validateComponentTree(opts.registry, skeleton).ok)) {
        try {
          opts.onSkeleton?.(skeleton);
        } catch {
        }
      }
    } else if (event === "tree") {
      const extracted = extractTree(data);
      finalTree = extracted.tree;
      finalFailure = extracted.failure;
      finalExpiresAt = extracted.expiresAt;
    }
  }
  if (finalTree === null) {
    if (finalFailure) safeReport(opts.onFailure, finalFailure);
    return null;
  }
  if (opts.registry) {
    const result = validateComponentTree(opts.registry, finalTree);
    if (!result.ok) {
      safeReport(opts.onFailure, validationFailure(result));
      return null;
    }
  }
  reportExpiration(opts.registry ? finalExpiresAt : void 0, opts.onExpiration);
  return finalTree;
}
async function readBody(res) {
  if (typeof res.text === "function") return res.text();
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}
function abortable(work, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => reject(new Error("aborted"));
    if (signal.aborted) {
      stop();
      return;
    }
    signal.addEventListener("abort", stop, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", stop);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", stop);
        reject(error);
      }
    );
  });
}
function retryDelay(failures, random) {
  return Math.floor(Math.min(3e4, 1e3 * 2 ** Math.min(failures, 5)) * (0.5 + 0.5 * random()));
}
function consumeFrames(buffer, slot, notify) {
  const frames = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = frames.pop() ?? "";
  for (const frame of frames) {
    const event = frame.match(/^event: ?(.+)$/m)?.[1];
    const raw = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (event !== "invalidate" || !raw) continue;
    try {
      if (JSON.parse(raw).slot === slot) notify();
    } catch {
    }
  }
  return rest;
}
function subscribeInvalidation(opts) {
  const doFetch = opts.fetchImpl ?? fetch;
  const random = opts.random ?? Math.random;
  const url = `${opts.src}${opts.src.includes("?") ? "&" : "?"}slot=${encodeURIComponent(opts.slot)}`;
  let closed = false;
  let failures = 0;
  let currentController;
  let currentReader;
  let timer;
  let wake;
  const clearTimer = () => {
    if (timer !== void 0) clearTimeout(timer);
    timer = void 0;
  };
  void (async () => {
    while (!closed) {
      const controller = new AbortController();
      currentController = controller;
      let connectedAt;
      try {
        timer = setTimeout(() => controller.abort(), 8e3);
        const res = await abortable(doFetch(url, {
          headers: { accept: "text/event-stream" },
          signal: controller.signal
        }), controller.signal);
        clearTimer();
        if (!res.ok || !res.body) throw new Error("invalid SSE response");
        if (closed) break;
        connectedAt = Date.now();
        try {
          opts.onConnect?.();
        } catch {
        }
        const reader = res.body.getReader();
        currentReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";
        for (; ; ) {
          timer = setTimeout(() => controller.abort(), 6e4);
          const { done, value } = await abortable(reader.read(), controller.signal);
          clearTimer();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 65536) throw new Error("SSE buffer exceeded");
          buffer = consumeFrames(buffer, opts.slot, () => {
            failures = 0;
            if (!closed) opts.onInvalidate();
          });
        }
      } catch {
      } finally {
        clearTimer();
        controller.abort();
        if (currentReader) void currentReader.cancel().catch(() => {
        });
        currentReader = void 0;
        currentController = void 0;
      }
      if (closed) break;
      if (connectedAt !== void 0 && Date.now() - connectedAt >= 3e4) failures = 0;
      await new Promise((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, retryDelay(failures++, random));
      });
      wake = void 0;
      clearTimer();
    }
  })();
  return {
    close() {
      if (closed) return;
      closed = true;
      clearTimer();
      currentController?.abort();
      if (currentReader) void currentReader.cancel().catch(() => {
      });
      wake?.();
    }
  };
}
var renderers = /* @__PURE__ */ new Map();
var onRendererRegisteredListener;
function onRendererRegistered(listener) {
  onRendererRegisteredListener = listener;
}
function registerRenderer(name, renderer) {
  renderers.set(name, renderer);
  onRendererRegisteredListener?.(name);
}
function getRenderer(name) {
  return renderers.get(name);
}
async function renderTree(renderer, node) {
  const children = [];
  for (const child of node.children ?? []) {
    const el = await renderTree(renderer, child);
    if (el) children.push(el);
  }
  const slots = {};
  for (const [name, nodes] of Object.entries(node.slots ?? {})) {
    slots[name] = [];
    for (const child of nodes) {
      const el = await renderTree(renderer, child);
      if (el) slots[name].push(el);
    }
  }
  return renderer(node, { children, slots });
}
var globalRegistry;
var globalOnFailure;
var defaultEditorLabels = {
  placeholder: "\u7528\u4E00\u53E5\u8BDD\u8C03\u6574\u8FD9\u4E2A\u533A\u57DF\u2026",
  submit: "\u5E94\u7528",
  reset: "\u6062\u590D\u9ED8\u8BA4"
};
var globalEditorLabels = { ...defaultEditorLabels };
var pendingFirstLoads = /* @__PURE__ */ new Set();
onRendererRegistered(() => {
  for (const el of [...pendingFirstLoads]) {
    pendingFirstLoads.delete(el);
    if (el.isConnected) void el.load();
  }
});
function configureAiSlot(opts) {
  globalRegistry = opts.registry;
  globalOnFailure = opts.onFailure;
  globalEditorLabels = { ...defaultEditorLabels, ...opts.editorLabels };
}
var AiSlotElement = class extends HTMLElement {
  fallbackHTML = "";
  editor = null;
  fallbackCaptured = false;
  timer;
  liveSub = null;
  loadSeq = 0;
  mountSeq = 0;
  displayedExpiresAt;
  expirationTimer;
  checkVisibleExpiration = () => {
    if (document.visibilityState === "visible") this.checkExpiration();
  };
  connectedCallback() {
    const mount = ++this.mountSeq;
    if (this.hasAttribute("fresh-only")) {
      document.addEventListener("visibilitychange", this.checkVisibleExpiration);
      this.checkExpiration();
    }
    if (!this.fallbackCaptured) {
      this.fallbackHTML = this.innerHTML;
      this.fallbackCaptured = true;
    }
    const intervalSec = Number(this.getAttribute("refresh-interval") ?? 0);
    if (intervalSec > 0) {
      this.timer = setInterval(() => void this.load(), intervalSec * 1e3);
    }
    queueMicrotask(() => {
      if (!this.isConnected || mount !== this.mountSeq) return;
      if (this.hasAttribute("editable")) this.mountEditor();
      void this.load();
      if (this.hasAttribute("live")) this.mountLive();
    });
  }
  disconnectedCallback() {
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
  async load(userPrompt) {
    const seq = ++this.loadSeq;
    const freshOnly = this.hasAttribute("fresh-only");
    let expiresAt;
    let finalApplied = false;
    let skeletonApplied = false;
    const src = this.getAttribute("src");
    const renderer = getRenderer(this.getAttribute("renderer") ?? "dom");
    if (!src || !renderer) {
      if (freshOnly && this.isConnected && seq === this.loadSeq) this.restore();
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
      onExpiration: (value) => {
        expiresAt = value;
      },
      onSkeleton: (skeleton) => {
        if (freshOnly || !this.isConnected || seq !== this.loadSeq || finalApplied) return;
        skeletonApplied = true;
        void renderTree(renderer, skeleton).then((el) => {
          if (el && this.isConnected && !finalApplied && seq === this.loadSeq) this.setContent(el);
        }).catch(() => {
        });
      }
    });
    if (!tree) {
      if ((freshOnly || skeletonApplied) && this.isConnected && seq === this.loadSeq) this.restore();
      return;
    }
    if (freshOnly && (expiresAt === void 0 || expiresAt <= Date.now())) {
      if (this.isConnected && seq === this.loadSeq) this.restore();
      return;
    }
    try {
      const el = await renderTree(renderer, tree);
      if (!this.isConnected || seq !== this.loadSeq) return;
      if (freshOnly && (expiresAt === void 0 || expiresAt <= Date.now())) {
        this.restore();
        return;
      }
      if (!el) {
        if (freshOnly) this.restore();
        return;
      }
      finalApplied = true;
      this.setContent(el);
      if (freshOnly) {
        this.clearExpiration();
        this.displayedExpiresAt = expiresAt;
        this.checkExpiration();
      }
    } catch {
      if (freshOnly && this.isConnected && seq === this.loadSeq) this.restore();
    }
  }
  /** live 属性：订阅失效推送，收到本槽位信号后静默重新加载。 */
  mountLive() {
    const src = this.getAttribute("live-src") ?? this.getAttribute("src")?.replace(/\/ai-render\/.*$/, "/ai-invalidate");
    const slot = this.getAttribute("name");
    if (!src || !slot || this.liveSub) return;
    this.liveSub = subscribeInvalidation({
      src,
      slot,
      onInvalidate: () => void this.load(),
      onConnect: () => void this.load()
    });
  }
  /** 计时器绑定当前显示产物；长于浏览器上限的间隔分段复核。 */
  checkExpiration() {
    const deadline = this.displayedExpiresAt;
    if (deadline === void 0 || !this.isConnected) return;
    this.clearExpirationTimer();
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      this.restore();
      return;
    }
    this.expirationTimer = setTimeout(() => this.checkExpiration(), Math.min(remaining, 2147483647));
  }
  clearExpirationTimer() {
    if (this.expirationTimer !== void 0) clearTimeout(this.expirationTimer);
    this.expirationTimer = void 0;
  }
  clearExpiration() {
    this.clearExpirationTimer();
    this.displayedExpiresAt = void 0;
  }
  /** 恢复为挂载时的原始兜底内容。 */
  restore() {
    this.clearExpiration();
    this.loadSeq += 1;
    this.innerHTML = this.fallbackHTML;
    if (this.editor) this.appendChild(this.editor);
  }
  setContent(el) {
    this.replaceChildren(el);
    if (this.editor) this.appendChild(this.editor);
  }
  /** editable 的默认编辑条；样式通过 .ai-slot-editor 完全开放给用户自定义。 */
  mountEditor() {
    if (this.editor) {
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
};
if (typeof customElements !== "undefined" && !customElements.get("ai-slot")) {
  customElements.define("ai-slot", AiSlotElement);
}

// ../../packages/adapter-dom/dist/index.js
function createDomRenderer(components) {
  return (node, ctx) => {
    const def = Object.hasOwn(components, node.component) ? components[node.component] : void 0;
    if (!def) {
      console.warn(`[ai-slot] \u7EC4\u4EF6\u672A\u5728\u5BA2\u6237\u7AEF\u6CE8\u518C\uFF0C\u5DF2\u8DF3\u8FC7: ${node.component}`);
      return null;
    }
    const el = document.createElement(def.tag);
    if (def.class) el.className = def.class;
    def.applyProps?.(el, node.props ?? {});
    const target = def.childrenTarget?.(el) ?? el;
    for (const child of ctx.children) target.appendChild(child);
    for (const [name, nodes] of Object.entries(ctx.slots)) {
      const getTarget = Object.hasOwn(def.slotTargets ?? {}, name) ? def.slotTargets?.[name] : void 0;
      if (!getTarget) throw new Error(`unsupported_slot:${name}`);
      const namedTarget = getTarget(el);
      if (namedTarget !== el && !el.contains(namedTarget)) throw new Error(`invalid_slot_target:${name}`);
      for (const child of nodes) namedTarget.appendChild(child);
    }
    return el;
  };
}

// embed.mjs
var starterRegistry = defineRegistry({
  components: {
    "hero-banner": {
      description: "\u9996\u5C4F\u5927\u6807\u9898\u533A",
      props: {
        title: { type: "string", maxLength: 120 },
        subtitle: { type: "string", maxLength: 300 }
      },
      required: ["title"]
    },
    "markdown-block": {
      description: "\u7EAF\u6587\u672C\u5185\u5BB9\u5757\uFF08\u4E0D\u89E3\u6790 HTML\uFF09",
      props: { content: { type: "string", maxLength: 5e3 } },
      required: ["content"]
    },
    "info-card": {
      description: "\u6807\u9898+\u6B63\u6587\u7684\u4FE1\u606F\u5361\u7247",
      props: {
        title: { type: "string", maxLength: 120 },
        body: { type: "string", maxLength: 1e3 }
      },
      required: ["title", "body"]
    },
    "cta-banner": {
      description: "\u884C\u52A8\u53F7\u53EC\u6A2A\u5E45\uFF0C\u542B\u4E00\u4E2A\u8DF3\u8F6C\u6309\u94AE",
      props: {
        title: { type: "string", maxLength: 120 },
        buttonText: { type: "string", maxLength: 40 },
        link: { type: "string", maxLength: 500 }
      },
      required: ["title", "buttonText", "link"]
    },
    "feature-list": {
      description: "\u8981\u70B9\u5217\u8868",
      props: {
        title: { type: "string", maxLength: 120 },
        items: { type: "array", maxItems: 12, items: { type: "string", maxLength: 200 } }
      },
      required: ["title", "items"]
    }
  }
});
function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
  }
  return null;
}
function appendText(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = String(text ?? "");
  return el;
}
var starterComponents = {
  "hero-banner": {
    tag: "section",
    class: "ai-slot-hero",
    applyProps(el, props) {
      el.append(
        appendText("h2", "ai-slot-hero-title", props.title),
        appendText("p", "ai-slot-hero-subtitle", props.subtitle)
      );
    }
  },
  "markdown-block": {
    tag: "div",
    class: "ai-slot-markdown",
    applyProps(el, props) {
      el.textContent = String(props.content ?? "");
    }
  },
  "info-card": {
    tag: "article",
    class: "ai-slot-info-card",
    applyProps(el, props) {
      el.append(
        appendText("h3", "ai-slot-info-card-title", props.title),
        appendText("p", "ai-slot-info-card-body", props.body)
      );
    }
  },
  "cta-banner": {
    tag: "div",
    class: "ai-slot-cta",
    applyProps(el, props) {
      el.append(appendText("p", "ai-slot-cta-title", props.title));
      const href = safeHttpUrl(props.link);
      if (!href) throw new Error("link_denied");
      const a = document.createElement("a");
      a.className = "ai-slot-cta-button";
      a.href = href;
      a.rel = "noopener noreferrer";
      a.textContent = String(props.buttonText ?? "");
      el.append(a);
    }
  },
  "feature-list": {
    tag: "div",
    class: "ai-slot-feature-list",
    applyProps(el, props) {
      el.append(appendText("h3", "ai-slot-feature-list-title", props.title));
      const ul = document.createElement("ul");
      for (const item of Array.isArray(props.items) ? props.items : []) {
        ul.append(appendText("li", "", item));
      }
      el.append(ul);
    }
  }
};
var bootstrapped = false;
function bootstrapAiSlotEmbed() {
  if (bootstrapped) return;
  bootstrapped = true;
  registerRenderer("dom", createDomRenderer(starterComponents));
  configureAiSlot({
    registry: starterRegistry,
    onFailure: () => {
      console.warn("[ai-slot] \u69FD\u4F4D\u5185\u5BB9\u6682\u4E0D\u53EF\u7528\uFF0C\u5DF2\u4FDD\u7559\u539F\u59CB\u5185\u5BB9");
    }
  });
}
if (typeof window !== "undefined" && typeof document !== "undefined") {
  bootstrapAiSlotEmbed();
}
export {
  bootstrapAiSlotEmbed,
  starterComponents,
  starterRegistry
};
