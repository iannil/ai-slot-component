import { validateComponentTree, type AiRenderResponse, type ComponentNode, type Registry } from "@ai-slot/registry";
import { parseWithWireFormats } from "./wire.js";

export interface FetchTreeOptions {
  src: string;
  /** 存在时走 POST 用户路径 */
  userPrompt?: string;
  /** 提供时渲染前对 AI 输出再校验一次（双保险） */
  registry?: Registry;
  /** true 时请求 SSE 流式（Accept: text/event-stream） */
  stream?: boolean;
  /** SSE skeleton 帧回调（先于终树到达） */
  onSkeleton?: (tree: ComponentNode) => void;
  /** 测试注入用 */
  fetchImpl?: typeof fetch;
}

/** 拉取并（可选）校验组件树。任何失败返回 null——调用方据此静默保留兜底内容。 */
export async function fetchComponentTree(opts: FetchTreeOptions): Promise<ComponentNode | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const headers: Record<string, string> = {};
    if (opts.stream) headers.accept = "text/event-stream";
    const init: RequestInit | undefined =
      opts.userPrompt === undefined
        ? (opts.stream ? { headers } : undefined)
        : {
            method: "POST",
            headers: { "content-type": "application/json", ...(opts.stream ? { accept: headers.accept! } : {}) },
            body: JSON.stringify({ prompt: opts.userPrompt }),
          };
    const res = await doFetch(opts.src, init);
    if (!res.ok) return null;
    if (opts.stream && res.headers?.get("content-type")?.includes("text/event-stream")) {
      return await readSSE(res, opts);
    }
    const tree = extractTree((await res.json()) as unknown);
    if (tree && opts.registry && !validateComponentTree(opts.registry, tree).ok) return null;
    return tree;
  } catch {
    return null;
  }
}

/** 已解析 JSON → 组件树：先按注册顺序探测 wire formats，全部未命中走原生 AiRenderResponse。 */
function extractTree(data: unknown): ComponentNode | null {
  const wire = parseWithWireFormats(data);
  if (wire.matched) return wire.tree;
  const body = data as AiRenderResponse;
  return body?.tree ?? null;
}

/** 解析 SSE 帧流：skeleton 帧回调，tree 帧（校验后）作为结果。 */
async function readSSE(res: Response, opts: FetchTreeOptions): Promise<ComponentNode | null> {
  // 容忍 CRLF 分帧/行尾：统一归一为 \n 再解析
  const text = (await readBody(res)).replace(/\r\n/g, "\n");
  let finalTree: ComponentNode | null = null;
  for (const chunk of text.split("\n\n")) {
    const event = chunk.match(/^event: (.+)$/m)?.[1];
    const raw = chunk.match(/^data: (.+)$/m)?.[1];
    if (!event || !raw) continue;
    let data: AiRenderResponse;
    try {
      data = JSON.parse(raw) as AiRenderResponse;
    } catch {
      continue; // 单帧损坏：跳过，不中断
    }
    if (event === "skeleton") {
      // 骨架帧与终树同样过客户端校验（双保险）；非法骨架按损坏帧跳过
      const skeleton = extractTree(data);
      if (skeleton && !(opts.registry && !validateComponentTree(opts.registry, skeleton).ok)) {
        try {
          opts.onSkeleton?.(skeleton);
        } catch {
          // 回调异常不影响主流程
        }
      }
    } else if (event === "tree") {
      finalTree = extractTree(data);
    }
  }
  if (finalTree === null) return null;
  if (opts.registry && !validateComponentTree(opts.registry, finalTree).ok) return null;
  return finalTree;
}

/** 读取响应体全文：优先 text()，缺失时（如手写 mock 仅提供 ReadableStream body）从 body 流读取。 */
async function readBody(res: Response): Promise<string> {
  if (typeof res.text === "function") return res.text();
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode(); // flush：输出残留的未完成多字节序列
  return text;
}
