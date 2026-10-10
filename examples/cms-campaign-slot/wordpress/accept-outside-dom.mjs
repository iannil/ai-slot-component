import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// 同一真实 WordPress 文档内门控插件模块：先拍原壳，再放行增强，精确比较授权槽位外 DOM。
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
let releaseScript;
const gate = new Promise(resolve => { releaseScript = resolve; });
await page.route('**/wp-content/plugins/ai-slot-campaign/assets/ai-slot.js', async route => {
  await gate;
  await route.continue();
});
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
async function outsideSnapshot(captureReferences = false) {
  return page.evaluate((capture) => {
    const authorized = document.querySelector('[data-ai-slot-endpoint], ai-slot');
    if (!authorized) throw new Error('authorized_slot_missing');
    if (capture) {
      const records = [];
      const collect = (node, path) => {
        if (node instanceof Element && (node.matches('[data-ai-slot-endpoint], ai-slot') ||
          node.matches('script[src*="/ai-slot.js"]'))) return;
        records.push({ node, path });
        [...node.childNodes].forEach((child, index) => collect(child, [...path, index]));
      };
      collect(document.body, []);
      window.__aiSlotOutsideNodePaths = records;
    }
    const records = window.__aiSlotOutsideNodePaths ?? [];
    const atOriginalPath = ({ node, path }) => path.reduce(
      (current, index) => current?.childNodes[index], document.body) === node;
    const clone = document.body.cloneNode(true);
    for (const slot of clone.querySelectorAll('[data-ai-slot-endpoint], ai-slot')) {
      slot.replaceWith(document.createComment('authorized-ai-slot-content'));
    }
    for (const script of clone.querySelectorAll('script[src*="/ai-slot.js"]')) {
      script.replaceWith(document.createComment('authorized-ai-slot-script'));
    }
    return { html: clone.outerHTML, outsideNodeCount: records.length,
      originalOutsideNodesConnected: records.filter(({ node }) => node.isConnected).length,
      originalOutsideNodesAtOriginalPaths: records.filter(atOriginalPath).length,
      slotTag: authorized.tagName, slotText: authorized.textContent.trim() };
  }, captureReferences);
}
try {
  await page.goto('https://127.0.0.1:18882/?page_id=4', { waitUntil: 'commit' });
  await page.locator('[data-ai-slot-endpoint]').waitFor();
  await page.waitForTimeout(500); // 让 WordPress 自身脚本完成初始化，插件模块仍被门控。
  const before = await outsideSnapshot(true);
  assert.equal(before.slotTag, 'DIV');
  releaseScript();
  await page.locator('ai-slot article').waitFor();
  const after = await outsideSnapshot();
  assert.equal(after.slotTag, 'AI-SLOT');
  assert.equal(after.originalOutsideNodesConnected, before.outsideNodeCount);
  assert.equal(after.originalOutsideNodesAtOriginalPaths, before.outsideNodeCount,
    '增强前槽位外节点在原始 DOM 路径上不是同一节点引用');
  assert.ok(after.html === before.html, `授权内容区域外 body DOM 不一致：${sha256(before.html)} / ${sha256(after.html)}`);
  const relocationControl = await page.evaluate(() => {
    const record = window.__aiSlotOutsideNodePaths.find(({ node }) =>
      node instanceof HTMLAnchorElement);
    if (!record) throw new Error('outside_anchor_missing');
    const replacement = record.node.cloneNode(true);
    record.node.replaceWith(replacement);
    document.querySelector('ai-slot').append(record.node); // 原节点仍连接，原位置为同 HTML 的新节点。
    const atOriginalPathWhileMoved = record.path.reduce(
      (current, index) => current?.childNodes[index], document.body) === record.node;
    const connectedWhileMoved = record.node.isConnected;
    replacement.replaceWith(record.node);
    const restoredAtOriginalPath = record.path.reduce(
      (current, index) => current?.childNodes[index], document.body) === record.node;
    return { connectedWhileMoved, atOriginalPathWhileMoved, restoredAtOriginalPath };
  });
  assert.deepEqual(relocationControl, {
    connectedWhileMoved: true, atOriginalPathWhileMoved: false, restoredAtOriginalPath: true,
  });
  const evidence = {
    url: page.url(),
    method: '同一 WordPress 文档门控插件模块；对 body 克隆后将授权槽位与插件 script 替换为固定注释，再比较完整 outerHTML；另外按从 body 开始的 childNodes 索引路径，逐一核对增强前每个槽位外原始 Node 引用仍位于原位置',
    exclusions: ['[data-ai-slot-endpoint], ai-slot（含其子树）', 'script[src*="/ai-slot.js"]'],
    before: { slotTag: before.slotTag, slotText: before.slotText,
      outsideDomBytes: Buffer.byteLength(before.html), outsideDomSha256: sha256(before.html),
      outsideNodeCount: before.outsideNodeCount },
    after: { slotTag: after.slotTag, slotText: after.slotText,
      outsideDomBytes: Buffer.byteLength(after.html), outsideDomSha256: sha256(after.html),
      originalOutsideNodesConnected: after.originalOutsideNodesConnected,
      originalOutsideNodesAtOriginalPaths: after.originalOutsideNodesAtOriginalPaths },
    exactOutsideDomMatch: true,
    relocationNegativeControl: relocationControl,
  };
  await writeFile(new URL('../../../docs/validation/assets/cms-campaign/outside-dom-before-after.json', import.meta.url),
    JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally {
  releaseScript();
  await browser.close();
}
