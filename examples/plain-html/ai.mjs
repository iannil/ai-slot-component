import { createAiRenderHandler, createInvalidationChannel, createOpenAIClient, MemoryCacheStore } from "@ai-slot/proxy";
import { readFile } from "node:fs/promises";
import { registry } from "./registry.mjs";

export const invalidation = createInvalidationChannel();

/** 官网英文录制的文案（AI_DEMO_LANG=en）：仅覆盖 shop 行业；默认中文，e2e 断言依赖中文文案，勿改默认值。 */
const en = process.env.AI_DEMO_LANG === "en";
/** 录制用：放慢 mock 响应让加载过程在视频里可见（AI_DEMO_SLOW=毫秒数）。 */
const demoSlowMs = Number(process.env.AI_DEMO_SLOW ?? 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 四个行业的演示内容。每个行业两个槽位：
 * - `<行业>-hero`：首屏文案区，承载 stream（骨架→终树）与 live（失效推送）两种能力；
 *   卖点方向的调整由运营控制台（admin.html → POST /admin/prompt）完成，页面上没有输入框
 * - `<行业>-rec`：推荐区，mock 永远失败，演示静默兜底
 *
 * promos 随内容版本轮换：publishUpdate 后 live 推送带来的「原地更新」对观众可观测。
 * alt 是运营可切换的预设卖点方向：applyPrompt 把 developerPrompt 换成 alt.prompt 后，
 * mock 即输出 alt 内容——与真实 LLM 按新提示词重写等效。
 */
const INDUSTRIES = {
  shop: {
    hero: {
      original: en
        ? "<h1>X100 Noise-Canceling Headphones</h1><p>Good sound. Comfortable fit.</p>"
        : "<h1>降噪耳机 X100</h1><p>音质好，佩戴舒适。</p>",
      developerPrompt: en
        ? "For commuters, emphasize noise canceling and all-day comfort"
        : "面向通勤族，突出降噪效果和佩戴舒适",
      promos: en
        ? ["$29.99 · 20% off today", "$24.99 · flash sale ends at midnight", "$27.99 · $5 back with a review"]
        : ["¥199 · 今日下单享 8 折", "¥159 · 限时秒杀，今晚 24 点截止", "¥189 · 晒单返 20 元"],
      title: en ? "X100: the subway disappears, the music stays" : "降噪耳机 X100：地铁再吵，只剩音乐",
      alt: {
        label: en ? "Student angle" : "学生党方向",
        prompt: en
          ? "Pitch it to students: value and dorm-friendly noise canceling"
          : "面向学生党，突出性价比与宿舍降噪",
        title: en ? "The student pick for deep focus" : "学生党闭眼入的降噪耳机",
        subtitle: en ? "$29.99 · extra 10% off with student ID" : "¥199 · 学生认证再减 20",
      },
    },
    rec: {
      original: en
        ? "<h2>You may also like</h2><p>Ear tips · Carrying case · Extended warranty</p>"
        : "<h2>为您推荐</h2><p>耳塞套 · 收纳盒 · 延保服务</p>",
    },
  },
  hotel: {
    hero: {
      original: "<h1>栖澜·西湖度假酒店</h1><p>位置好，风景不错。</p>",
      developerPrompt: "面向周末度假的夫妻与家庭客，突出湖景与步行可达的景点",
      promos: ["¥899/晚 · 含双早+欢迎茶点", "¥799/晚 · 周中特惠，限量 20 间", "¥959/晚 · 连住两晚赠游船票"],
      title: "推窗见西湖：把断桥残雪装进清晨",
      alt: {
        label: "带父母出行方向",
        prompt: "面向带父母出行的家庭客，突出安静与无障碍",
        title: "带父母住：安静庭院房，电梯直达",
        subtitle: "¥899/晚 · 可备注低楼层安静房",
      },
    },
    rec: {
      original: "<h2>周边推荐</h2><p>曲院风荷 · 楼外楼 · 手摇船码头</p>",
    },
  },
  news: {
    hero: {
      original: "<p>推理成本大幅下降，开发者生态受益。</p>",
      developerPrompt: "用 3 分钟导读的口吻，写给时间有限的行业读者",
      promos: [
        "导读：新一代推理引擎将调用成本降至原来的 30%，首批 200 家厂商完成接入；开发者价格同步下调，小团队第一次用得起工业级推理。",
        "更新：官方确认本轮融资 5 亿美元，资金主要投向推理芯片自研；导读已补充投资方名单。",
        "更新：接入名单新增 3 家车企与 2 家手机厂商；文末附完整接入时间表。",
      ],
      alt: {
        label: "一句话版（给外行）",
        prompt: "给外行读者一句话版本",
        content: "一句话：AI 调用更便宜了，做应用的创业公司会变多。",
      },
    },
    rec: {
      original: "<h2>相关阅读</h2><p>大模型价格战始末 · 推理优化入门</p>",
    },
  },
  fin: {
    hero: {
      original: "<h1>稳盈 180 天·固收增强</h1><p>稳健理财，期限适中。</p>",
      developerPrompt: "面向有闲钱的工薪族，突出稳健与流动性安排，避免收益承诺",
      promos: ["七日年化 2.85% · 1 元起购", "七日年化 2.91% · 新客专享加息券", "七日年化 2.78% · 本期额度即将售罄"],
      title: "稳盈 180 天：给闲钱一个半程加油站",
      alt: {
        label: "保守型投资者方向",
        prompt: "面向保守型投资者，先讲风险与兑付记录",
        title: "给保守型投资者：先看清这三点",
        subtitle: "R2 稳健 · 历史全部按期兑付 · 180 天封闭",
      },
    },
    rec: {
      original: "<h2>相似产品</h2><p>稳盈 90 天 · 季季盈 · 安享货币 A</p>",
    },
  },
};

/** 每个 hero 槽位的内容版本（publishUpdate 后 +1，驱动 promos 轮换与缓存 key 变化）。 */
const versions = {};

function slotVersion(slotId) {
  return versions[slotId] ?? 0;
}

/** 组件树构造：news 的导读用 markdown-block，其余行业用 hero-banner。
 *  dev 为当前生效的开发者提示词：命中 alt.prompt 输出预设方向内容；
 *  其它非默认提示词输出「已按新方向调整」的确定性 mock 改写。 */
function heroTree(industry, slotId, dev) {
  const cfg = INDUSTRIES[industry].hero;
  const v = slotVersion(slotId);
  const isAlt = dev === cfg.alt.prompt;
  const isCustom = Boolean(dev) && dev !== cfg.developerPrompt && !isAlt;
  if (industry === "news") {
    const content = isAlt
      ? cfg.alt.content
      : isCustom
        ? `导读（按「${dev.slice(0, 40)}」调整）：推理成本大幅下降，开发者生态受益。`
        : cfg.promos[v % cfg.promos.length];
    return { component: "markdown-block", props: { content } };
  }
  const props = isAlt
    ? { title: cfg.alt.title, subtitle: cfg.alt.subtitle }
    : isCustom
      ? { title: cfg.title, subtitle: `${en ? "Adjusted to" : "已按新方向调整"}：${dev.slice(0, 40)}` }
      : { title: cfg.title, subtitle: cfg.promos[v % cfg.promos.length] };
  return { component: "hero-banner", props };
}

/** Mock LLM：确定性输出；*-rec 槽位永远失败，模拟推荐服务故障。 */
export const mockLLM = {
  async complete(req) {
    const slotId = req.user.match(/槽位：([\w-]+)/)?.[1] ?? "";
    if (process.env.AI_DEMO_TRACE) {
      console.error(`[mock] complete slot=${slotId} slow=${demoSlowMs} user=${req.user.slice(0, 40).replace(/\n/g, "\\n")}`);
    }
    if (slotId.endsWith("-rec")) throw new Error("mock LLM failure");
    const industry = slotId.split("-")[0];
    if (!INDUSTRIES[industry]) throw new Error(`unknown slot: ${slotId}`);
    if (demoSlowMs > 0) await sleep(demoSlowMs);
    const dev = req.user.match(/开发者要求：([^\n]+)/)?.[1] ?? "";
    return {
      text: JSON.stringify({ version: 1, slot: slotId, tree: heroTree(industry, slotId, dev) }),
    };
  },
};

export const downLLM = { async complete() { throw new Error("LLM down（模拟故障）"); } };

/**
 * 数据源发布更新：内容版本+1（contentVersion 变化 → 缓存 key 变化 → 必然重新调用 LLM），
 * 然后向该槽位的所有订阅者推送失效信号。这正是真实语义：数据源变了 → 推送失效。
 */
export function publishUpdate(slotId = "shop-hero") {
  const slot = slots[slotId];
  if (!slot) return false;
  versions[slotId] = slotVersion(slotId) + 1;
  slot.contentVersion = `v${versions[slotId] + 1}`;
  invalidation.invalidate(slotId);
  return true;
}

/**
 * 运营/开发者调整卖点方向：替换槽位的开发者提示词，内容版本 +1 并推送失效。
 * 真实语义：改提示词 = 改代码/配置 → 重新生成 → 推送；访客页面原地更新，页面上没有输入框。
 */
export function applyPrompt(slotId, prompt) {
  const slot = slots[slotId];
  if (!slot || typeof prompt !== "string" || !prompt.trim()) return false;
  slot.developerPrompt = prompt.trim();
  versions[slotId] = slotVersion(slotId) + 1;
  slot.contentVersion = `v${versions[slotId] + 1}`;
  invalidation.invalidate(slotId);
  return true;
}

/** 运营控制台读取的槽位状态与可切换的预设方向。 */
export function adminState() {
  return {
    slots: Object.values(slots).map((s) => ({
      slotId: s.slotId,
      developerPrompt: s.developerPrompt ?? null,
      contentVersion: s.contentVersion,
    })),
    presets: Object.fromEntries(
      Object.entries(INDUSTRIES).map(([key, ind]) => [
        `${key}-hero`,
        [
          { label: "恢复默认方向", prompt: ind.hero.developerPrompt },
          { label: ind.hero.alt.label, prompt: ind.hero.alt.prompt },
        ],
      ]),
    ),
  };
}

/** 由 INDUSTRIES 展开为 proxy 消费的槽位表。 */
export const slots = Object.fromEntries(
  Object.entries(INDUSTRIES).flatMap(([key, ind]) => [
    [`${key}-hero`, {
      slotId: `${key}-hero`,
      originalContent: ind.hero.original,
      developerPrompt: ind.hero.developerPrompt,
      contentVersion: "v1",
    }],
    [`${key}-rec`, {
      slotId: `${key}-rec`,
      originalContent: ind.rec.original,
      contentVersion: "v1",
    }],
  ]),
);

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
