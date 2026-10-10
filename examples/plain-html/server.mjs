import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { adminState, applyPrompt, createHandler, downLLM, invalidation, publishUpdate } from "./ai.mjs";
import { dataHandler } from "./data-source.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const pkgRoot = (name) => fileURLToPath(new URL(`../../packages/${name}/dist`, import.meta.url));

const handler = await createHandler({
  llm: process.env.AI_LLM === "down" ? downLLM : undefined,
  cacheFile: process.env.AI_CACHE_FILE ?? new URL("./ai-cache.json", import.meta.url).pathname,
});

const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".map": "application/json" };

async function toWebRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  return new Request(new URL(req.url, "http://localhost"), {
    method: req.method,
    headers: req.headers,
    body: body.length > 0 ? body : undefined,
  });
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/ai-invalidate") {
    const webRes = invalidation.handler(await toWebRequest(req));
    res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
    // SSE body 是长连接流：管道转发，不能 await text()
    if (webRes.body) {
      const reader = webRes.body.getReader();
      res.on("close", () => void reader.cancel());
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(value)) await new Promise((r) => res.once("drain", r));
        }
      } catch {
        // 客户端断开：close 事件已触发 reader.cancel()，订阅者被移除
      }
    }
    res.end();
    return;
  }
  if (url.pathname === "/admin/publish" && req.method === "POST") {
    // ?slot=<slotId> 指定要发布更新的槽位，缺省 shop-hero
    const ok = publishUpdate(url.searchParams.get("slot") ?? undefined);
    res.writeHead(ok ? 200 : 404, { "content-type": "application/json" }).end(`{"ok":${ok}}`);
    return;
  }
  if (url.pathname === "/admin/prompt" && req.method === "POST") {
    // ?slot=<slotId>&prompt=<新提示词>：运营/开发者调整卖点方向 → 重新生成 + 失效推送
    const ok = applyPrompt(url.searchParams.get("slot") ?? "", url.searchParams.get("prompt") ?? "");
    res.writeHead(ok ? 200 : 400, { "content-type": "application/json" }).end(`{"ok":${ok}}`);
    return;
  }
  if (url.pathname === "/admin/state") {
    // 运营控制台（admin.html）读取槽位当前提示词、内容版本与预设方向
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(adminState()));
    return;
  }
  if (url.pathname.startsWith("/ai-render/")) {
    const activeHandler = url.pathname === "/ai-render/data-hero" ? dataHandler : handler;
    const webRes = await activeHandler(await toWebRequest(req));
    // 透传 handler 的 content-type：SSE 协商成功时是 text/event-stream，错误路径仍是 JSON
    res.writeHead(webRes.status, {
      "content-type": webRes.headers.get("content-type") ?? "application/json; charset=utf-8",
    });
    res.end(await webRes.text());
    return;
  }
  let filePath;
  if (url.pathname.startsWith("/vendor/")) {
    const [, , pkg, ...rest] = url.pathname.split("/");
    filePath = join(pkgRoot(pkg), ...rest);
  } else {
    filePath = join(root, normalize(url.pathname === "/" ? "index.html" : url.pathname));
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[extname(filePath)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404).end("not found");
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  // 端口优先级：--port 参数 > PORT 环境变量 > 4173（便于 npm run dev -- --port <n> 透传）
  const flagIdx = process.argv.findIndex((a) => a === "--port" || a.startsWith("--port="));
  const cliPort = flagIdx >= 0
    ? Number(process.argv[flagIdx].includes("=") ? process.argv[flagIdx].split("=")[1] : process.argv[flagIdx + 1])
    : NaN;
  const port = cliPort || Number(process.env.PORT ?? 4173);
  server.listen(port, () => console.log(`示例站: http://localhost:${port}`));
}
