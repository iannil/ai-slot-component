import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// 运营调整路径：/admin/prompt 与 admin.html 控制台。
// applyPrompt 会改变服务端共享状态（developerPrompt / contentVersion），与 live/prewarm 一样
// 起独立实例，避免影响其它 spec 对初始文案的断言。
const exampleDir = fileURLToPath(new URL("..", import.meta.url));
const OPS_PORT = 4176;
const BASE = `http://localhost:${OPS_PORT}`;

const DEFAULT_PROMPT = "面向通勤族，突出降噪效果和佩戴舒适";
const ALT_PROMPT = "面向学生党，突出性价比与宿舍降噪";

let server;
test.beforeAll(async () => {
  server = spawn("node", ["server.mjs"], {
    cwd: exampleDir,
    env: { ...process.env, PORT: String(OPS_PORT) },
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`ops server on ${OPS_PORT} not ready`);
});
test.afterAll(() => server.kill());

test("运营提示词推送：/admin/prompt 发布后页面原地更新，无需刷新", async ({ page }) => {
  await page.goto(`${BASE}/shop.html`);
  const slot = page.locator('ai-slot[name="shop-hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("降噪耳机 X100：地铁再吵，只剩音乐");
  // 页面上没有输入框：调整者是运营/开发者，不是访客
  await expect(slot.locator("form.ai-slot-editor")).toHaveCount(0);

  // live 推送触发的重新加载同样走 SSE（骨架→终树双帧）
  const sseReload = page.waitForRequest((req) =>
    req.url().includes("/ai-render/shop-hero") && req.headers()["accept"]?.includes("text/event-stream"),
  );
  const res = await page.request.post(`${BASE}/admin/prompt?slot=shop-hero&prompt=${encodeURIComponent(ALT_PROMPT)}`);
  expect(res.ok()).toBe(true);
  await sseReload;
  // live 推送 → 槽位静默重新加载 → 标题与副标题原地换成新卖点方向
  await expect(slot.locator(".hero-title")).toHaveText("学生党闭眼入的降噪耳机");
  await expect(slot.locator(".hero-subtitle")).toHaveText("¥199 · 学生认证再减 20");

  // 恢复默认方向
  await page.request.post(`${BASE}/admin/prompt?slot=shop-hero&prompt=${encodeURIComponent(DEFAULT_PROMPT)}`);
  await expect(slot.locator(".hero-title")).toHaveText("降噪耳机 X100：地铁再吵，只剩音乐");
});

test("运营控制台：预设方向发布后在访客页生效", async ({ page }) => {
  await page.goto(`${BASE}/admin.html`);
  const card = page.locator('.slot-card[data-slot="hotel-hero"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".current-prompt")).toHaveText("面向周末度假的夫妻与家庭客，突出湖景与步行可达的景点");

  // 点预设填入提示词 → 发布
  await card.locator(".chip", { hasText: "带父母出行方向" }).click();
  await expect(card.locator("input[name=prompt]")).toHaveValue("面向带父母出行的家庭客，突出安静与无障碍");
  await card.locator("button.publish-prompt").click();
  await expect(card.locator(".current-prompt")).toHaveText("面向带父母出行的家庭客，突出安静与无障碍");

  // 访客页（全新加载）呈现调整后的结果
  await page.goto(`${BASE}/hotel.html`);
  await expect(page.locator('ai-slot[name="hotel-hero"] .hero-title')).toHaveText("带父母住：安静庭院房，电梯直达");
});
