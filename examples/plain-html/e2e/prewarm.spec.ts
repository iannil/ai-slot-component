import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const exampleDir = fileURLToPath(new URL("..", import.meta.url));

// 「AI 静态化」：预生成缓存水合后，即使 LLM 全挂，开发者路径仍返回预生成内容。
test("预生成缓存：LLM 不可用时 hero 仍渲染预生成内容", async ({ page }) => {
  // ① CI 预生成
  await run("node", ["prewarm.mjs"], { cwd: exampleDir });
  // ② 部署后 LLM 全挂
  const server = (await import("node:child_process")).spawn(
    "node",
    ["server.mjs"],
    { cwd: exampleDir, env: { ...process.env, AI_LLM: "down", PORT: "4174" } },
  );
  try {
    // 等服务就绪
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch("http://localhost:4174/");
        if (res.ok) break;
      } catch { /* 未就绪 */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    await page.goto("http://localhost:4174/");
    const slot = page.locator('ai-slot[name="hero"]');
    await expect(slot.locator(".hero-title")).toHaveText("AI 增强后的标题");
  } finally {
    server.kill();
  }
});
