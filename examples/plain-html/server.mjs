import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler, downLLM } from "./ai.mjs";

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
  if (url.pathname.startsWith("/ai-render/")) {
    const webRes = await handler(await toWebRequest(req));
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
  const port = Number(process.env.PORT ?? 4173);
  server.listen(port, () => console.log(`示例站: http://localhost:${port}`));
}
