// 重新生成根 README 使用的截图（GIF 由 capture-demo.mjs 负责）：
//   node capture-assets.mjs            # 需先 node server.mjs（端口 4173）
// 产物写入仓库 assets/：screenshot-hero.png、screenshot-prompt.png、screenshot-rewritten.png
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const assetsDir = fileURLToPath(new URL("../../assets/", import.meta.url));
const videoDir = "/tmp/ai-slot-capture";
mkdirSync(assetsDir, { recursive: true });
mkdirSync(videoDir, { recursive: true });

const BASE = process.env.BASE_URL ?? "http://localhost:4173";
// waitForFunction 的断言运行在页面上下文，必须自包含（完整箭头函数源码）
const heroHas = (needle) =>
  `() => (document.querySelector('ai-slot[name="shop-hero"] .hero-title')?.textContent ?? "").includes(${JSON.stringify(needle)})`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1120, height: 760 },
  recordVideo: { dir: videoDir, size: { width: 1120, height: 760 } },
});
const page = await context.newPage();

// 录制前复位：shop-hero 提示词回到默认方向（server 可能是复用的旧进程）
await page.request.post(`${BASE}/admin/prompt?slot=shop-hero&prompt=${encodeURIComponent("面向通勤族，突出降噪效果和佩戴舒适")}`);

// ① 流式完成后的 AI 增强首屏
await page.goto(`${BASE}/shop.html`);
await page.waitForFunction(heroHas("地铁再吵，只剩音乐"));
await page.waitForTimeout(400);
await page.screenshot({ path: `${assetsDir}screenshot-hero.png` });

// ② 免发版更新：模拟数据源变更 → 失效推送 → hero 槽位原地重渲染（促销副标题轮换，页面不刷新）
// 断言「副标题相对初始值变化」而非具体文案：server 的 version 是模块状态，跨捕获运行会累加
// 先让初始促销停留足够久，观众才能看清「没有刷新、没有输入，促销自己变了」
const initialSub = await page.locator('ai-slot[name="shop-hero"] .hero-subtitle').textContent();
await page.waitForTimeout(1_200);
await page.request.post(`${BASE}/admin/publish?slot=shop-hero`);
await page.waitForFunction(
  (prev) => (document.querySelector('ai-slot[name="shop-hero"] .hero-subtitle')?.textContent ?? "") !== prev,
  initialSub,
  { timeout: 10_000 },
);
await page.waitForTimeout(1_000);

// ③ 运营控制台：为 shop-hero 填入新的卖点方向（调整者是运营/开发者，页面上没有输入框）
await page.goto(`${BASE}/admin.html`);
const opsCard = page.locator('.slot-card[data-slot="shop-hero"]');
await opsCard.locator("input[name=prompt]").click();
await opsCard.locator("input[name=prompt]").pressSequentially("面向学生党，突出性价比与宿舍降噪", { delay: 60 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${assetsDir}screenshot-prompt.png` });

// ④ 发布并推送 → 访客页重新加载后呈现新卖点方向
await opsCard.locator("button.publish-prompt").click();
await page.waitForTimeout(400);
await page.goto(`${BASE}/shop.html`);
await page.waitForFunction(heroHas("学生党闭眼入的降噪耳机"));
await page.waitForTimeout(600);
await page.screenshot({ path: `${assetsDir}screenshot-rewritten.png` });

// 复位：把提示词改回默认方向，避免污染后续演示/录制
await page.request.post(`${BASE}/admin/prompt?slot=shop-hero&prompt=${encodeURIComponent("面向通勤族，突出降噪效果和佩戴舒适")}`);

await context.close();
await browser.close();
console.log(`截图完成 → ${assetsDir}`);
