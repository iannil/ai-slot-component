import { expect, test } from "@playwright/test";

test("SSE 流式：stream 槽位最终渲染完整内容（骨架→终树传输）", async ({ page }) => {
  // 断言传输层确实走了 SSE：拦截请求检查 Accept 头
  const sseRequest = page.waitForRequest((req) =>
    req.url().includes("/ai-render/hero") && req.headers()["accept"]?.includes("text/event-stream"),
  );
  await page.goto("/");
  await sseRequest;
  const slot = page.locator('ai-slot[name="hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("AI 增强后的标题 v0");
});

test("SSE 流式：用户路径（POST）同样工作", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("AI 增强后的标题 v0");
  await slot.locator("input[name=prompt]").fill("换标题");
  await slot.locator("button[type=submit]").click();
  await expect(slot.locator(".hero-title")).toHaveText("用户定制标题");
});
