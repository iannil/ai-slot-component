import { defineRegistry } from "@ai-slot/registry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchComponentTree } from "./fetch-tree.js";
import { registerWireFormat, unregisterWireFormat, type WireFormat } from "./wire.js";

const registry = defineRegistry({
  components: { "hero-banner": { description: "", props: { title: "string" }, required: ["title"] } },
});

const goodBody = { version: 1, slot: "hero", tree: { component: "hero-banner", props: { title: "t" } } };

describe("fetchComponentTree", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("GET 成功返回组件树", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(goodBody) }));
    vi.stubGlobal("fetch", fetchSpy);
    const tree = await fetchComponentTree({ src: "/ai-render/hero", registry });
    expect(tree).toEqual(goodBody.tree);
    expect(fetchSpy).toHaveBeenCalledWith("/ai-render/hero", undefined);
  });

  it("userPrompt 存在时走 POST 并携带 JSON body", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(goodBody) }));
    vi.stubGlobal("fetch", fetchSpy);
    await fetchComponentTree({ src: "/ai-render/hero", userPrompt: "改短", registry });
    expect(fetchSpy).toHaveBeenCalledWith("/ai-render/hero", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "改短" }),
    });
  });

  it("HTTP 非 2xx / 校验失败 / fetch 抛异常均返回 null", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
    const badTree = { version: 1, slot: "s", tree: { component: "evil" } };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(badTree) })));
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("down"))));
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
  });

  it("不传 registry 时跳过客户端校验", async () => {
    const badTree = { version: 1, slot: "s", tree: { component: "anything" } };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(badTree) })));
    expect(await fetchComponentTree({ src: "/x" })).toEqual({ component: "anything" });
  });
});

describe("fetchComponentTree — SSE 流式", () => {
  afterEach(() => vi.unstubAllGlobals());

  const sseBody =
    `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: { component: "hero-banner", props: { title: "" } } })}\n\n` +
    `event: tree\ndata: ${JSON.stringify(goodBody)}\n\n`;

  function sseResponse(body: string) {
    return Promise.resolve({
      ok: true,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
      text: () => Promise.resolve(body),
    });
  }

  it("stream: true 时携带 SSE Accept 头", async () => {
    const fetchSpy = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(goodBody) }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await fetchComponentTree({ src: "/x", registry, stream: true });
    expect(fetchSpy.mock.calls[0][1]?.headers).toEqual({ accept: "text/event-stream" });
  });

  it("SSE 响应：skeleton 帧先回调，tree 帧作为返回值", async () => {
    vi.stubGlobal("fetch", vi.fn(() => sseResponse(sseBody)));
    const skeletons: unknown[] = [];
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true, onSkeleton: (t) => skeletons.push(t) });
    expect(skeletons).toEqual([{ component: "hero-banner", props: { title: "" } }]);
    expect(tree).toEqual(goodBody.tree);
  });

  it("onSkeleton 回调抛错不影响终树返回", async () => {
    vi.stubGlobal("fetch", vi.fn(() => sseResponse(sseBody)));
    const tree = await fetchComponentTree({
      src: "/x",
      registry,
      stream: true,
      onSkeleton: () => { throw new Error("回调爆炸"); },
    });
    expect(tree).toEqual(goodBody.tree);
  });

  it("SSE 帧以 CRLF 分隔/行尾时正常解析", async () => {
    vi.stubGlobal("fetch", vi.fn(() => sseResponse(sseBody.replaceAll("\n", "\r\n"))));
    const skeletons: unknown[] = [];
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true, onSkeleton: (t) => skeletons.push(t) });
    expect(skeletons).toEqual([{ component: "hero-banner", props: { title: "" } }]);
    expect(tree).toEqual(goodBody.tree);
  });

  it("body 流路径：多字节字符跨 chunk 到达时完整解码", async () => {
    const title = "多字节标题";
    const body = `event: tree\ndata: ${JSON.stringify({ version: 1, slot: "s", tree: { component: "hero-banner", props: { title } } })}\n\n`;
    const bytes = new TextEncoder().encode(body);
    // 切在「多」字（3 字节 UTF-8）的字节中间
    const cut = new TextEncoder().encode(body.slice(0, body.indexOf("多") + 1)).length - 1;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut)); c.close(); },
        }),
      }),
    ));
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true });
    expect(tree).toEqual({ component: "hero-banner", props: { title } });
  });

  it("响应体非法 JSON / 缺 tree 字段时返回 null", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("bad json")) }),
    ));
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ version: 1, slot: "s" }) }),
    ));
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
  });

  it("SSE 响应同样经过 registry 校验（终树非法返回 null）", async () => {
    const badBody =
      `event: tree\ndata: ${JSON.stringify({ version: 1, slot: "s", tree: { component: "evil" } })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() => sseResponse(badBody)));
    expect(await fetchComponentTree({ src: "/x", registry, stream: true, onSkeleton: () => {} })).toBeNull();
  });

  it("skeleton 帧为非法组件（注册表外）时不回调 onSkeleton，终树正常返回", async () => {
    const body =
      `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "s", tree: { component: "evil" } })}\n\n` +
      `event: tree\ndata: ${JSON.stringify(goodBody)}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() => sseResponse(body)));
    const skeletons: unknown[] = [];
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true, onSkeleton: (t) => skeletons.push(t) });
    expect(skeletons).toEqual([]);
    expect(tree).toEqual(goodBody.tree);
  });

  it("stream: true 但代理返回 JSON 时向后兼容", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(goodBody) })));
    expect(await fetchComponentTree({ src: "/x", registry, stream: true })).toEqual(goodBody.tree);
  });
});

describe("fetchComponentTree — wire format 扩展", () => {
  afterEach(() => vi.unstubAllGlobals());

  const a2uiBody = {
    name: "demo",
    messages: [
      { version: "v1.0", createSurface: { surfaceId: "s" } },
      {
        version: "v1.0",
        updateComponents: {
          surfaceId: "s",
          components: [{ id: "root", component: "hero-banner", props: { title: "t" } }],
        },
      },
    ],
  };

  /** 测试用最小 wire format：识别 messages 包裹，取 id==="root" 的组件。 */
  function fakeA2uiFormat(): WireFormat {
    return {
      detect: (d) => typeof d === "object" && d !== null && "messages" in d,
      parse: (d) => {
        const msgs = (d as { messages: Array<{ updateComponents?: { components: Array<{ id: string; component: string; props?: Record<string, unknown> }> } }> }).messages;
        const root = msgs.find((m) => m.updateComponents)?.updateComponents?.components.find((c) => c.id === "root");
        return root ? { component: root.component, props: root.props } : null;
      },
    };
  }

  // 注意：wireFormats 为模块级全局 Map（可用 unregisterWireFormat 清理），注册会跨用例残留。
  // 因此「未注册」用例置于最前；后续用例以同 id 覆盖注册（Map.set 覆盖语义，同 wire.test.ts m4 模式）。
  it("未注册任何命中格式时，A2UI 响应走原生路径 → data.tree 不存在 → null", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(a2uiBody) })));
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
  });

  it("注册 wire format 后：A2UI 响应被解析并过注册表校验", async () => {
    registerWireFormat("test-a2ui", fakeA2uiFormat());
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(a2uiBody) })));
    const tree = await fetchComponentTree({ src: "/x", registry });
    expect(tree).toEqual({ component: "hero-banner", props: { title: "t" } });
  });

  it("wire 解析结果非法时，注册表校验拦截 → null", async () => {
    registerWireFormat("test-a2ui", {
      detect: (d) => typeof d === "object" && d !== null && "messages" in d,
      parse: () => ({ component: "no-such-comp" }),
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(a2uiBody) })));
    expect(await fetchComponentTree({ src: "/x", registry })).toBeNull();
  });

  it("SSE 帧：wire format 命中的 skeleton/tree 帧同样生效", async () => {
    registerWireFormat("test-a2ui", fakeA2uiFormat());
    const sse =
      `event: skeleton\ndata: ${JSON.stringify({ messages: [{ version: "v1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "hero-banner", props: { title: "" } }] } }] })}\n\n` +
      `event: tree\ndata: ${JSON.stringify(a2uiBody)}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse));
            controller.close();
          },
        }),
        text: () => Promise.resolve(sse),
      }),
    ));
    const skeletons: unknown[] = [];
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true, onSkeleton: (s) => skeletons.push(s) });
    expect(skeletons).toEqual([{ component: "hero-banner", props: { title: "" } }]);
    expect(tree).toEqual({ component: "hero-banner", props: { title: "t" } });
  });
});

describe("fetchComponentTree — onFailure 观测钩子", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    unregisterWireFormat("ft-null");
  });

  it("http-non-ok：非 2xx 报状态码", async () => {
    const failures: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    const tree = await fetchComponentTree({ src: "/x", registry, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "http-non-ok", message: "HTTP 503" }]);
  });

  it("parse：wire 命中但解析为 null", async () => {
    registerWireFormat("ft-null", {
      detect: (d) => typeof d === "object" && d !== null && "messages" in d,
      parse: () => null,
    });
    const failures: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ messages: [] }) })));
    const tree = await fetchComponentTree({ src: "/x", registry, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "parse", message: "wire format parse returned null" }]);
  });

  it("parse：原生响应缺 tree", async () => {
    const failures: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ version: 1, slot: "hero" }) })));
    const tree = await fetchComponentTree({ src: "/x", registry, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "parse", message: "response carried no component tree" }]);
  });

  it("validate：registry 拒绝时携带 validator 首错 message", async () => {
    const failures: Array<{ stage: string; message: string }> = [];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ version: 1, slot: "hero", tree: { component: "no-such-comp" } }) })));
    const tree = await fetchComponentTree({ src: "/x", registry, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toHaveLength(1);
    expect(failures[0].stage).toBe("validate");
    expect(failures[0].message.length).toBeGreaterThan(0);
  });

  it("fetch-error：fetch 抛异常携带 message；回调自身抛异常不影响返回 null", async () => {
    const failures: Array<{ stage: string; message: string }> = [];
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("网络断了");
    }));
    const tree = await fetchComponentTree({
      src: "/x",
      registry,
      onFailure: (f) => {
        failures.push(f);
        throw new Error("回调异常");
      },
    });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "fetch-error", message: "网络断了" }]);
  });

  it("SSE：tree 帧到达但 wire 解析为 null → 上报 parse", async () => {
    registerWireFormat("ft-sse-null", {
      detect: (d) => typeof d === "object" && d !== null && "messages" in d,
      parse: () => null,
    });
    const failures: Array<{ stage: string; message: string }> = [];
    const sse =
      `event: skeleton\ndata: ${JSON.stringify({ messages: [] })}\n\n` +
      `event: tree\ndata: ${JSON.stringify({ messages: [] })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse));
            controller.close();
          },
        }),
        text: () => Promise.resolve(sse),
      }),
    ));
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([{ stage: "parse", message: "wire format parse returned null" }]);
  });

  it("SSE：只有 skeleton 帧、无 tree 帧 → 静默返回 null 且不上报", async () => {
    const failures: Array<{ stage: string; message: string }> = [];
    const sse = `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: { component: "hero-banner", props: { title: "" } } })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse));
            controller.close();
          },
        }),
        text: () => Promise.resolve(sse),
      }),
    ));
    const tree = await fetchComponentTree({ src: "/x", registry, stream: true, onFailure: (f) => failures.push(f) });
    expect(tree).toBeNull();
    expect(failures).toEqual([]);
  });
});
