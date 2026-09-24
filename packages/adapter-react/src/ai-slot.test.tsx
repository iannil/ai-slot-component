import { defineRegistry } from "@ai-slot/registry";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSlot } from "./ai-slot.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const registry = defineRegistry({
  components: { "hero-banner": { description: "", props: { title: "string" }, required: ["title"] } },
});

const components = {
  "hero-banner": ({ title }: Record<string, unknown>) => <h1 className="hero-title">{String(title ?? "")}</h1>,
};

function aiBody(title: string) {
  return { version: 1, slot: "hero", tree: { component: "hero-banner", props: { title } } };
}

let container: HTMLDivElement;
let root: Root;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("<AiSlot> React 组件", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("加载成功后渲染 AI 内容替换 fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(aiBody("AI 标题")) })));
    await act(async () => {
      root.render(<AiSlot src="/ai-render/hero" components={components} registry={registry} fallback={<h1>兜底</h1>} />);
    });
    await flush();
    expect(container.querySelector(".hero-title")?.textContent).toBe("AI 标题");
  });

  it("HTTP 失败时保留 fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 503 })));
    await act(async () => {
      root.render(<AiSlot src="/ai-render/hero" components={components} registry={registry} fallback={<h1>兜底</h1>} />);
    });
    await flush();
    expect(container.querySelector("h1")?.textContent).toBe("兜底");
  });

  it("editable：提交走 POST 并更新，恢复默认回到 fallback", async () => {
    const fetchSpy = vi.fn((_input?: unknown, _init?: RequestInit) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(aiBody("AI 标题")) }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await act(async () => {
      root.render(
        <AiSlot src="/ai-render/hero" components={components} registry={registry} editable fallback={<h1>兜底</h1>} />,
      );
    });
    await flush();
    const input = container.querySelector<HTMLInputElement>("input[name=prompt]")!;
    await act(async () => {
      // React 受控 input：用 native setter 触发 change
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "改短");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    fetchSpy.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(aiBody("用户定制")) }),
    );
    await act(async () => {
      container.querySelector("form.ai-slot-editor")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    const postCall = fetchSpy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    expect(container.querySelector(".hero-title")?.textContent).toBe("用户定制");
    await act(async () => {
      [...container.querySelectorAll("button")].find((b) => b.textContent === "恢复默认")!.click();
    });
    await flush();
    expect(container.querySelector("h1")?.textContent).toBe("兜底");
  });
});
