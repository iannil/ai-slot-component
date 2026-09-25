import { describe, expect, it } from "vitest";
import type { ComponentNode } from "@ai-slot/registry";
import { parseA2ui } from "./wire.js";
import { toA2uiMessages, withA2uiOutput } from "./output.js";

const tree: ComponentNode = {
  component: "Row",
  props: { justify: "spaceBetween" },
  children: [
    { component: "Text", props: { text: "a" } },
    { component: "Image", props: { url: "u" } },
  ],
};

describe("toA2uiMessages", () => {
  it("产出 [createSurface, updateComponents]，邻接表 children 引用正确", () => {
    const messages = toA2uiMessages(tree, { surfaceId: "s1" });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ version: "v1.0", createSurface: { surfaceId: "s1" } });
    const update = messages[1].updateComponents!;
    expect(update.surfaceId).toBe("s1");
    const row = update.components.find((c) => c.component === "Row")!;
    expect(row.children).toHaveLength(2);
    expect(update.components.filter((c) => c.component === "Text")).toHaveLength(1);
  });

  it("includeSurface: false 只产出 updateComponents", () => {
    const messages = toA2uiMessages(tree, { surfaceId: "s1", includeSurface: false });
    expect(messages).toHaveLength(1);
    expect(messages[0].updateComponents).toBeTruthy();
  });

  it("往返等价：tree → A2UI messages → parseA2ui → tree", () => {
    const messages = toA2uiMessages(tree, { surfaceId: "s1" });
    expect(parseA2ui(messages)).toEqual(tree);
  });
});

describe("withA2uiOutput", () => {
  const handler = (body: unknown, contentType = "application/json"): ((req: Request) => Promise<Response>) =>
    async () => new Response(JSON.stringify(body), { headers: { "content-type": contentType } });

  const aiResponse = { version: 1, slot: "hero", tree };

  it("JSON 响应体重写为 A2UI messages，状态与 content-type 保留", async () => {
    const wrapped = withA2uiOutput(handler(aiResponse), { surfaceId: "s1" });
    const res = await wrapped(new Request("https://x/ai-render/hero"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const messages = (await res.json()) as Array<Record<string, unknown>>;
    expect(messages[0]).toEqual({ version: "v1.0", createSurface: { surfaceId: "s1" } });
    expect(messages[1].updateComponents).toBeTruthy();
  });

  it("非 JSON 响应原样透传", async () => {
    const wrapped = withA2uiOutput(handler("plain", "text/plain"), { surfaceId: "s1" });
    const res = await wrapped(new Request("https://x/"));
    expect(await res.text()).toBe('"plain"');
  });

  it("非法 JSON 响应原样透传", async () => {
    const wrapped = withA2uiOutput(async () => new Response("not-json", { headers: { "content-type": "application/json" } }), { surfaceId: "s1" });
    const res = await wrapped(new Request("https://x/"));
    expect(await res.text()).toBe("not-json");
  });

  it("SSE：skeleton 帧带 createSurface，tree 帧只发 updateComponents，event 名不变", async () => {
    const sse =
      `event: skeleton\ndata: ${JSON.stringify({ version: 1, slot: "hero", tree: { component: "Text", props: { text: "" } } })}\n\n` +
      `event: tree\ndata: ${JSON.stringify(aiResponse)}\n\n`;
    const wrapped = withA2uiOutput(async () => new Response(sse, { headers: { "content-type": "text/event-stream" } }), { surfaceId: "s1" });
    const res = await wrapped(new Request("https://x/ai-render/hero"));
    const text = await res.text();
    const frames = text.split("\n\n").filter(Boolean);
    expect(frames).toHaveLength(2);
    expect(frames[0].startsWith("event: skeleton")).toBe(true);
    const skeleton = JSON.parse(frames[0].match(/^data: (.+)$/m)![1]) as Array<Record<string, unknown>>;
    expect(skeleton).toHaveLength(2); // createSurface + updateComponents
    expect(frames[1].startsWith("event: tree")).toBe(true);
    const final = JSON.parse(frames[1].match(/^data: (.+)$/m)![1]) as Array<Record<string, unknown>>;
    expect(final).toHaveLength(1); // 仅 updateComponents
    expect(final[0].updateComponents).toBeTruthy();
  });
});
