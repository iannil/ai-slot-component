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

  it("渲染器抛异常时静默回退：保留兜底内容且 load() 不拒绝", async () => {
    registerRenderer("boom", () => {
      throw new Error("renderer exploded");
    });
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "AI 标题" } })),
      }),
    );
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("renderer", "boom");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush(); // 挂载时的首次 load（内部 void 调用）不应产生 unhandled rejection
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
    await expect(el.load()).resolves.toBeUndefined();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
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

describe("<ai-slot editable> 用户提示词流程", () => {
  beforeEach(() => {
    configureAiSlot({ registry });
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mountEditable(): AiSlotElement {
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("editable", "");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    return el;
  }

  it("挂载编辑条：输入框 + 应用 + 恢复默认", async () => {
    mockFetch(() => Promise.resolve({ ok: false, status: 503 }));
    const el = mountEditable();
    await flush();
    const form = el.querySelector("form.ai-slot-editor");
    expect(form).not.toBeNull();
    expect(form?.querySelector("input[name=prompt]")).not.toBeNull();
    const buttons = [...(form?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(buttons).toContain("应用");
    expect(buttons).toContain("恢复默认");
  });

  it("提交提示词走 POST 路径并更新该槽位", async () => {
    const fetchSpy = vi.fn((_url: unknown, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "用户定制" } })),
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const el = mountEditable();
    await flush();
    const input = el.querySelector<HTMLInputElement>("input[name=prompt]");
    input!.value = "再短一点";
    el.querySelector("form.ai-slot-editor")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    const postCall = fetchSpy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ prompt: "再短一点" });
    expect(el.querySelector(".hero-banner")?.textContent).toBe("用户定制");
    expect(el.querySelector("form.ai-slot-editor")).not.toBeNull(); // 编辑条仍在
  });

  it("恢复默认回到兜底内容", async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "AI 标题" } })),
      }),
    );
    const el = mountEditable();
    await flush();
    expect(el.querySelector(".hero-banner")).not.toBeNull();
    const reset = [...el.querySelectorAll("button")].find((b) => b.textContent === "恢复默认");
    reset!.click();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
    expect(el.querySelector("form.ai-slot-editor")).not.toBeNull();
  });

  it("重连后 restore 仍恢复原始兜底内容", async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "AI 标题" } })),
      }),
    );
    const el = mountEditable();
    await flush();
    expect(el.querySelector(".hero-banner")).not.toBeNull(); // AI 内容已替换兜底
    el.remove();
    document.body.appendChild(el); // 同一实例重新挂载
    await flush();
    el.restore();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
    expect(el.querySelector(".hero-banner")).toBeNull(); // 兜底未被 AI 内容污染
    expect(el.querySelector("form.ai-slot-editor")).not.toBeNull();
  });

  it("重连不重复挂载编辑条", async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "AI 标题" } })),
      }),
    );
    const el = mountEditable();
    await flush();
    el.remove();
    document.body.appendChild(el);
    // connectedCallback 同步执行：有缺陷的实现会在此刻追加第二个编辑条
    expect(el.querySelectorAll("form.ai-slot-editor")).toHaveLength(1);
    await flush();
    expect(el.querySelectorAll("form.ai-slot-editor")).toHaveLength(1);
  });
});

describe("<ai-slot> 并发与时序防护", () => {
  beforeEach(() => {
    configureAiSlot({ registry });
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("首次加载推迟到 microtask：appendChild 同步阶段不发起 fetch", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", fetchSpy);
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    // connectedCallback 已同步执行完，但 load 被推迟到 microtask
    expect(fetchSpy).not.toHaveBeenCalled();
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("并发 load：慢的旧响应不覆盖快的新响应", async () => {
    let resolveSlow!: (v: unknown) => void;
    const slowResponse = new Promise((r) => { resolveSlow = r; });
    const fastTree = { component: "hero-banner", props: { title: "新内容" } };
    const fetchSpy = vi
      .fn()
      // 第一次（轮询 GET）挂起
      .mockImplementationOnce(() => slowResponse)
      // 第二次（用户 POST）快速返回
      .mockImplementationOnce(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(aiResponse(fastTree)) }),
      );
    vi.stubGlobal("fetch", fetchSpy);
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("editable", "");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await flush(); // 第一次 load 已发起（挂起中）
    // 用户提交，触发第二次 load，快速完成
    const input = el.querySelector<HTMLInputElement>("input[name=prompt]");
    input!.value = "改一下";
    el.querySelector("form.ai-slot-editor")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(el.querySelector(".hero-banner")?.textContent).toBe("新内容");
    // 慢响应随后到达：内容是「旧内容」，必须被丢弃
    resolveSlow({
      ok: true,
      json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "旧内容" } })),
    });
    await flush();
    expect(el.querySelector(".hero-banner")?.textContent).toBe("新内容");
  });

  it("restore() 使在途 load 失效：随后到达的响应被丢弃", async () => {
    let resolvePending!: (v: unknown) => void;
    const pending = new Promise((r) => { resolvePending = r; });
    vi.stubGlobal("fetch", vi.fn(() => pending));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush(); // load 已发起（fetch 挂起中）
    el.restore();
    // 在途响应随后到达：内容合法，但必须被丢弃，留在兜底
    resolvePending({
      ok: true,
      json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "迟到的 AI 内容" } })),
    });
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
    expect(el.querySelector(".hero-banner")).toBeNull();
  });
});

describe("<ai-slot stream> 流式渲染", () => {
  beforeEach(() => {
    configureAiSlot({ registry });
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("骨架先渲染（空文本结构），终树到达后替换", async () => {
    const skeletonTree = { component: "hero-banner", props: { title: "" } };
    const finalTree = { component: "hero-banner", props: { title: "最终标题" } };
    const body =
      `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: skeletonTree })}\n\n` +
      `event: tree\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: finalTree })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
        }),
      }),
    ));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("stream", "");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await flush();
    // 最终渲染为终树内容（骨架帧曾先渲染过，DOM 结构类名一致，终树文本覆盖）
    expect(el.querySelector(".hero-banner")?.textContent).toBe("最终标题");
  });

  it("骨架渲染慢于终树时，骨架结果不可覆盖终树", async () => {
    let resolveSkeleton!: (el: HTMLElement) => void;
    let calls = 0;
    // 骨架（第一次渲染）挂起，终树（第二次渲染）立即完成
    registerRenderer("slow-skeleton", (node) => {
      calls += 1;
      const div = document.createElement("div");
      div.className = node.component;
      div.textContent = (node.props?.title as string) ?? "";
      if (calls === 1) return new Promise<HTMLElement>((r) => { resolveSkeleton = r; }).then(() => div);
      return div;
    });
    const skeletonTree = { component: "hero-banner", props: { title: "" } };
    const finalTree = { component: "hero-banner", props: { title: "最终标题" } };
    const body =
      `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: skeletonTree })}\n\n` +
      `event: tree\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: finalTree })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
        }),
      }),
    ));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("renderer", "slow-skeleton");
    el.setAttribute("stream", "");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await flush(); // 骨架渲染挂起中，终树已渲染并 setContent
    expect(el.querySelector(".hero-banner")?.textContent).toBe("最终标题");
    // 骨架渲染此刻才完成：不得覆盖终树
    resolveSkeleton(document.createElement("div"));
    await flush();
    expect(el.querySelector(".hero-banner")?.textContent).toBe("最终标题");
  });

  it("终树缺失（只有 skeleton 帧）时恢复兜底内容，不留空骨架", async () => {
    const skeletonTree = { component: "hero-banner", props: { title: "" } };
    const body = `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: skeletonTree })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
        }),
      }),
    ));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("stream", "");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await flush();
    // 骨架已渲染又被 restore：显示原始兜底，而非空文本骨架
    expect(el.querySelector("h1")?.textContent).toBe("兜底");
    expect(el.querySelector(".hero-banner")).toBeNull();
  });

  it("终树校验失败（注册表外组件）时恢复兜底内容，不留空骨架", async () => {
    const skeletonTree = { component: "hero-banner", props: { title: "" } };
    const badTree = { component: "evil", props: {} };
    const body =
      `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: skeletonTree })}\n\n` +
      `event: tree\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: badTree })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
        }),
      }),
    ));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("stream", "");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("兜底");
    expect(el.querySelector(".hero-banner")).toBeNull();
  });

  it("无 stream 属性时不发 SSE Accept（行为不变）", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", fetchSpy);
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await flush();
    expect(fetchSpy).toHaveBeenCalledWith("/ai-render/hero", undefined);
  });
});

describe("<ai-slot live> 失效推送", () => {
  beforeEach(() => {
    configureAiSlot({ registry });
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("live 属性建立订阅，收到失效信号后静默重新加载", async () => {
    const encoder = new TextEncoder();
    let push!: (chunk: string) => void;
    const liveBody = new ReadableStream<Uint8Array>({
      start(c) { push = (chunk) => c.enqueue(encoder.encode(chunk)); },
    });
    let loadCount = 0;
    const fetchSpy = vi.fn((url: unknown) => {
      const u = String(url);
      if (u.startsWith("/ai-invalidate")) {
        return Promise.resolve({ ok: true, body: liveBody });
      }
      loadCount += 1;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: `第 ${loadCount} 版` } })),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("name", "hero");
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("live", "");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await flush();
    // 订阅 URL 派生：/ai-render/<slot> → /ai-invalidate?slot=<slot>
    expect(fetchSpy).toHaveBeenCalledWith(
      "/ai-invalidate?slot=hero",
      expect.objectContaining({ headers: { accept: "text/event-stream" } }),
    );
    expect(el.querySelector(".hero-banner")?.textContent).toBe("第 1 版");
    // 推送失效信号 → 静默重新加载
    push(`event: invalidate\ndata: ${JSON.stringify({ slot: "hero" })}\n\n`);
    await flush();
    expect(el.querySelector(".hero-banner")?.textContent).toBe("第 2 版");
  });

  it("live-src 覆盖默认订阅地址", async () => {
    const fetchSpy = vi.fn((url: unknown) => {
      const u = String(url);
      if (u.startsWith("/custom/channel")) {
        return Promise.resolve({ ok: true, body: new ReadableStream({ start() {} }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "v" } })),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("name", "hero");
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("live", "");
    el.setAttribute("live-src", "/custom/channel");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await flush();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/custom/channel?slot=hero",
      expect.objectContaining({ headers: { accept: "text/event-stream" } }),
    );
  });

  it("无 live 属性时不订阅", async () => {
    const fetchSpy = vi.fn((_url: unknown) => Promise.resolve({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", fetchSpy);
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await flush();
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("ai-invalidate"))).toBe(false);
  });
});

describe("configureAiSlot — 全局 onFailure", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // 复位全局配置，避免泄漏到其它用例
    configureAiSlot({ registry });
  });

  it("元素 load 命中失败路径时，全局钩子被调用且兜底内容保留", async () => {
    const failures: Array<{ stage: string; message: string }> = [];
    configureAiSlot({ registry, onFailure: (f) => failures.push(f) });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush();
    expect(failures).toEqual([{ stage: "http-non-ok", message: "HTTP 503" }]);
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
  });
});
