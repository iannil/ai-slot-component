import { expect, test } from "@playwright/test";

test("开发者提示词路径：AI 增强内容替换兜底", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("AI 增强后的标题 v0");
  await expect(slot.locator("h1:has-text('我们的产品')")).toHaveCount(0);
});

test("用户提示词路径：editable 提交后实时更新该槽位", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("AI 增强后的标题 v0");
  await slot.locator("input[name=prompt]").fill("换成更短的标题");
  await slot.locator("button[type=submit]").click();
  await expect(slot.locator(".hero-title")).toHaveText("用户定制标题");
  // 恢复默认回到原始兜底内容
  await slot.locator("button", { hasText: "恢复默认" }).click();
  await expect(slot.locator("h1")).toHaveText("我们的产品");
});

test("AI 失败路径：保持兜底内容，页面不坏", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="broken"]');
  await expect(slot.locator("h2")).toHaveText("兜底：静态内容");
  // 等待一个加载周期后依然保持兜底
  await page.waitForTimeout(500);
  await expect(slot.locator("h2")).toHaveText("兜底：静态内容");
});
