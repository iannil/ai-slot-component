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
  /** 可选失败观测：每个失败路径触发一次。回调异常被吞掉，绝不影响兜底。 */
  onFailure?: (failure: FetchFailure) => void;
  /** 测试注入用 */
  fetchImpl?: typeof fetch;
}

/** 失败观测事件：stage 标识失败阶段，message 为人读原因（英文短语，API 面向国际用户）。 */
export interface FetchFailure {
  stage: "http-non-ok" | "parse" | "validate" | "fetch-error";
  message: string;
}

/** 上报失败观测；回调异常一律吞掉——钩子绝不能破坏兜底路径。 */
function safeReport(onFailure: ((failure: FetchFailure) => void) | undefined, failure: FetchFailure): void {
  if (!onFailure) return;
  try {
    onFailure(failure);
  } catch {
    // 观测回调异常不影响兜底
  }
}

/** 校验失败时的观测事件：携带 validator 首错 message（fail-fast 语义）。 */
function validationFailure(registry: Registry, tree: ComponentNode): FetchFailure {
  const result = validateComponentTree(registry, tree);
  const message = result.ok ? "validation failed" : (result.errors[0]?.message ?? "validation failed");
  return { stage: "validate", message };
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
    if (!res.ok) {
      safeReport(opts.onFailure, { stage: "http-non-ok", message: `HTTP ${res.status}` });
      return null;
    }
    if (opts.stream && res.headers?.get("content-type")?.includes("text/event-stream")) {
      return await readSSE(res, opts);
    }
    const { tree, failure } = extractTree((await res.json()) as unknown);
    if (!tree) {
      // failure 由 extractTree 构造保证存在；?? 仅为类型完备
      safeReport(opts.onFailure, failure ?? { stage: "parse", message: "empty response" });
      return null;
    }
    if (opts.registry && !validateComponentTree(opts.registry, tree).ok) {
      safeReport(opts.onFailure, validationFailure(opts.registry, tree));
      return null;
    }
    return tree;
  } catch (error) {
    safeReport(opts.onFailure, {
      stage: "fetch-error",
      message: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}

/** 已解析 JSON → 组件树：先按注册顺序探测 wire formats，全部未命中走原生 AiRenderResponse。失败时附带观测事件。 */
function extractTree(data: unknown): { tree: ComponentNode | null; failure?: FetchFailure } {
  const wire = parseWithWireFormats(data);
  if (wire.matched) {
    return wire.tree
      ? { tree: wire.tree }
      : { tree: null, failure: { stage: "parse", message: "wire format parse returned null" } };
  }
  const body = data as AiRenderResponse;
  return body?.tree
    ? { tree: body.tree }
    : { tree: null, failure: { stage: "parse", message: "response carried no component tree" } };
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
      // 骨架帧与终树同样过客户端校验（双保险）；非法骨架按损坏帧跳过（保持静默）
      const skeleton = extractTree(data).tree;
      if (skeleton && !(opts.registry && !validateComponentTree(opts.registry, skeleton).ok)) {
        try {
          opts.onSkeleton?.(skeleton);
        } catch {
          // 回调异常不影响主流程
        }
      }
    } else if (event === "tree") {
      finalTree = extractTree(data).tree;
    }
  }
  if (finalTree === null) return null;
  if (opts.registry && !validateComponentTree(opts.registry, finalTree).ok) {
    safeReport(opts.onFailure, validationFailure(opts.registry, finalTree));
    return null;
  }
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
