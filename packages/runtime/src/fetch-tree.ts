import { validateComponentTree, type AiRenderResponse, type ComponentNode, type Registry } from "@ai-slot/registry";

export interface FetchTreeOptions {
  src: string;
  /** 存在时走 POST 用户路径 */
  userPrompt?: string;
  /** 提供时渲染前对 AI 输出再校验一次（双保险） */
  registry?: Registry;
  /** 测试注入用 */
  fetchImpl?: typeof fetch;
}

/** 拉取并（可选）校验组件树。任何失败返回 null——调用方据此静默保留兜底内容。 */
export async function fetchComponentTree(opts: FetchTreeOptions): Promise<ComponentNode | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(
      opts.src,
      opts.userPrompt === undefined
        ? undefined
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt: opts.userPrompt }),
          },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as AiRenderResponse;
    if (opts.registry && !validateComponentTree(opts.registry, data?.tree).ok) return null;
    return data?.tree ?? null;
  } catch {
    return null;
  }
}
