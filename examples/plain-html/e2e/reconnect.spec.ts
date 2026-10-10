import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const exampleDir = fileURLToPath(new URL("..", import.meta.url));
const PORT = 4193;
const BASE = `http://localhost:${PORT}`;

test("断线期间发布的更新在重连后自动补齐，槽位外节点保持原样", async ({ page, context }) => {
  test.setTimeout(25000);
  const server = spawn("node", ["server.mjs"], {
    cwd: exampleDir,
    env: { ...process.env, PORT: String(PORT) },
  });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`${BASE}/`)).ok) { ready = true; break; }
      } catch { /* 服务尚未就绪 */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`示例服务 ${PORT} 未就绪`);

    const firstConnection = page.waitForResponse((res) =>
      res.url().includes("/ai-invalidate?slot=shop-hero") && res.status() === 200,
    );
    await page.goto(`${BASE}/shop.html`);
    const slot = page.locator('ai-slot[name="shop-hero"]');
    const subtitle = slot.locator(".hero-subtitle");
    await expect(subtitle).toBeVisible();
    const initialSubtitle = await subtitle.textContent();
    await firstConnection;
    await page.evaluate(() => {
      const marker = document.createElement("div");
      marker.id = "external-marker";
      marker.textContent = "outside stays";
      document.body.appendChild(marker);
    });

    const disconnected = page.waitForEvent("requestfailed", {
      predicate: (req) => req.url().includes("/ai-invalidate?slot=shop-hero"),
      timeout: 5000,
    });
    await context.setOffline(true);
    await page.evaluate(() => window.stop());
    await disconnected;
    const publish = await fetch(`${BASE}/admin/publish?slot=shop-hero`, { method: "POST" });
    expect(publish.ok).toBe(true);
    await expect(subtitle).toHaveText(initialSubtitle!);

    // 监听重新发起的订阅请求，再恢复网络；不再发送任何失效通知。
    const retry = page.waitForRequest((req) =>
      req.url().includes("/ai-invalidate?slot=shop-hero") &&
      req.headers()["accept"]?.includes("text/event-stream"), { timeout: 15000 },
    );
    await context.setOffline(false);
    await retry;
    await expect(subtitle).not.toHaveText(initialSubtitle!, { timeout: 15000 });
    await expect(subtitle).toHaveText("¥159 · 限时秒杀，今晚 24 点截止");
    await expect(page.locator("#external-marker")).toHaveText("outside stays");
  } finally {
    await context.setOffline(false);
    await page.close();
    server.kill();
  }
});

const websiteDir = fileURLToPath(new URL("../../../website/", import.meta.url));
const WEBSITE_PORT = 4195;
const WEBSITE_BASE = `http://127.0.0.1:${WEBSITE_PORT}`;

test("官网演示换行业时取消旧 live 流，旧响应不能改写新页面", async ({ page }) => {
  test.setTimeout(25000);
  const server = spawn("node", ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(WEBSITE_PORT)], {
    cwd: websiteDir,
    env: process.env,
  });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(WEBSITE_BASE)).ok) { ready = true; break; }
      } catch { /* Vite 尚未就绪 */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`官网演示 ${WEBSITE_PORT} 未就绪`);
    await page.addInitScript(() => localStorage.setItem("aislot-lang", "en"));
    await page.goto(WEBSITE_BASE);
    await page.locator(".demo-pick-card").nth(0).click();
    await expect(page.locator(".demo-back")).toBeVisible();
    await page.evaluate(() => {
      const original = window.fetch;
      const tracked = window as typeof window & { __oldLiveSignals?: AbortSignal[] };
      tracked.__oldLiveSignals = [];
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/ai-invalidate?slot=shop-hero") && init?.signal) tracked.__oldLiveSignals!.push(init.signal);
        return original(input, init);
      }) as typeof fetch;
    });
    await page.locator(".demo-step.active .demo-action").click();
    await expect(page.locator('ai-slot[name="shop-hero"]')).toHaveAttribute("live", "");
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __oldLiveSignals?: AbortSignal[] }).__oldLiveSignals?.length ?? 0,
    )).toBeGreaterThan(0);

    await page.locator(".demo-back").click();
    await page.locator(".demo-pick-card").nth(1).click();
    await page.locator(".demo-step.active .demo-action").click();
    await expect(page.locator('ai-slot[name="hotel-hero"] .hero-title')).toHaveText(
      "Wake up to West Lake, Broken Bridge at dawn",
    );
    await expect(page.locator('ai-slot[name="shop-hero"]')).toHaveCount(0);
    expect(await page.evaluate(() =>
      (window as typeof window & { __oldLiveSignals?: AbortSignal[] }).__oldLiveSignals?.every((signal) => signal.aborted),
    )).toBe(true);
  } finally {
    await page.close();
    server.kill();
  }
});
