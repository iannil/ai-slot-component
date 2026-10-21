import type { AiRenderResponse } from "@ai-slot/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSlotElement } from "./ai-slot.js";
import "./ai-slot.js";
import { registerRenderer } from "./renderer.js";

// 本文件刻意不预注册任何渲染器：覆盖「渲染器晚于元素挂载注册」的异步接入场景。
// 渲染器注册表是模块级状态且无注销接口，各用例使用互不相同的渲染器名避免串扰：
// 首个用例注册默认名 "dom"，其余用例各自使用独立名字。

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

function makeSlot(renderer?: string): AiSlotElement {
  const el = document.createElement("ai-slot") as AiSlotElement;
  el.setAttribute("src", "/ai-render/hero");
  if (renderer) el.setAttribute("renderer", renderer);
  el.innerHTML = "<h1>原始兜底</h1>";
  return el;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("渲染器晚注册的首帧补偿", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("挂载时渲染器未注册不丢首帧：registerRenderer 后重触发加载", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const fetchSpy = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchSpy);
    const el = makeSlot();
    document.body.appendChild(el);
    await settle();
    // 首帧 load 因缺渲染器提前返回：不发起请求，也不破坏兜底
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(el.querySelector("h1")?.textContent).toBe("原始兜底");

    registerRenderer("dom", (node) => {
      const div = document.createElement("div");
      div.className = node.component;
      div.textContent = (node.props?.title as string) ?? "";
      return div;
    });
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    pending.resolve(response("晚注册补偿内容"));
    await settle();
    expect(el.querySelector(".hero-banner")?.textContent).toBe("晚注册补偿内容");
  });

  it("注册前已卸载的槽位不被重触发，注册后的新挂载正常加载", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(response("新内容")));
    vi.stubGlobal("fetch", fetchSpy);
    const stale = makeSlot("late-dom");
    document.body.appendChild(stale);
    await settle();
    stale.remove();

    registerRenderer("late-dom", (node) => {
      const div = document.createElement("div");
      div.className = node.component;
      return div;
    });
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();

    const fresh = makeSlot("late-dom");
    document.body.appendChild(fresh);
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fresh.querySelector(".hero-banner")).not.toBeNull();
  });

  it("注册了不匹配的渲染器时保持搁置，注册目标渲染器后才加载", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(response("目标内容")));
    vi.stubGlobal("fetch", fetchSpy);
    const el = makeSlot("react");
    document.body.appendChild(el);
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();

    registerRenderer("dom", (node) => {
      const div = document.createElement("div");
      div.className = node.component;
      return div;
    });
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();

    registerRenderer("react", (node) => {
      const div = document.createElement("div");
      div.className = node.component;
      div.textContent = (node.props?.title as string) ?? "";
      return div;
    });
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(el.querySelector(".hero-banner")?.textContent).toBe("目标内容");
  });
});
