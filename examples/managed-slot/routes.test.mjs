import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorize, createOperations, openFileStore } from '@ai-slot/operations';
import { createApp } from './routes.mjs';
import { createEnvironment } from './config.mjs';

const origin = 'http://127.0.0.1:4194';
const owner = { id: 'owner', grants: { hero: ['read', 'draft', 'approve', 'publish', 'rollback'] } };
const agent = { id: 'agent', grants: { hero: ['read', 'draft', 'publish', 'rollback'] } };
const tokens = new Map([['owner-test', owner], ['agent-test', agent]]);
function request(path, body, token = 'agent-test', method = 'POST', headers = {}) {
  return new Request(`${origin}${path}`, { method, headers: {
    host: '127.0.0.1:4194',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers,
  }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}

test('私有路由要求令牌且方法、路径固定', async () => {
  const app = createApp({ listSlots: async () => ['hero'] }, tokens);
  assert.equal((await app(request('/ops/list', {}, null))).status, 401);
  assert.equal((await app(request('/ops/list', undefined, 'agent-test', 'GET'))).status, 405);
  assert.equal((await app(request('/ops/missing', {}))).status, 404);
});

test('身份来自令牌，正文不能升级权限', async () => {
  const fakeOps = { approveDraft: async actor => { authorize(actor, 'hero', 'approve'); return {}; } };
  const app = createApp(fakeOps, tokens);
  const upgraded = await app(request('/ops/approve', { principal: { id: 'owner' }, draftId: 'd', artifactHash: '0'.repeat(64), expiresAt: 5000 }));
  assert.equal(upgraded.status, 400);
  const denied = await app(request('/ops/approve', { draftId: 'd', artifactHash: '0'.repeat(64), expiresAt: 5000 }));
  assert.equal(denied.status, 403);
});

test('拒绝跨源、伪造Host和超大正文', async () => {
  const app = createApp({ listSlots: async () => [] }, tokens);
  assert.equal((await app(request('/ops/list', {}, 'agent-test', 'POST', { origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await app(request('/ops/list', {}, 'agent-test', 'POST', { host: 'attacker.example' }))).status, 403);
  assert.equal((await app(request('/ops/list', ' '.repeat(65537)))).status, 413);
});

test('公开端点不泄露草稿，错误按契约映射', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'managed-slot-test-'));
  const store = await openFileStore(directory);
  try {
    const env = createEnvironment({ readSource: async () => ({ id: 'cms', version: 's1', expiresAt: Date.now() + 100000, data: { price: '¥99' } }), notify: () => {} });
    const ops = createOperations(store, env);
    const app = createApp(ops, tokens, { registry: env.registry, policy: env.policies.hero });
    const draft = await app(request('/ops/draft', { slotId: 'hero', tree: { component: 'card', props: { title: '测试', price: '¥99', link: 'https://example.com/' } }, baseRevision: 0, sourceVersion: 's1' }));
    assert.equal(draft.status, 200);
    assert.equal((await app(new Request(`${origin}/ai-render/hero`, { headers: { host: '127.0.0.1:4194' } }))).status, 503);
    assert.equal((await app(new Request(`${origin}/ops/read`, { headers: { host: '127.0.0.1:4194' } }))).status, 405);
    const registry = await (await app(new Request(`${origin}/registry.json`, { headers: { host: '127.0.0.1:4194' } }))).text();
    assert.doesNotMatch(registry, /draft|token|lockedProps/);
    assert.equal((await app(request('/ops/draft', { slotId: 'hero', tree: {}, baseRevision: 9, sourceVersion: 's1' }))).status, 409);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('真实 Operations 经管理路由批准发布后才公开投递', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'managed-slot-publish-'));
  const store = await openFileStore(directory);
  try {
    const source = { id: 'cms', version: 's1', expiresAt: Date.now() + 100000, data: { price: '¥99' } };
    const env = createEnvironment({ readSource: async () => source, notify: () => {} });
    const app = createApp(createOperations(store, env), tokens, { registry: env.registry, policy: env.policies.hero });
    const tree = { component: 'card', props: { title: '已发布', price: '¥99', link: 'https://example.com/' } };
    const draftResponse = await app(request('/ops/draft', { slotId: 'hero', tree, baseRevision: 0, sourceVersion: 's1' }));
    assert.equal(draftResponse.status, 200);
    const draft = await draftResponse.json();
    const approval = await app(request('/ops/approve', { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: Date.now() + 60000 }, 'owner-test'));
    assert.equal(approval.status, 200);
    const publish = await app(request('/ops/publish', { draftId: draft.id, artifactHash: draft.artifactHash, expectedRevision: 0, idempotencyKey: 'first' }));
    assert.equal(publish.status, 200);
    const delivered = await app(new Request(`${origin}/ai-render/hero`, { headers: { host: '127.0.0.1:4194' } }));
    assert.equal(delivered.status, 200);
    assert.equal((await delivered.json()).tree.props.title, '已发布');
    const status = await app(request('/ops/status', { slotId: 'hero' }));
    assert.deepEqual(await status.json(), { desiredRevision: 1, readableRevision: 1, browserObservation: null });
    source.expiresAt = Date.now() - 1;
    assert.equal((await app(new Request(`${origin}/ai-render/hero`, { headers: { host: '127.0.0.1:4194' } }))).status, 503);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('来源错误分别映射503与400', async () => {
  for (const [readSource, expected] of [
    [async () => { throw new Error('offline'); }, 503],
    [async () => ({ wrong: 'shape' }), 400],
  ]) {
    const directory = await mkdtemp(join(tmpdir(), 'managed-slot-source-'));
    const store = await openFileStore(directory);
    try {
      const env = createEnvironment({ readSource });
      const app = createApp(createOperations(store, env), tokens);
      const res = await app(request('/ops/draft', { slotId: 'hero', tree: { component: 'card', props: { title: '测试', price: '¥99', link: 'https://example.com/' } }, baseRevision: 0, sourceVersion: 's1' }));
      assert.equal(res.status, expected);
    } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
  }
});

test('Node SSE立即握手，停止时关闭活跃连接和Store', async () => {
  const { startServer } = await import('./server.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'managed-slot-server-'));
  assert.rejects(() => startServer({}), /管理令牌/);
  const running = await startServer({ AI_SLOT_DATA_DIR: directory, AI_SLOT_OWNER_TOKEN: 'o'.repeat(64), AI_SLOT_AGENT_TOKEN: 'a'.repeat(64) });
  try {
    const response = await fetch(`${origin}/ai-invalidate?slot=hero`, { signal: AbortSignal.timeout(1500) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    assert.equal(running.channel.subscriberCount('hero'), 1);
    const frame = response.body.getReader().read();
    running.channel.invalidate('hero');
    assert.match(new TextDecoder().decode((await frame).value), /event: invalidate/);
    const extra = Array.from({ length: 63 }, () => running.channel.handler(new Request(`${origin}/ai-invalidate?slot=hero`)));
    assert.ok(extra.every(item => item.status === 200));
    assert.equal(running.channel.handler(new Request(`${origin}/ai-invalidate?slot=hero`)).status, 503);
    await Promise.all(extra.map(item => item.body.cancel()));
    const slow = running.channel.handler(new Request(`${origin}/ai-invalidate?slot=hero`));
    assert.equal(slow.status, 200);
    running.channel.invalidate('hero');
    running.channel.invalidate('hero');
    assert.equal(running.channel.subscriberCount('hero'), 1); // HTTP 订阅仍活跃，慢流已清理
    const slowReader = slow.body.getReader();
    assert.match(new TextDecoder().decode((await slowReader.read()).value), /event: invalidate/);
    assert.equal((await slowReader.read()).done, true);
    const { request: nodeRequest } = await import('node:http');
    const traversalStatus = await new Promise((resolve, reject) => {
      nodeRequest({ host: '127.0.0.1', port: 4194, path: '/%2e%2e/source.json' }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject).end();
    });
    assert.equal(traversalStatus, 400);
    const { createConnection } = await import('node:net');
    const noHostStatus = await new Promise((resolve, reject) => {
      const socket = createConnection(4194, '127.0.0.1');
      let raw = '';
      socket.on('connect', () => socket.write(`POST /ops/list HTTP/1.0\r\nAuthorization: Bearer ${'a'.repeat(64)}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`));
      socket.on('data', chunk => { raw += chunk.toString(); if (raw.includes('\r\n')) { socket.destroy(); resolve(Number(raw.match(/^HTTP\/1\.[01] (\d+)/)?.[1])); } });
      socket.on('error', reject);
    });
    assert.equal(noHostStatus, 403);
  } finally {
    await running.close();
    await rm(directory, { recursive: true, force: true });
  }
});


test('无Host的私有请求不能由URL补成可信Host', async () => {
  const app = createApp({ listSlots: async () => ['hero'] }, tokens);
  const noHost = new Request(`${origin}/ops/list`, { method: 'POST', headers: { authorization: 'Bearer agent-test', 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await app(noHost)).status, 403);
});

test('CMS 来源供草稿、发布和交付共同读取，事实变化使旧草稿失效', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'managed-slot-cms-'));
  const store = await openFileStore(directory);
  let title = '活动A';
  let calls = 0;
  const expiresAt = Date.now() + 600_000;
  const fetchImpl = async () => {
    calls++;
    return Response.json({ id: 'campaign-12', title, price: '¥99', link: 'https://example.com/', expiresAt });
  };
  try {
    const env = createEnvironment({ cmsUrl: 'https://cms.example.com/wp-json/ai-slot/v1/campaign/12', fetchImpl });
    assert.equal(env.policies.hero.sourceId, 'campaign-12');
    const app = createApp(createOperations(store, env), tokens, { registry: env.registry, policy: env.policies.hero });
    const source = await env.readSource();
    const tree = { component: 'card', props: { title: '活动A', price: '¥99', link: 'https://example.com/' } };
    const draftResponse = await app(request('/ops/draft', { slotId: 'hero', tree, baseRevision: 0, sourceVersion: source.version }));
    assert.equal(draftResponse.status, 200);
    const draft = await draftResponse.json();
    const approval = await app(request('/ops/approve', { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: Date.now() + 60_000 }, 'owner-test'));
    assert.equal(approval.status, 200);
    title = '活动B';
    assert.equal((await app(request('/ops/publish', { draftId: draft.id, artifactHash: draft.artifactHash, expectedRevision: 0, idempotencyKey: 'cms-one' }))).status, 409);
    title = '活动A';
    assert.equal((await app(request('/ops/publish', { draftId: draft.id, artifactHash: draft.artifactHash, expectedRevision: 0, idempotencyKey: 'cms-two' }))).status, 200);
    assert.equal((await app(request('/ai-render/hero', undefined, null, 'GET'))).status, 200);
    title = '活动B';
    assert.equal((await app(request('/ai-render/hero', undefined, null, 'GET'))).status, 503);
    assert.ok(calls >= 5);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('显式宿主 Origin 只获公开 registry 与交付 CORS，私有路由仍拒绝', async () => {
  const hostOrigin = 'https://127.0.0.1:18882';
  const app = createApp({ deliver: async () => Response.json({ tree: null }) }, tokens, {
    registry: { components: {} }, policy: { registryVersion: 'r1', rendererVersion: 'v1', allowedOrigins: [] },
    publicOrigins: [hostOrigin],
  });
  const publicRequest = path => request(path, undefined, null, 'GET', { origin: hostOrigin });
  for (const path of ['/registry.json', '/ai-render/hero']) {
    const response = await app(publicRequest(path));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), hostOrigin);
    assert.equal(response.headers.get('vary'), 'Origin');
  }
  const privateResponse = await app(request('/ops/list', {}, 'agent-test', 'POST', { origin: hostOrigin }));
  assert.equal(privateResponse.status, 403);
  assert.equal(privateResponse.headers.get('access-control-allow-origin'), null);
  assert.equal((await app(request('/registry.json', undefined, null, 'GET', { origin: 'https://attacker.example' }))).status, 403);
});
