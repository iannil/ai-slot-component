// CI 构建时预生成：node prewarm.mjs → ai-cache.json（随产物部署）
import { writeFile } from "node:fs/promises";
import { MemoryCacheStore, prewarm, createAiRenderHandler } from "@ai-slot/proxy";
import { registry } from "./registry.mjs";
import { mockLLM, slots } from "./ai.mjs";

const store = new MemoryCacheStore();
const handler = createAiRenderHandler({
  registry,
  llm: mockLLM, // 真实 CI 中换成 createOpenAIClient({ apiKey: process.env.OPENAI_API_KEY })
  store,
  resolveSlot: (slotId) => slots[slotId] ?? null,
  developerTtlMs: 24 * 3600_000, // 预生成条目：1 天 fresh + 7 天 stale
  staleMs: 7 * 24 * 3600_000,
});

const result = await prewarm(handler, Object.keys(slots));
const out = new URL("./ai-cache.json", import.meta.url).pathname;
await writeFile(out, store.dump());
console.log(`prewarm 完成: ok=[${result.ok}] failed=[${result.failed}] → ${out}`);
process.exit(result.failed.length > 0 && result.ok.length === 0 ? 1 : 0);
