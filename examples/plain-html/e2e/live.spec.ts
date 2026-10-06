import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const exampleDir = fileURLToPath(new URL("..", import.meta.url));
const LIVE_PORT = 4175;

// 失效推送会改变服务端共享状态（促销版本 / contentVersion），与 prewarm 一样
// 起独立实例，避免影响其它 spec 对初始促销文案的断言。
test("失效推送：publish 后页面静默更新到新版促销", async ({ page }) => {
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
    await page.goto(`http://localhost:${LIVE_PORT}/shop.html`);
    const slot = page.locator('ai-slot[name="shop-hero"]');
    await expect(slot.locator(".hero-subtitle")).toHaveText("¥199 · 今日下单享 8 折");
    // 模拟数据源变更：管理端点发布 → 推送失效 → 槽位静默重新加载，促销文案原地更新
    const res = await page.request.post(`http://localhost:${LIVE_PORT}/admin/publish?slot=shop-hero`);
    expect(res.ok()).toBe(true);
    await expect(slot.locator(".hero-subtitle")).toHaveText("¥159 · 限时秒杀，今晚 24 点截止");
  } finally {
    server.kill();
  }
});
