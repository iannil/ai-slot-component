import { expect, test } from "@playwright/test";

test("开发者提示词路径：AI 增强内容替换兜底", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("降噪耳机 X100：地铁再吵，只剩音乐");
  await expect(slot.locator(".hero-subtitle")).toHaveText("¥199 · 今日下单享 8 折");
  // 兜底段落（无 class）已被 AI 内容替换
  await expect(slot.locator("p:not(.hero-subtitle)")).toHaveCount(0);
});

test("用户提示词路径：editable 提交后实时更新该槽位", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("降噪耳机 X100：地铁再吵，只剩音乐");
  await slot.locator("input[name=prompt]").fill("给学生党推荐");
  await slot.locator("button[type=submit]").click();
  await expect(slot.locator(".hero-title")).toHaveText("学生党闭眼入的降噪耳机");
  // 恢复默认回到原始兜底内容
  await slot.locator("button", { hasText: "恢复默认" }).click();
  await expect(slot.locator("h1")).toHaveText("降噪耳机 X100");
});

test("AI 失败路径：保持兜底内容，页面不坏", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="broken"]');
  await expect(slot.locator("h2")).toHaveText("为您推荐");
  // 等待一个加载周期后依然保持兜底
  await page.waitForTimeout(500);
  await expect(slot.locator("h2")).toHaveText("为您推荐");
});
