import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createAiRenderHandler } from "@ai-slot/proxy";
import { registry } from "./registry.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const pkgRoot = (name) => fileURLToPath(new URL(`../../packages/${name}/dist`, import.meta.url));

/** Mock LLM：确定性输出，slotId=broken 时模拟失败。 */
const mockLLM = {
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

const handler = createAiRenderHandler({
  registry,
  llm: mockLLM,
  resolveSlot: (slotId) => {
    const slots = {
      hero: {
        slotId: "hero",
        originalContent: "<h1>我们的产品</h1><p>一个普通的产品介绍</p>",
        developerPrompt: "面向开发者受众，突出接入简单",
        contentVersion: "v1",
      },
      broken: { slotId: "broken", originalContent: "<h2>兜底：静态内容</h2>", contentVersion: "v1" },
    };
    return slots[slotId] ?? null;
  },
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
    res.writeHead(webRes.status, { "content-type": "application/json; charset=utf-8" });
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
  server.listen(4173, () => console.log("示例站: http://localhost:4173"));
}
