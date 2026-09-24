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
