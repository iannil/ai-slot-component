import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const base = 'https://127.0.0.1:18882';
const pageUrl = `${base}/?page_id=4`;
const fallback = '产品介绍暂不可用，请查看原站信息。';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const failures = [];
page.on('pageerror', error => failures.push(error.message));
async function open(pageInstance = page) {
  await pageInstance.goto(pageUrl);
  await pageInstance.locator('ai-slot article').waitFor();
  assert.match(await pageInstance.locator('ai-slot').innerText(), /产品介绍.*¥99.*查看商品/s);
}
try {
  await open();
  const outside = await page.locator('header, footer').count();
  const siteTitle = await page.locator('header .wp-block-site-title').first().innerText();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `横向溢出: ${width}`);
    assert.equal(await page.locator('header, footer').count(), outside);
    assert.equal(await page.locator('header .wp-block-site-title').first().innerText(), siteTitle);
    console.log(`前台 ${width}px: AI 卡片可见，无横向溢出，宿主 header/footer 节点数与站点名稳定`);
  }
  const link = page.locator('ai-slot a');
  assert.equal(await link.getAttribute('href'), 'https://example.com/');
  await link.focus();
  assert.equal(await link.evaluate(el => document.activeElement === el), true);
  console.log('键盘焦点与链接: 通过');

  const editor = await context.newPage();
  await editor.goto(`${base}/wp-login.php`);
  await editor.locator('#user_login').fill('ai_slot_i2_admin');
  await editor.locator('#user_pass').fill(process.env.AI_SLOT_WP_PASSWORD);
  await editor.locator('#wp-submit').click();
  await editor.goto(`${base}/wp-admin/post.php?post=4&action=edit`);
  await editor.locator('.interface-interface-skeleton').waitFor();
  const previewHref = await editor.locator('a[href*="preview=true"]').first().getAttribute('href');
  assert.ok(previewHref);
  const preview = await context.newPage();
  await preview.goto(previewHref);
  await preview.locator('ai-slot article').waitFor();
  console.log('真实 WordPress 区块编辑器与预览: 通过');
  await preview.close();
  await editor.close();

  const scriptBlocked = await context.newPage();
  await scriptBlocked.route('**/wp-content/plugins/ai-slot-campaign/assets/ai-slot.js', route => route.abort());
  await scriptBlocked.goto(pageUrl);
  assert.equal(await scriptBlocked.locator('ai-slot').count(), 0);
  assert.match(await scriptBlocked.locator('[data-ai-slot-endpoint]').innerText(), /产品介绍暂不可用/);
  console.log('脚本阻断: WordPress 原壳兜底可见');
  await scriptBlocked.close();

  const cspBlocked = await context.newPage();
  await cspBlocked.route('**/*', async route => {
    if (!route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "script-src 'none'; connect-src 'none'" } });
  });
  await cspBlocked.goto(page.url());
  assert.equal(await cspBlocked.locator('ai-slot').count(), 0);
  assert.match(await cspBlocked.locator('[data-ai-slot-endpoint]').innerText(), /产品介绍暂不可用/);
  console.log('CSP script/connect 阻断: 原壳兜底可见');
  await cspBlocked.close();

  const deliveryFailed = await context.newPage();
  await deliveryFailed.route('https://127.0.0.1:4195/ai-render/hero', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await deliveryFailed.goto(pageUrl);
  await deliveryFailed.locator('ai-slot').waitFor();
  await deliveryFailed.waitForTimeout(500);
  assert.match(await deliveryFailed.locator('ai-slot').innerText(), /产品介绍暂不可用/);
  console.log('交付 503: fresh-only 兜底可见');
  await deliveryFailed.close();

  const publicRegistry = await page.evaluate(async () => (await fetch('https://127.0.0.1:4195/registry.json')).json());
  const originalShortcode = '[ai_slot_campaign endpoint="https://127.0.0.1:4195/ai-render/hero" registry="https://127.0.0.1:4195/registry.json"]';
  const conflictingShortcode = '[ai_slot_campaign endpoint="https://127.0.0.1:4195/ai-render/hero" registry="https://127.0.0.1:4195/registry-conflict.json"]';
  const setContent = value => execFileSync('docker', ['exec', '-e', `AI_SLOT_WP_CONTENT=${value}`, 'ai-slot-i1-wp', 'php', '-r',
    'require "/var/www/html/wp-load.php"; $p=get_post(4); if (!$p || $p->post_title!=="AI-SLOT接入测试-I1") exit(1); wp_update_post(["ID"=>4,"post_content"=>getenv("AI_SLOT_WP_CONTENT")]);']);
  setContent(`${originalShortcode}\n\n${conflictingShortcode}`);
  try {
    const conflict = await context.newPage();
    await conflict.route('https://127.0.0.1:4195/registry-conflict.json', route => route.fulfill({ status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': base },
      body: JSON.stringify({ ...publicRegistry, registryVersion: 'r2' }) }));
    await conflict.goto(pageUrl);
    await conflict.locator('ai-slot article').waitFor();
    assert.equal(await conflict.locator('ai-slot').count(), 1);
    assert.equal(await conflict.locator('[data-ai-slot-endpoint]').count(), 1);
    assert.match(await conflict.locator('[data-ai-slot-endpoint]').innerText(), /产品介绍暂不可用/);
    console.log('同页 registry 版本冲突: 第二槽位拒绝升级并保留原壳');
    await conflict.close();
  } finally { setContent(originalShortcode); }

  execFileSync('docker', ['pause', 'ai-slot-i1-wp']);
  try {
    await page.locator('ai-slot').evaluate(el => el.load());
    await page.waitForTimeout(8500);
    assert.match(await page.locator('ai-slot').innerText(), /产品介绍暂不可用/);
    console.log('CMS 源断开: 公开交付失效并恢复兜底');
  } finally { execFileSync('docker', ['unpause', 'ai-slot-i1-wp']); }
  await open();
  assert.deepEqual(failures, []);
  console.log('源恢复: AI 卡片重新可见；浏览器脚本错误 0');
} finally {
  await browser.close();
}
