import { defineRegistry } from "@ai-slot/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSlotElement, configureAiSlot } from "./ai-slot.js";
import { fetchComponentTree } from "./fetch-tree.js";
import { registerRenderer } from "./renderer.js";
import { registerWireFormat, unregisterWireFormat } from "./wire.js";

const registry = defineRegistry({ components: { card: { description: "", props: { title: "string" }, required: ["title"] } } });
registerRenderer("fresh-card", (node) => {
  const el = document.createElement("div");
  el.className = "card";
  el.textContent = node.props?.title as string;
  return el;
});
const start = new Date("2026-10-10T00:00:00.000Z").getTime();
const body = (title: string, expiresAt?: unknown) => ({ version: 1, slot: "s", tree: { component: "card", props: { title } }, meta: { expiresAt } });
const response = (value: unknown) => ({ ok: true, json: async () => value });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
function mount(fresh = true): AiSlotElement {
  const el = document.createElement("ai-slot") as AiSlotElement;
  el.setAttribute("src", "/ai-render/s");
  el.setAttribute("renderer", "fresh-card");
  if (fresh) el.setAttribute("fresh-only", "");
  el.innerHTML = "<h1>原始兜底</h1>";
  document.body.appendChild(el);
  return el;
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function title(el: AiSlotElement) { return el.querySelector(".card")?.textContent; }
function fallback(el: AiSlotElement) { return el.querySelector("h1")?.textContent; }

describe("管理内容到期回退", () => {
  beforeEach(() => {
    configureAiSlot({ registry });
    document.body.innerHTML = "";
    vi.useFakeTimers();
    vi.setSystemTime(start);
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(["JSON", "SSE"])("缺 registry 的 fresh-only %s 响应即使带未来期限也恢复兜底", async (format) => {
    configureAiSlot({});
    const payload = body("未校验树", start + 1000);
    const stream = `event: tree\ndata: ${JSON.stringify(payload)}\n\n`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(format === "JSON"
      ? response(payload)
      : { ok: true, headers: new Headers({ "content-type": "text/event-stream" }), text: async () => stream }));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/s");
    el.setAttribute("renderer", "fresh-card");
    el.setAttribute("fresh-only", "");
    if (format === "SSE") el.setAttribute("stream", "");
    el.innerHTML = "<h1>原始兜底</h1>";
    document.body.appendChild(el);
    await settle();
    expect(fallback(el)).toBe("原始兜底");
    expect(title(el)).toBeUndefined();
  });

  it("普通槽位缺 registry 仍可显示无期限树", async () => {
    configureAiSlot({});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body("普通内容"))));
    const el = mount(false);
    await settle();
    expect(title(el)).toBe("普通内容");
  });

  it("普通槽位更新失败保留已显示的树，且无需期限元数据", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(body("当前"))).mockResolvedValueOnce({ ok: false, status: 503 }));
    const el = mount(false);
    await settle();
    expect(title(el)).toBe("当前");
    await el.load();
    expect(title(el)).toBe("当前");
  });

  it.each([
    ["缺期限", response(body("新内容"))],
    ["已过期", response(body("新内容", start))],
    ["无效期限", response(body("新内容", "later"))],
    ["服务错误", { ok: false, status: 503 }],
    ["非法树", response({ ...body("新内容", start + 1000), tree: { component: "evil" } })],
  ])("fresh-only 的 %s 结果恢复原始兜底", async (_name, next) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(body("当前", start + 1000))).mockResolvedValueOnce(next));
    const el = mount();
    await settle();
    expect(title(el)).toBe("当前");
    await el.load();
    expect(fallback(el)).toBe("原始兜底");
  });

  it("renderer 抛错时恢复原始兜底", async () => {
    let calls = 0;
    registerRenderer("fresh-throw", (node) => {
      if (++calls === 2) throw new Error("render error");
      const el = document.createElement("div");
      el.className = "card";
      el.textContent = node.props?.title as string;
      return el;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body("当前", start + 1000))));
    const el = mount();
    el.setAttribute("renderer", "fresh-throw");
    await settle();
    expect(title(el)).toBe("当前");
    await el.load();
    expect(fallback(el)).toBe("原始兜底");
  });

  it("合法期限显示并在到期时恢复；新树应用后替换旧计时器", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(body("旧树", start + 1000))).mockResolvedValueOnce(response(body("新树", start + 3000))));
    const el = mount();
    await settle();
    expect(title(el)).toBe("旧树");
    await el.load();
    expect(title(el)).toBe("新树");
    await vi.advanceTimersByTimeAsync(1000);
    expect(title(el)).toBe("新树");
    await vi.advanceTimersByTimeAsync(2000);
    expect(fallback(el)).toBe("原始兜底");
  });

  it("新请求挂起时旧期限仍生效，恢复后迟到结果不能落地", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(body("旧树", start + 1000))).mockImplementationOnce(() => pending.promise));
    const el = mount();
    await settle();
    const loading = el.load();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fallback(el)).toBe("原始兜底");
    pending.resolve(response(body("迟到树", start + 5000)));
    await loading;
    expect(title(el)).toBeUndefined();
  });

  it("异步renderer跨过截止时间时不能应用", async () => {
    const pending = deferred<HTMLElement>();
    registerRenderer("fresh-slow", () => pending.promise);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body("慢树", start + 1000))));
    const el = mount();
    el.setAttribute("renderer", "fresh-slow");
    await settle();
    await vi.advanceTimersByTimeAsync(1001);
    const rendered = document.createElement("div");
    rendered.className = "card";
    rendered.textContent = "慢树";
    pending.resolve(rendered);
    await settle();
    expect(fallback(el)).toBe("原始兜底");
  });

  it("远期截止时间分段等待，不立即撤回", async () => {
    const distant = start + 2147483647 + 5000;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body("远期树", distant))));
    const el = mount();
    await settle();
    await vi.advanceTimersByTimeAsync(2147483647);
    expect(title(el)).toBe("远期树");
    await vi.advanceTimersByTimeAsync(5000);
    expect(fallback(el)).toBe("原始兜底");
  });

  it("卸载清理计时器和监听，重挂载时不复活旧树；可见时复核期限", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(body("旧树", start + 1000))).mockImplementationOnce(() => pending.promise));
    const el = mount();
    await settle();
    expect(title(el)).toBe("旧树");
    el.remove();
    expect(fallback(el)).toBe("原始兜底");
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(start + 2000);
    document.dispatchEvent(new Event("visibilitychange"));
    document.body.appendChild(el);
    await settle();
    expect(fallback(el)).toBe("原始兜底");
    pending.resolve(response(body("新树", start + 5000)));
    await settle();
    expect(title(el)).toBe("新树");
    vi.setSystemTime(start + 6000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fallback(el)).toBe("原始兜底");
  });
});

describe("onExpiration 只观测已校验的最终树", () => {
  afterEach(() => { vi.unstubAllGlobals(); unregisterWireFormat("fresh-wire"); });
  it.each(["JSON", "SSE"])("缺 registry 的 %s 树保持旧兼容，但不交付可信期限", async (format) => {
    const payload = body("未校验树", start + 1000);
    const stream = `event: tree\ndata: ${JSON.stringify(payload)}\n\n`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(format === "JSON"
      ? response(payload)
      : { ok: true, headers: new Headers({ "content-type": "text/event-stream" }), text: async () => stream }));
    const seen: unknown[] = [];
    const tree = await fetchComponentTree({ src: "/x", stream: format === "SSE", onExpiration: (value) => seen.push(value) });
    expect(tree).toEqual(payload.tree);
    expect(seen).toEqual([undefined]);
  });

  it("JSON 有限数字透传，缺失或非法值给 undefined，回调异常不影响树", async () => {
    const seen: unknown[] = [];
    for (const value of [1234, "1234", Infinity, undefined]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body("树", value))));
      expect(await fetchComponentTree({ src: "/x", registry, onExpiration: (v) => { seen.push(v); throw Error("observer"); } })).toEqual(body("树").tree);
    }
    expect(seen).toEqual([1234, undefined, undefined, undefined]);
  });
  it("非法树不触发，SSE只取末帧metadata，wire无原生metadata时给undefined", async () => {
    const seen: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...body("坏", 1234), tree: { component: "evil" } })));
    expect(await fetchComponentTree({ src: "/x", registry, onExpiration: (v) => seen.push(v) })).toBeNull();
    expect(seen).toEqual([]);
    const stream = `event: skeleton\ndata: ${JSON.stringify(body("骨架", 1))}\n\nevent: tree\ndata: ${JSON.stringify(body("终树", 4567))}\n\n`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "text/event-stream" }), text: async () => stream }));
    expect(await fetchComponentTree({ src: "/x", registry, stream: true, onExpiration: (v) => seen.push(v) })).toEqual(body("终树").tree);
    expect(seen).toEqual([4567]);
  });
  it("非原生 wire 格式没有期限元数据，回调给 undefined", async () => {
    registerWireFormat("fresh-wire", {
      detect: (data) => typeof data === "object" && data !== null && "customTree" in data,
      parse: (data) => (data as { customTree: ReturnType<typeof body>["tree"] }).customTree,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ customTree: body("wire 树").tree, meta: { expiresAt: 1234 } })));
    const seen: unknown[] = [];
    expect(await fetchComponentTree({ src: "/x", registry, onExpiration: (v) => seen.push(v) })).toEqual(body("wire 树").tree);
    expect(seen).toEqual([undefined]);
  });
});
