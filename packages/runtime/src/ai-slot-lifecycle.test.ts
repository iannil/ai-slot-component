import { defineRegistry, type AiRenderResponse } from "@ai-slot/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSlotElement, configureAiSlot } from "./ai-slot.js";
import { registerRenderer } from "./renderer.js";

const registry = defineRegistry({
  components: {
    "hero-banner": { description: "", props: { title: "string" }, required: ["title"] },
  },
});

registerRenderer("dom", (node) => {
  const el = document.createElement("div");
  el.className = node.component;
  el.textContent = (node.props?.title as string) ?? "";
  return el;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function response(title: string) {
  const tree = { component: "hero-banner", props: { title } };
  const body: AiRenderResponse = { version: 1, slot: "hero", tree };
  return { ok: true, json: () => Promise.resolve(body) };
}

function makeSlot(attrs: Record<string, string> = {}): AiSlotElement {
  const el = document.createElement("ai-slot") as AiSlotElement;
  el.setAttribute("src", "/ai-render/hero");
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.innerHTML = "<h1>原始兜底</h1>";
  return el;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("<ai-slot> 卸载与重新挂载隔离", () => {
  beforeEach(() => {
    configureAiSlot({ registry });
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("重新挂载后丢弃上一轮在途结果，新请求完成后只显示新树", async () => {
    const oldFetch = deferred<ReturnType<typeof response>>();
    const newFetch = deferred<ReturnType<typeof response>>();
    const fetchSpy = vi.fn()
      .mockImplementationOnce(() => oldFetch.promise)
      .mockImplementationOnce(() => newFetch.promise);
    vi.stubGlobal("fetch", fetchSpy);
    const el = makeSlot();
    document.body.appendChild(el);
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    el.remove();
    document.body.appendChild(el);
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    oldFetch.resolve(response("过期内容"));
    await settle();
    expect(el.querySelector("h1")?.textContent).toBe("原始兜底");
    expect(el.querySelector(".hero-banner")).toBeNull();

    newFetch.resolve(response("最新内容"));
    await settle();
    expect(el.querySelector(".hero-banner")?.textContent).toBe("最新内容");
    el.restore();
    expect(el.querySelector("h1")?.textContent).toBe("原始兜底");
    expect(el.querySelector(".hero-banner")).toBeNull();
  });

  it("卸载期间完成的旧请求不能污染重新挂载后的兜底", async () => {
    const oldFetch = deferred<ReturnType<typeof response>>();
    const newFetch = deferred<ReturnType<typeof response>>();
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => oldFetch.promise)
      .mockImplementationOnce(() => newFetch.promise));
    const el = makeSlot();
    document.body.appendChild(el);
    await settle();
    el.remove();
    oldFetch.resolve(response("卸载期间的内容"));
    await settle();
    document.body.appendChild(el);
    await settle();
    expect(el.querySelector("h1")?.textContent).toBe("原始兜底");
    expect(el.querySelector(".hero-banner")).toBeNull();
    newFetch.resolve(response("重新挂载的内容"));
    await settle();
    expect(el.querySelector(".hero-banner")?.textContent).toBe("重新挂载的内容");
  });

  it("同步卸载和重挂只运行当前挂载的微任务", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", fetchSpy);
    const el = makeSlot();
    document.body.appendChild(el);
    el.remove();
    document.body.appendChild(el);
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(el.querySelector("h1")?.textContent).toBe("原始兜底");
  });

  it("每次挂载只保留一个 live 订阅和一个轮询计时器，成功连接会核对内容", async () => {
    vi.useFakeTimers();
    let subscriptions = 0;
    let reads = 0;
    const fetchSpy = vi.fn((url: unknown) => {
      if (String(url).startsWith("/ai-invalidate")) {
        subscriptions++;
        return Promise.resolve({ ok: true, body: new ReadableStream<Uint8Array>({ start() {} }) });
      }
      reads++;
      return Promise.resolve(response(`第 ${reads} 版`));
    });
    vi.stubGlobal("fetch", fetchSpy);
    const el = makeSlot({ name: "hero", live: "", "refresh-interval": "5" });
    document.body.appendChild(el);
    await vi.advanceTimersByTimeAsync(0);
    expect(subscriptions).toBe(1);
    expect(reads).toBe(2); // 首次加载与 live 成功连接后的补偿核对可以并发

    el.remove();
    await vi.advanceTimersByTimeAsync(5000);
    expect(reads).toBe(2);
    document.body.appendChild(el);
    await vi.advanceTimersByTimeAsync(0);
    expect(subscriptions).toBe(2);
    expect(reads).toBe(4);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reads).toBe(5);
    el.restore();
    expect(el.querySelector("h1")?.textContent).toBe("原始兜底");
  });
});
