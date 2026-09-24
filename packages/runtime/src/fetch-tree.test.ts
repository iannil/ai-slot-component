import { defineRegistry } from "@ai-slot/registry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchComponentTree } from "./fetch-tree.js";

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
