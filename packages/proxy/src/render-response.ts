import { deriveSkeleton, type AiRenderResponse } from "@ai-slot/registry";

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** SSE 双帧响应：先发骨架（文本占位），再发完整组件树。 */
export function sse(response: AiRenderResponse): Response {
  const skeleton: AiRenderResponse = {
    ...response,
    tree: deriveSkeleton(response.tree),
    meta: { ...response.meta, phase: "skeleton" },
  };
  const body =
    `event: skeleton\ndata: ${JSON.stringify(skeleton)}\n\n` +
    `event: tree\ndata: ${JSON.stringify(response)}\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}
