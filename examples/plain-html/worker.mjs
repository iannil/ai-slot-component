/**
 * Cloudflare Worker 入口：与 server.mjs 等价的路由，但全程 Web 标准 API。
 * 静态页面由 Workers Static Assets 托管（public/，由 build-public.mjs 生成）。
 *
 * 所有 API（/ai-render/*、/ai-invalidate、/admin/*）转发到全局单例 Durable Object：
 * 槽位状态（提示词、内容版本）与 SSE 订阅表都在内存中，只有收敛到同一对象内，
 * 「运营发布 → 失效推送 → 页面原地更新」链路才不会因多 isolate 路由而丢失推送。
 */
import { adminState, applyPrompt, createHandler, invalidation, publishUpdate } from "./ai.mjs";
// wrangler.toml 的 rules 把 ai-cache.json 以 Text 类型内联进 bundle
import aiCacheText from "./ai-cache.json";

const handlerPromise = createHandler({ cacheData: aiCacheText });

/** 全局单例演示房间：承载全部 API 逻辑与内存状态。 */
export class DemoRoom {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ai-invalidate") {
      return invalidation.handler(request);
    }
    if (url.pathname === "/admin/publish" && request.method === "POST") {
      const ok = publishUpdate(url.searchParams.get("slot") ?? undefined);
      return Response.json({ ok }, { status: ok ? 200 : 404 });
    }
    if (url.pathname === "/admin/prompt" && request.method === "POST") {
      const ok = applyPrompt(url.searchParams.get("slot") ?? "", url.searchParams.get("prompt") ?? "");
      return Response.json({ ok }, { status: ok ? 200 : 400 });
    }
    if (url.pathname === "/admin/state") {
      return Response.json(adminState());
    }
    if (url.pathname.startsWith("/ai-render/")) {
      return (await handlerPromise)(request);
    }
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi =
      url.pathname === "/ai-invalidate" ||
      url.pathname === "/admin/state" ||
      url.pathname.startsWith("/admin/") ||
      url.pathname.startsWith("/ai-render/");
    if (isApi) {
      const stub = env.DEMO.get(env.DEMO.idFromName("global"));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
