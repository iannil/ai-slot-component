import {
  deriveSkeleton,
  validateComponentTree,
  type AiRenderResponse,
  type ComponentNode,
  type Registry,
} from "@ai-slot/registry";
import {
  MemoryCacheStore,
  developerCacheKey,
  lookup,
  userCacheKey,
  type CacheLookup,
} from "./cache.js";
import type { LLMClient, LLMResponse } from "./llm-client.js";
import { withRetry } from "./llm-client.js";
import { compilePrompt } from "./prompt-compiler.js";
import { RateLimiter } from "./rate-limit.js";
import { sanitizeUserPrompt } from "./sanitize.js";

export interface SlotSource {
  slotId: string;
  /** 原始兜底内容摘要 */
  originalContent: string;
  developerPrompt?: string;
  /** 内容版本，进入 L1 缓存 key */
  contentVersion: string;
  /** 提示词版本，默认 "1" */
  promptVersion?: string;
  /** 数据源解析后的实时数据 */
  data?: Record<string, unknown>;
}

export interface ProxyOptions {
  registry: Registry;
  llm: LLMClient;
  resolveSlot: (slotId: string) => SlotSource | null | Promise<SlotSource | null>;
  /** 双模型档位：开发者预生成可用大模型，用户实时路径默认小模型 */
  models?: { developer?: string; user?: string };
  /** token 预算上限，默认 2000 */
  maxTokens?: number;
  store?: MemoryCacheStore;
  /** L1 缓存 TTL，默认 1 小时 */
  developerTtlMs?: number;
  /** L2 缓存 TTL，默认 10 分钟 */
  userTtlMs?: number;
  /** stale 窗口，默认 1 天 */
  staleMs?: number;
  /** 用户路径限流，默认 10 次/分钟；传 false 关闭。进程内单实例语义，多实例部署需外部存储（见 rate-limit.ts） */
  rateLimit?: { limit: number; windowMs: number } | false;
  /** 用量日志：每次 LLM 调用成功后回调（供计费与调优） */
  onUsage?: (entry: UsageLogEntry) => void;
  /** 测试注入用 */
  now?: () => number;
}

/** 用量日志条目（设计文档 §4.2：全部调用记录用量日志）。 */
export interface UsageLogEntry {
  slotId: string;
  model: string;
  reason: "developer-prompt" | "user-prompt";
  usage?: LLMResponse["usage"];
  at: number;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** SSE 双帧响应：先发骨架（文本占位），再发完整组件树。 */
function sse(response: AiRenderResponse): Response {
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

/** 无状态渲染代理：GET 开发者路径（长缓存）/ POST 用户路径（实时 + 限流 + 短 TTL）。 */
export function createAiRenderHandler(opts: ProxyOptions): (req: Request) => Promise<Response> {
  const store = opts.store ?? new MemoryCacheStore();
  const now = opts.now ?? (() => Date.now());
  const limiter =
    opts.rateLimit === false
      ? null
      : new RateLimiter(opts.rateLimit ?? { limit: 10, windowMs: 60_000 });

  const llm = withRetry(opts.llm);

  return async function handler(req: Request): Promise<Response> {
    const match = new URL(req.url).pathname.match(/\/ai-render\/([\w-]+)\/?$/);
    if (!match) return json({ error: "not_found" }, 404);
    const slotId = match[1];
    const wantsSSE = req.headers.get("accept")?.includes("text/event-stream") ?? false;

    // ① 方法与用户提示词：POST 先做限流与 sanitize（不依赖槽位）
    let userPrompt: string | undefined;
    if (req.method === "POST") {
      if (limiter) {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
        if (!limiter.check(ip, now())) return json({ error: "rate_limited" }, 429);
      }
      const body: unknown = await req.json().catch(() => null);
      const cleaned = sanitizeUserPrompt((body as { prompt?: unknown } | null)?.prompt);
      if (!cleaned) return json({ error: "invalid_prompt" }, 400);
      userPrompt = cleaned;
    } else if (req.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }

    // ② 用户路径缓存前置：key 只依赖 slotId + 规范化提示词，
    //    resolveSlot 故障时已缓存结果仍可用
    let hit: CacheLookup<AiRenderResponse> | undefined;
    if (userPrompt !== undefined) {
      hit = lookup<AiRenderResponse>(store, userCacheKey(slotId, userPrompt), now());
      if (hit?.status === "fresh") return wantsSSE ? sse(hit.value) : json(hit.value, 200);
    }

    // ③ 解析槽位
    let slot: SlotSource | null;
    try {
      slot = await opts.resolveSlot(slotId);
    } catch (error) {
      console.warn("[ai-render] 槽位解析失败", error);
      return hit ? (wantsSSE ? sse(hit.value) : json(hit.value, 200)) : json({ error: "ai_unavailable" }, 503);
    }
    if (!slot) return json({ error: "unknown_slot" }, 404);

    // ④ 开发者路径缓存（key 依赖 contentVersion，需在 resolveSlot 之后）
    if (userPrompt === undefined) {
      hit = lookup<AiRenderResponse>(
        store,
        developerCacheKey(slotId, slot.contentVersion, slot.promptVersion ?? "1"),
        now(),
      );
      if (hit?.status === "fresh") return wantsSSE ? sse(hit.value) : json(hit.value, 200);
    }

    const isUserPath = userPrompt !== undefined;
    // 直接用条件判断而非 isUserPath，让 TS 能把 userPrompt 收窄为 string
    const key =
      userPrompt !== undefined
        ? userCacheKey(slotId, userPrompt)
        : developerCacheKey(slotId, slot.contentVersion, slot.promptVersion ?? "1");
    const ttlMs = isUserPath ? (opts.userTtlMs ?? 600_000) : (opts.developerTtlMs ?? 3_600_000);
    const staleMs = opts.staleMs ?? 86_400_000;

    const staleOr503 = (): Response => {
      if (hit) return wantsSSE ? sse(hit.value) : json(hit.value, 200); // 降级链：stale 缓存兜底
      return json({ error: "ai_unavailable" }, 503);
    };

    try {
      const compiled = compilePrompt({
        registry: opts.registry,
        slotId,
        originalContent: slot.originalContent,
        developerPrompt: slot.developerPrompt,
        userPrompt,
        data: slot.data,
      });
      const model = isUserPath
        ? (opts.models?.user ?? "gpt-4o-mini")
        : (opts.models?.developer ?? "gpt-4o-mini");
      const llmRes = await llm.complete({
        model,
        system: compiled.system,
        user: compiled.user,
        maxTokens: opts.maxTokens ?? 2000,
        timeoutMs: 8000,
      });
      try {
        opts.onUsage?.({
          slotId,
          model,
          reason: isUserPath ? "user-prompt" : "developer-prompt",
          usage: llmRes.usage,
          at: now(),
        });
      } catch (error) {
        console.warn("[ai-render] 用量日志回调失败，已忽略", error);
      }
      const parsed: unknown = JSON.parse(llmRes.text);
      const tree = (parsed as Partial<AiRenderResponse> | null)?.tree;
      const result = validateComponentTree(opts.registry, tree);
      if (!result.ok) {
        // spec §6：丢弃结果，记录原始输出（截断）供调优提示词
        console.warn("[ai-render] 输出校验失败，已丢弃", result.errors, llmRes.text.slice(0, 500));
        return staleOr503();
      }
      const response: AiRenderResponse = {
        version: 1,
        slot: slotId,
        tree: tree as ComponentNode,
        meta: { reason: isUserPath ? "user-prompt" : "developer-prompt" },
      };
      store.set(key, response, ttlMs, staleMs, now());
      return wantsSSE ? sse(response) : json(response, 200);
    } catch (error) {
      console.warn("[ai-render] LLM 调用失败", error);
      return staleOr503();
    }
  };
}
