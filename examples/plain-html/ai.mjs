import { createAiRenderHandler, createInvalidationChannel, createOpenAIClient, MemoryCacheStore } from "@ai-slot/proxy";
import { readFile } from "node:fs/promises";
import { registry } from "./registry.mjs";

export const invalidation = createInvalidationChannel();

/** 输出内容带可观测版本号：publishUpdate 后重载结果可与旧内容区分。 */
let version = 0;

/** 录制英文 demo 时的文案（AI_DEMO_LANG=en）；默认中文，e2e 断言依赖中文文案，勿改默认值。 */
const en = process.env.AI_DEMO_LANG === "en";
/** 录制用：放慢 mock 响应让骨架帧在视频里可见（AI_DEMO_SLOW=毫秒数）。 */
const demoSlowMs = Number(process.env.AI_DEMO_SLOW ?? 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 促销文案随内容版本轮换：publishUpdate 后 live 推送带来的「原地更新」对观众可观测。 */
const promos = en
  ? ["$29.99 · 20% off today", "$24.99 · flash sale ends at midnight", "$27.99 · $5 back with a review"]
  : ["¥199 · 今日下单享 8 折", "¥159 · 限时秒杀，今晚 24 点截止", "¥189 · 晒单返 20 元"];

/** Mock LLM：确定性输出，slotId=broken 时模拟失败。 */
export const mockLLM = {
  async complete(req) {
    if (process.env.AI_DEMO_TRACE) {
      console.error(`[mock] complete @${Date.now()} slow=${demoSlowMs} user=${req.user.slice(0, 40).replace(/\n/g, "⏎")}`);
    }
    if (req.user.includes("槽位：broken")) throw new Error("mock LLM failure");
    if (demoSlowMs > 0) await sleep(demoSlowMs);
    const isUser = req.user.includes("按用户要求调整");
    return {
      text: JSON.stringify({
        version: 1,
        slot: "hero",
        tree: {
          component: "hero-banner",
          props: {
            title: isUser
              ? en ? "The student pick for deep focus" : "学生党闭眼入的降噪耳机"
              : en ? "X100: the subway disappears, the music stays" : "降噪耳机 X100：地铁再吵，只剩音乐",
            subtitle: isUser
              ? en ? "$29.99 · extra 10% off with student ID" : "¥199 · 学生认证再减 20"
              : promos[version % promos.length],
          },
        },
      }),
    };
  },
};

export const downLLM = { async complete() { throw new Error("LLM down（模拟故障）"); } };

/**
 * 数据源发布更新：内容版本+1（contentVersion 变化 → 缓存 key 变化 → 必然重新调用 LLM），
 * 然后向 hero 槽位的所有订阅者推送失效信号。这正是真实语义：数据源变了 → 推送失效。
 */
export function publishUpdate() {
  version += 1;
  slots.hero.contentVersion = `v${version + 1}`;
  invalidation.invalidate("hero");
}

export const slots = {
  hero: {
    slotId: "hero",
    originalContent: en
      ? "<h1>X100 Noise-Canceling Headphones</h1><p>Good sound. Comfortable fit.</p>"
      : "<h1>降噪耳机 X100</h1><p>音质好，佩戴舒适。</p>",
    developerPrompt: en
      ? "For commuters, emphasize noise canceling and all-day comfort"
      : "面向通勤族，突出降噪效果和佩戴舒适",
    contentVersion: "v1",
  },
  broken: {
    slotId: "broken",
    originalContent: en
      ? "<h2>You may also like</h2><p>Ear tips · Carrying case · Extended warranty</p>"
      : "<h2>为您推荐</h2><p>耳塞套 · 收纳盒 · 延保服务</p>",
    contentVersion: "v1",
  },
};

/** 真实 LLM（设置了 OPENAI_API_KEY 时）；否则 null 表示用 mock。重试由 handler 内置的 withRetry 统一负责，这里不再叠加。 */
function realLLM() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return createOpenAIClient({
    apiKey,
    baseUrl: process.env.AI_BASE_URL, // 可选：OpenAI 兼容端点
  });
}

/** 装配 handler；cacheFile 存在时水合预生成缓存。 */
export async function createHandler({ llm, cacheFile } = {}) {
  const resolved = llm ?? realLLM() ?? mockLLM;
  // 真实 LLM 时分档选模型；mock 时由 handler 默认值兜底
  const models = process.env.OPENAI_API_KEY
    ? {
        developer: process.env.AI_MODEL_DEVELOPER ?? "gpt-4o",
        user: process.env.AI_MODEL_USER ?? "gpt-4o-mini",
      }
    : undefined;
  let store;
  if (cacheFile) {
    try {
      store = MemoryCacheStore.load(await readFile(cacheFile, "utf8"), Date.now());
      console.log(`[ai] 已水合预生成缓存: ${cacheFile}`);
    } catch {
      // 文件不存在或损坏：跳过水合
    }
  }
  return createAiRenderHandler({
    registry,
    llm: resolved,
    store,
    models,
    resolveSlot: (slotId) => slots[slotId] ?? null,
  });
}
