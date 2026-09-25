import type { AiRenderResponse, ComponentNode } from "@ai-slot/registry";
import type { A2uiMessage } from "./types.js";

export interface ToA2uiOptions {
  surfaceId: string;
  /** 默认 "v1.0" */
  version?: string;
  /** false 时只产出 updateComponents（SSE 后续帧用），默认 true */
  includeSurface?: boolean;
}

/** 嵌套树 → A2UI messages。id 自动生成（n0、n1…）；命名槽位内容按序并入 children。 */
export function toA2uiMessages(tree: ComponentNode, opts: ToA2uiOptions): A2uiMessage[] {
  const version = opts.version ?? "v1.0";
  const components: Array<{ id: string; component: string; children?: string[] } & Record<string, unknown>> = [];
  let counter = 0;
  const flatten = (node: ComponentNode): string => {
    const id = `n${counter++}`;
    const childIds = [...(node.children ?? []), ...Object.values(node.slots ?? {}).flat()].map(flatten);
    components.push({
      id,
      component: node.component,
      ...(childIds.length > 0 ? { children: childIds } : {}),
      ...(node.props ?? {}),
    });
    return id;
  };
  flatten(tree);
  const messages: A2uiMessage[] = [];
  if (opts.includeSurface !== false) {
    messages.push({ version, createSurface: { surfaceId: opts.surfaceId } });
  }
  messages.push({ version, updateComponents: { surfaceId: opts.surfaceId, components } });
  return messages;
}

export interface WithA2uiOutputOptions {
  surfaceId: string;
  version?: string;
}

/**
 * 包住 createAiRenderHandler 的产物：JSON 响应体与 SSE 帧重写为 A2UI messages；其它响应原样透传。
 * proxy 本身零改动——这是「槽位协议可替换」的演示位。
 */
export function withA2uiOutput(
  handler: (req: Request) => Promise<Response>,
  opts: WithA2uiOutputOptions,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      const text = await res.text();
      return new Response(rewriteSse(text, opts), { status: res.status, headers: res.headers });
    }
    if (!contentType.includes("application/json")) return res;
    // 先读文本再解析：res.json() 会消费 body 流，解析失败后原样返回 res 会得到 "Body is unusable"。
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return new Response(text, { status: res.status, headers: res.headers });
    }
    if (!isAiRenderResponse(body)) return new Response(text, { status: res.status, headers: res.headers });
    const messages = toA2uiMessages(body.tree, { surfaceId: opts.surfaceId, version: opts.version });
    return new Response(JSON.stringify(messages), { status: res.status, headers: res.headers });
  };
}

/** SSE 帧重写：skeleton 帧带 createSurface；tree 帧只发 updateComponents；event 名与帧结构不变。 */
function rewriteSse(text: string, opts: WithA2uiOutputOptions): string {
  const frames = text.split("\n\n").filter((frame) => frame.length > 0);
  const rewritten = frames.map((frame) => {
    const event = frame.match(/^event: (.+)$/m)?.[1];
    const raw = frame.match(/^data: (.+)$/m)?.[1];
    if (!event || !raw) return frame;
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return frame;
    }
    if (!isAiRenderResponse(body)) return frame;
    const messages = toA2uiMessages(body.tree, {
      surfaceId: opts.surfaceId,
      version: opts.version,
      includeSurface: event !== "tree",
    });
    return frame.replace(/^data: .*$/m, `data: ${JSON.stringify(messages)}`);
  });
  const trailing = text.endsWith("\n\n") ? "\n\n" : "";
  return rewritten.join("\n\n") + trailing;
}

function isAiRenderResponse(body: unknown): body is AiRenderResponse {
  return typeof body === "object" && body !== null && "tree" in body && (body as AiRenderResponse).tree != null;
}
