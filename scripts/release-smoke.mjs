// 将本文件复制到独立 npm 消费项目执行；仅从已安装包导入，不依赖仓库源码。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderToString } from '@vue/server-renderer';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.com/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'customElements', 'CustomEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
const registryApi = await import('@ai-slot/registry');
const runtime = await import('@ai-slot/runtime');
const proxy = await import('@ai-slot/proxy');
const domAdapter = await import('@ai-slot/adapter-dom');
const reactAdapter = await import('@ai-slot/adapter-react');
const vueAdapter = await import('@ai-slot/adapter-vue');
const a2ui = await import('@ai-slot/a2ui');
const operations = await import('@ai-slot/operations');
const mcp = await import('@ai-slot/mcp');
const registry = registryApi.defineRegistry({ components: { card: { description: '卡片', props: { title: 'string' }, required: ['title'] } } });
const tree = { component: 'card', props: { title: '公开安装验证' } };
const handler = proxy.createRenderHandler({ registry, registryVersion: 'r1', namespace: 'release-smoke', resolveSlot: async slotId => ({ slotId, originalContent: '兜底', contentVersion: 's1' }), provider: { id: 'fixed', produce: () => tree } });
const response = await handler(new Request('https://example.com/ai-render/hero'));
assert.equal(response.status, 200); assert.deepEqual((await response.json()).tree, tree);
assert.equal(typeof runtime.subscribeInvalidation, 'function');
const element = await runtime.renderTree(domAdapter.createDomRenderer({ card: { tag: 'p', applyProps: (el, props) => { el.textContent = props.title; } } }), tree);
assert.equal(element.textContent, tree.props.title);
assert.equal(renderToStaticMarkup(reactAdapter.treeToReact({ card: ({ title }) => React.createElement('p', null, title) }, tree)), '<p>公开安装验证</p>');
assert.equal(await renderToString(vueAdapter.treeToVue({ card: { props: ['title'], template: '<p>{{ title }}</p>' } }, tree)), '<p>公开安装验证</p>');
assert.deepEqual(a2ui.adjacencyToTree([{ id: 'root', component: 'card', title: tree.props.title }]), tree);

const directory = await mkdtemp(join(tmpdir(), 'ai-slot-release-store-'));
let store;
try {
  store = await operations.openFileStore(directory);
  const source = { id: 'cms', version: 's1', expiresAt: Date.now() + 600000, data: {} };
  const env = { registry, policies: { hero: { slotId: 'hero', registryVersion: 'r1', rendererVersion: 'v1', sourceId: 'cms', allowedComponents: ['card'], lockedProps: [], urlProps: [], allowedOrigins: [] } }, readSource: async () => source, now: Date.now, notify: () => {} };
  const owner = { id: 'owner-smoke', grants: { hero: ['read', 'draft', 'approve', 'publish', 'rollback'] } };
  const ops = operations.createOperations(store, env);
  const draft = await ops.createDraft(owner, { slotId: 'hero', tree, baseRevision: 0, sourceVersion: 's1' });
  await ops.approveDraft(owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: Date.now() + 60000 });
  const receipt = await ops.publishDraft(owner, { draftId: draft.id, artifactHash: draft.artifactHash, expectedRevision: 0, idempotencyKey: 'release-smoke' });
  assert.equal(receipt.revision, 1);
  await store.close(); store = await operations.openFileStore(directory);
  const delivered = await operations.createOperations(store, env).deliver('hero');
  assert.equal(delivered.status, 200); assert.deepEqual((await delivered.json()).tree, tree);
} finally { if (store) await store.close(); await rm(directory, { recursive: true, force: true }); }

assert.equal(typeof mcp.createManagementClient, 'function');
const command = resolve('node_modules/.bin/ai-slot-management-mcp');
const missing = spawnSync(process.execPath, [command], { env: { ...process.env, AI_SLOT_AGENT_TOKEN: '' }, encoding: 'utf8', timeout: 5000 });
assert.equal(missing.status, 1); assert.match(missing.stderr, /AI_SLOT_AGENT_TOKEN 缺失/);
const client = new Client({ name: 'release-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [command], env: { PATH: process.env.PATH, AI_SLOT_AGENT_TOKEN: 'synthetic-release-smoke' }, stderr: 'pipe' });
try {
  await client.connect(transport);
  assert.equal(client.getServerVersion().version, '0.1.0');
  const { tools } = await client.listTools();
  assert.equal(tools.length, 7); assert.ok(!tools.some(tool => /approve/.test(tool.name)));
} finally { await client.close(); dom.window.close(); }
console.log('九包独立消费通过：数据交付、DOM/React/Vue/A2UI、存储重启发布、真实npm符号链接stdio发现7工具');
