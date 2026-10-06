import { expect, test } from "@playwright/test";

test("SSE 流式：stream 槽位最终渲染完整内容（骨架→终树传输）", async ({ page }) => {
  // 断言传输层确实走了 SSE：拦截请求检查 Accept 头
  const sseRequest = page.waitForRequest((req) =>
    req.url().includes("/ai-render/shop-hero") && req.headers()["accept"]?.includes("text/event-stream"),
  );
  await page.goto("/shop.html");
  await sseRequest;
  const slot = page.locator('ai-slot[name="shop-hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("降噪耳机 X100：地铁再吵，只剩音乐");
});

// 运营发布（/admin/prompt）后 live 重载同样走 SSE 的用例见 ops.spec.ts（独立实例）。
