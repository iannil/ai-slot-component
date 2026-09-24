import { createAiRenderHandler, MemoryCacheStore } from "@ai-slot/proxy";
import { readFile } from "node:fs/promises";
import { registry } from "./registry.mjs";

/** Mock LLM：确定性输出，slotId=broken 时模拟失败。 */
export const mockLLM = {
  async complete(req) {
    if (req.user.includes("槽位：broken")) throw new Error("mock LLM failure");
    const isUser = req.user.includes("按用户要求调整");
    return {
      text: JSON.stringify({
        version: 1,
        slot: "hero",
        tree: {
          component: "hero-banner",
          props: {
            title: isUser ? "用户定制标题" : "AI 增强后的标题",
            subtitle: "由 mock LLM 生成",
          },
        },
      }),
    };
  },
};

export const downLLM = { async complete() { throw new Error("LLM down（模拟故障）"); } };

export const slots = {
  hero: {
    slotId: "hero",
    originalContent: "<h1>我们的产品</h1><p>一个普通的产品介绍</p>",
    developerPrompt: "面向开发者受众，突出接入简单",
    contentVersion: "v1",
  },
  broken: { slotId: "broken", originalContent: "<h2>兜底：静态内容</h2>", contentVersion: "v1" },
};

/** 装配 handler；cacheFile 存在时水合预生成缓存。 */
export async function createHandler({ llm = mockLLM, cacheFile } = {}) {
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
    llm,
    store,
    resolveSlot: (slotId) => slots[slotId] ?? null,
  });
}
