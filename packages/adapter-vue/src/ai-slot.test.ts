import { defineRegistry } from "@ai-slot/registry";
import { createApp, defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSlot } from "./ai-slot.js";

const registry = defineRegistry({
  components: { "hero-banner": { description: "", props: { title: "string" }, required: ["title"] } },
});

const components = {
  "hero-banner": defineComponent({
    props: ["title"],
    setup: (props) => () => h("h1", { class: "hero-title" }, String(props.title ?? "")),
  }),
};

function aiBody(title: string) {
  return { version: 1, slot: "hero", tree: { component: "hero-banner", props: { title } } };
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

describe("<AiSlot> Vue 组件", () => {
  let host: HTMLDivElement;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(() => {
    app?.unmount();
    host.remove();
    vi.unstubAllGlobals();
  });

  function mount(extraProps: Record<string, unknown> = {}) {
    app = createApp({
      render() {
        return h(AiSlot, {
          src: "/ai-render/hero",
          components,
          registry,
          ...extraProps,
        }, { default: () => h("h1", "兜底") });
      },
    });
    app.mount(host);
  }

  it("加载成功后渲染 AI 内容替换 fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(aiBody("AI 标题")) })));
    mount();
    await flush();
    expect(host.querySelector(".hero-title")?.textContent).toBe("AI 标题");
  });

  it("HTTP 失败时保留 fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    mount();
    await flush();
    expect(host.querySelector("h1")?.textContent).toBe("兜底");
  });

  it("editable：提交走 POST 并更新，恢复默认回到 fallback", async () => {
    const fetchSpy = vi.fn((_input?: unknown, _init?: RequestInit) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(aiBody("AI 标题")) }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    mount({ editable: true });
    await flush();
    const input = host.querySelector<HTMLInputElement>("input[name=prompt]")!;
    input.value = "改短";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    fetchSpy.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(aiBody("用户定制")) }),
    );
    host.querySelector("form.ai-slot-editor")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    const postCall = fetchSpy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    expect(host.querySelector(".hero-title")?.textContent).toBe("用户定制");
    [...host.querySelectorAll("button")].find((b) => b.textContent === "恢复默认")!.click();
    await flush();
    expect(host.querySelector("h1")?.textContent).toBe("兜底");
  });
});
