import { expect, test } from "@playwright/test";

test("开发者提示词路径：AI 增强内容替换兜底", async ({ page }) => {
  await page.goto("/shop.html");
  const slot = page.locator('ai-slot[name="shop-hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("降噪耳机 X100：地铁再吵，只剩音乐");
  await expect(slot.locator(".hero-subtitle")).toHaveText("¥199 · 今日下单享 8 折");
  // 兜底段落（无 class）已被 AI 内容替换
  await expect(slot.locator("p:not(.hero-subtitle)")).toHaveCount(0);
});

test("页面上没有输入框：调整者是运营/开发者，不是访客", async ({ page }) => {
  for (const path of ["/shop.html", "/hotel.html", "/news.html", "/fin.html"]) {
    await page.goto(path);
    await expect(page.locator("form.ai-slot-editor")).toHaveCount(0);
  }
});

test("AI 失败路径：保持兜底内容，页面不坏", async ({ page }) => {
  await page.goto("/shop.html");
  const slot = page.locator('ai-slot[name="shop-rec"]');
  await expect(slot.locator("h2")).toHaveText("为您推荐");
  // 等待一个加载周期后依然保持兜底
  await page.waitForTimeout(500);
  await expect(slot.locator("h2")).toHaveText("为您推荐");
});
