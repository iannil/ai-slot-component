import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const exampleDir = fileURLToPath(new URL("..", import.meta.url));
const LIVE_PORT = 4175;

// 失效推送会改变服务端共享状态（版本号 / contentVersion），与 prewarm 一样
// 起独立实例，避免影响其它 spec 对「v0」标题的断言。
test("失效推送：publish 后页面静默更新到新版内容", async ({ page }) => {
  const server = spawn("node", ["server.mjs"], {
    cwd: exampleDir,
    env: { ...process.env, PORT: String(LIVE_PORT) },
  });
  try {
    // 等服务就绪
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://localhost:${LIVE_PORT}/`);
        if (res.ok) break;
      } catch { /* 未就绪 */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    await page.goto(`http://localhost:${LIVE_PORT}/`);
    const slot = page.locator('ai-slot[name="hero"]');
    await expect(slot.locator(".hero-title")).toHaveText("AI 增强后的标题 v0");
    // 模拟数据源变更：管理端点发布 → 推送失效 → 槽位静默重新加载
    const res = await page.request.post(`http://localhost:${LIVE_PORT}/admin/publish`);
    expect(res.ok()).toBe(true);
    await expect(slot.locator(".hero-title")).toHaveText("AI 增强后的标题 v1");
  } finally {
    server.kill();
  }
});
