// 重新生成根 README 使用的截图与演示 GIF：
//   node capture-assets.mjs            # 需先 node server.mjs（端口 4173）
//   ffmpeg 合成 GIF 在脚本末尾单独执行（见输出提示）
// 产物写入仓库 assets/：demo.gif、screenshot-hero.png、screenshot-prompt.png、screenshot-rewritten.png
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
  `() => (document.querySelector('ai-slot[name="hero"] .hero-title')?.textContent ?? "").includes(${JSON.stringify(needle)})`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 760, height: 320 },
  recordVideo: { dir: videoDir, size: { width: 760, height: 320 } },
});
const page = await context.newPage();

// ① 流式完成后的 AI 增强首屏
await page.goto(`${BASE}/`);
await page.waitForFunction(heroHas("AI 增强后的标题"));
await page.waitForTimeout(400);
await page.screenshot({ path: `${assetsDir}screenshot-hero.png` });

// ② 编辑器中输入用户提示词（慢速输入，视频里可读）
const input = page.locator('ai-slot[name="hero"] input[name=prompt]');
await input.click();
await input.pressSequentially("换成更短的标题", { delay: 120 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${assetsDir}screenshot-prompt.png` });

// ③ 提交后实时改写
await page.locator('ai-slot[name="hero"] button[type=submit]').click();
await page.waitForFunction(heroHas("用户定制标题"));
await page.waitForTimeout(600);
await page.screenshot({ path: `${assetsDir}screenshot-rewritten.png` });

await context.close();
await browser.close();
console.log(`截图完成 → ${assetsDir}`);
console.log(`视频在 ${videoDir}，下一步用 ffmpeg 转 GIF：`);
console.log(`  ffmpeg -y -i ${videoDir}/*.webm -vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" ${assetsDir}demo.gif`);
