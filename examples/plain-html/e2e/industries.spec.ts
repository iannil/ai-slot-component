import { expect, test } from "@playwright/test";

// 四个行业页面的核心路径覆盖：hero 槽位 AI 内容上屏、rec 槽位故障静默兜底。
// 电商（shop）的三条完整路径见 ai-slot.spec.ts / live.spec.ts / stream.spec.ts。

test("演示中心：四个行业入口齐全", async ({ page }) => {
  await page.goto("/");
  for (const href of ["/shop.html", "/hotel.html", "/news.html", "/fin.html"]) {
    await expect(page.locator(`a.card[href="${href}"]`)).toBeVisible();
  }
});

test("酒店页：AI 卖点替换兜底，周边推荐故障保持静态", async ({ page }) => {
  await page.goto("/hotel.html");
  const hero = page.locator('ai-slot[name="hotel-hero"]');
  await expect(hero.locator(".hero-title")).toHaveText("推窗见西湖：把断桥残雪装进清晨");
  await expect(hero.locator(".hero-subtitle")).toHaveText("¥899/晚 · 含双早+欢迎茶点");
  const rec = page.locator('ai-slot[name="hotel-rec"]');
  await page.waitForTimeout(500);
  await expect(rec.locator("h2")).toHaveText("周边推荐");
});

test("新闻页：AI 导读上屏，相关阅读故障保持静态", async ({ page }) => {
  await page.goto("/news.html");
  const hero = page.locator('ai-slot[name="news-hero"]');
  await expect(hero.locator(".markdown")).toContainText("导读：新一代推理引擎将调用成本降至原来的 30%");
  const rec = page.locator('ai-slot[name="news-rec"]');
  await page.waitForTimeout(500);
  await expect(rec.locator("h2")).toHaveText("相关阅读");
});

test("理财页：AI 亮点替换兜底，相似产品故障保持静态", async ({ page }) => {
  await page.goto("/fin.html");
  const hero = page.locator('ai-slot[name="fin-hero"]');
  await expect(hero.locator(".hero-title")).toHaveText("稳盈 180 天：给闲钱一个半程加油站");
  await expect(hero.locator(".hero-subtitle")).toHaveText("七日年化 2.85% · 1 元起购");
  const rec = page.locator('ai-slot[name="fin-rec"]');
  await page.waitForTimeout(500);
  await expect(rec.locator("h2")).toHaveText("相似产品");
});

// 运营控制台（admin.html）与 /admin/prompt 推送路径见 ops.spec.ts（独立实例，避免污染共享状态）。
