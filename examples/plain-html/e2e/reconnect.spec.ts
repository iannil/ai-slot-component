import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const exampleDir = fileURLToPath(new URL("..", import.meta.url));
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("无法分配测试端口");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

async function waitReady(base: string, server: ChildProcess): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error(`测试服务提前退出: ${server.exitCode}`);
    try {
      if ((await fetch(base)).ok) return;
    } catch { /* 服务尚未就绪 */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`测试服务未就绪: ${base}`);
}

test("断线期间发布的更新在重连后自动补齐，槽位外节点保持原样", async ({ page, context }) => {
  test.setTimeout(25000);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn("node", ["server.mjs"], {
    cwd: exampleDir,
    env: { ...process.env, PORT: String(port) },
  });
  try {
    await waitReady(base, server);

    const firstConnection = page.waitForResponse((res) =>
      res.url().includes("/ai-invalidate?slot=shop-hero") && res.status() === 200,
    );
    await page.goto(`${base}/shop.html`);
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
    const publish = await fetch(`${base}/admin/publish?slot=shop-hero`, { method: "POST" });
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
test("官网演示换行业时取消旧 live 流，旧响应不能改写新页面", async ({ page }) => {
  test.setTimeout(25000);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn("node", ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: websiteDir,
    env: process.env,
  });
  try {
    await waitReady(base, server);
    await page.addInitScript(() => localStorage.setItem("aislot-lang", "en"));
    await page.goto(base);
    await page.locator(".demo-pick-card").nth(0).click();
    await expect(page.locator(".demo-back")).toBeVisible();
    // 保留旧 shop live 读取的 Promise：即使取消后仍可人为交付迟到的帧。
    await page.evaluate(() => {
      type ReadResult = ReadableStreamReadResult<Uint8Array>;
      type OldLiveState = {
        readStarted: boolean;
        cancelled: boolean;
        shopRenderCalls: number;
        resolveRead?: (result: ReadResult) => void;
      };
      const tracked = window as typeof window & { __oldLive?: OldLiveState };
      const state: OldLiveState = { readStarted: false, cancelled: false, shopRenderCalls: 0 };
      tracked.__oldLive = state;
      const original = window.fetch;
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/ai-render/shop-hero")) state.shopRenderCalls++;
        if (url.includes("/ai-invalidate?slot=shop-hero")) {
          const reader = {
            read: () => new Promise<ReadResult>((resolve) => {
              state.readStarted = true;
              state.resolveRead = resolve;
            }),
            cancel: () => { state.cancelled = true; return Promise.resolve(); },
          };
          return Promise.resolve({ ok: true, body: { getReader: () => reader } } as Response);
        }
        return original(input, init);
      }) as typeof fetch;
    });
    await page.locator(".demo-step.active .demo-action").click();
    await expect(page.locator('ai-slot[name="shop-hero"]')).toHaveAttribute("live", "");
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __oldLive?: { readStarted: boolean } }).__oldLive?.readStarted,
    )).toBe(true);

    await page.locator(".demo-back").click();
    await page.locator(".demo-pick-card").nth(1).click();
    await page.locator(".demo-step.active .demo-action").click();
    await expect(page.locator('ai-slot[name="hotel-hero"] .hero-title')).toHaveText(
      "Wake up to West Lake, Broken Bridge at dawn",
    );
    await expect(page.locator('ai-slot[name="shop-hero"]')).toHaveCount(0);
    const before = await page.evaluate(() =>
      (window as typeof window & { __oldLive?: { shopRenderCalls: number } }).__oldLive!.shopRenderCalls,
    );
    const cancelled = await page.evaluate(() => {
      const old = (window as typeof window & {
        __oldLive?: { cancelled: boolean; resolveRead?: (value: ReadableStreamReadResult<Uint8Array>) => void };
      }).__oldLive!;
      old.resolveRead?.({
        done: false,
        value: new TextEncoder().encode('event: invalidate\ndata: {"slot":"shop-hero"}\n\n'),
      });
      return old.cancelled;
    });
    expect(cancelled).toBe(true);
    // 新行业的 live 更新是同步屏障：旧帧有机会执行后，旧槽位不能再发起加载。
    await page.locator(".demo-step.active .demo-action").click();
    await expect(page.locator('ai-slot[name="hotel-hero"] .hero-subtitle')).toHaveText(
      "$115/night · midweek special, 20 rooms",
    );
    await expect(page.locator('ai-slot[name="shop-hero"]')).toHaveCount(0);
    expect(await page.evaluate(() =>
      (window as typeof window & { __oldLive?: { shopRenderCalls: number } }).__oldLive!.shopRenderCalls,
    )).toBe(before);
  } finally {
    await page.close();
    server.kill();
  }
});
