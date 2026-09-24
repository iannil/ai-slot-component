import { defineRegistry, type AiRenderResponse } from "@ai-slot/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSlotElement, configureAiSlot } from "./ai-slot.js";
import { registerRenderer, type Renderer } from "./renderer.js";

const registry = defineRegistry({
  components: {
    "hero-banner": { description: "", props: { title: "string" }, required: ["title"] },
  },
});

const domRenderer: Renderer = (node) => {
  const el = document.createElement("div");
  el.className = node.component;
  el.textContent = (node.props?.title as string) ?? "";
  return el;
};
registerRenderer("dom", domRenderer);

function aiResponse(tree: unknown): AiRenderResponse {
  return { version: 1, slot: "hero", tree: tree as AiRenderResponse["tree"] };
}

function mockFetch(impl: () => Promise<{ ok: boolean; status?: number; json?: () => Promise<unknown> }>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function mount(html: string): AiSlotElement {
  const el = document.createElement("ai-slot") as AiSlotElement;
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("<ai-slot> 生命周期", () => {
  beforeEach(() => {
    configureAiSlot({ registry });
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("挂载后请求代理并用 AI 结果替换兜底内容", async () => {
    mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "AI 标题" } })) }));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector(".hero-banner")?.textContent).toBe("AI 标题");
    expect(el.querySelector("h1")).toBeNull();
  });

  it("HTTP 非 2xx 时保留兜底内容", async () => {
    mockFetch(() => Promise.resolve({ ok: false, status: 503 }));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
  });

  it("fetch 抛异常（代理整体不可用）时保留兜底内容", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
  });

  it("客户端校验失败（伪造组件名）时丢弃结果、保留兜底", async () => {
    mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve(aiResponse({ component: "evil", props: {} })) }));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
  });

  it("没有 src 属性时不发起请求", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mount("<h1>纯静态</h1>");
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refresh-interval 触发轮询重新加载", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", fetchSpy);
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("refresh-interval", "5");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    el.remove();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 断开后停止轮询
  });
});
