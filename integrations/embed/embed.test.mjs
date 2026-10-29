import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { chromium } from '@playwright/test';

// 真浏览器加载构建包：覆盖「成功渲染」「失败静默回退」「诊断不泄露」三条核心契约。
// 参照 examples/cms-campaign-slot/embed.test.mjs 的录制回放模式，不依赖真实 API。

const PAGE = (slotAttrs, fallback) => `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <ai-slot name="hero" src="https://slot.example.test/ai-render/hero" ${slotAttrs}>${fallback}</ai-slot>
  <script type="module" src="/ai-slot-embed.js"></script></body></html>`;

const VALID_TREE = {
  version: 1,
  slot: 'hero',
  tree: { component: 'hero-banner', props: { title: 'AI 生成标题', subtitle: 'AI 生成副标题' } },
};

async function openPage(browser, handler) {
  const script = await readFile(new URL('./assets/ai-slot-embed.js', import.meta.url));
  const page = await browser.newPage();
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.route('https://slot.example.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: handler.body });
    if (path === '/ai-slot-embed.js') return route.fulfill({ contentType: 'text/javascript', body: script });
    return handler.respond(route, path);
  });
  await page.goto('https://slot.example.test/');
  return { page, warnings };
}

const slotText = page => page.locator('ai-slot').textContent();

describe('ai-slot 通用嵌入包', () => {
  it('合法组件树渲染起步组件并替换兜底内容', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const { page } = await openPage(browser, {
        body: PAGE('', '<p>原始兜底</p>'),
        respond: route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(VALID_TREE) }),
      });
      await expect.poll(() => page.locator('ai-slot .ai-slot-hero-title').textContent(), { timeout: 10_000 })
        .toBe('AI 生成标题');
      expect(await page.locator('ai-slot .ai-slot-hero-subtitle').textContent()).toBe('AI 生成副标题');
      expect(await slotText(page)).not.toContain('原始兜底');
    } finally { await browser.close(); }
  }, 30_000);

  it('未注册组件名被校验丢弃并保留兜底内容', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const forged = { version: 1, slot: 'hero', tree: { component: 'script-tag', props: { title: '伪造组件' } } };
      const { page, warnings } = await openPage(browser, {
        body: PAGE('', '<p>原始兜底</p>'),
        respond: route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(forged) }),
      });
      await expect.poll(() => warnings.length, { timeout: 10_000 }).toBe(1);
      await expect.poll(slotText.bind(null, page)).toContain('原始兜底');
      expect(warnings[0]).toBe('[ai-slot] 槽位内容暂不可用，已保留原始内容');
    } finally { await browser.close(); }
  }, 30_000);

  it('交付端点失败时保留兜底，诊断文案不泄露 URL 与响应内容', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const { page, warnings } = await openPage(browser, {
        body: PAGE('fresh-only', '<p>原始兜底</p>'),
        respond: route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'SECRET_UPSTREAM_DETAIL' }),
      });
      await expect.poll(() => warnings.length, { timeout: 10_000 }).toBeGreaterThan(0);
      await expect.poll(slotText.bind(null, page)).toContain('原始兜底');
      for (const text of warnings) {
        expect(text).not.toMatch(/SECRET_UPSTREAM_DETAIL|slot\.example\.test/);
      }
    } finally { await browser.close(); }
  }, 30_000);

  it('cta-banner 拒绝 javascript: 协议链接并静默回退兜底', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const evil = { version: 1, slot: 'hero', tree: { component: 'cta-banner', props: { title: '点击', buttonText: 'GO', link: 'javascript:alert(1)' } } };
      const { page, warnings } = await openPage(browser, {
        body: PAGE('', '<p>原始兜底</p>'),
        respond: route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(evil) }),
      });
      // 渲染期拒绝属静默回退（不向用户报错）：等待渲染窗口后断言
      await page.waitForTimeout(1500);
      expect(await slotText(page)).toContain('原始兜底');
      expect(await page.locator('ai-slot a').count()).toBe(0);
      expect(await page.locator('ai-slot .ai-slot-cta').count()).toBe(0);
      expect(warnings).toHaveLength(0);
    } finally { await browser.close(); }
  }, 30_000);
});
