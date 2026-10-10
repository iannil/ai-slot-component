import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { chromium } from '@playwright/test';

// 真浏览器加载构建包；畸形公开注册表仍须保留原壳，且控制台不能回显响应片段或 URL。
describe('WordPress 嵌入包诊断', () => {
  it('畸形 registry JSON 不把响应文本或端点 URL 写进控制台', async () => {
    const script = await readFile(new URL('./wordpress/assets/ai-slot.js', import.meta.url));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ ignoreHTTPSErrors: true });
      const warnings = [];
      page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
      await page.route('https://slot.example.test/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"></head><body>
          <div data-ai-slot-endpoint="https://slot.example.test/ai-render/hero?SECRET_URL"
               data-ai-slot-registry="https://slot.example.test/registry.json?SECRET_URL"><h2>原始兜底</h2></div>
          <script type="module" src="/ai-slot.js"></script></body></html>` });
        if (path === '/ai-slot.js') return route.fulfill({ contentType: 'text/javascript', body: script });
        if (path === '/registry.json') return route.fulfill({ contentType: 'application/json', body: '{"data": SECRET_REGISTRY_PAYLOAD}' });
        return route.fulfill({ status: 404 });
      });
      await page.goto('https://slot.example.test/');
      await expect.poll(() => warnings.length).toBe(1);
      expect(await page.locator('[data-ai-slot-endpoint]').count()).toBe(1);
      expect(await page.locator('ai-slot').count()).toBe(0);
      expect(await page.locator('[data-ai-slot-endpoint]').innerText()).toBe('原始兜底');
      expect(warnings[0]).toBe('[ai-slot] 槽位未启用：公开配置不可用或不兼容');
      expect(warnings[0]).not.toMatch(/SECRET_REG|SECRET_URL|slot\.example\.test/);
    } finally { await browser.close(); }
  }, 20_000);
});
