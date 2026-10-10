import { afterEach, expect, test, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
// 示例项目保持原生 ESM，测试直接调用其真实路由。
// @ts-expect-error 示例未提供 TypeScript 声明。
import { createApp } from '../../../examples/managed-slot/routes.mjs';
// @ts-expect-error 示例未提供 TypeScript 声明。
import { createEnvironment } from '../../../examples/managed-slot/config.mjs';
import { createOperations, openFileStore } from '@ai-slot/operations';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManagementClient, createManagementServer } from './index.js';

const baseUrl = 'http://127.0.0.1:4194';
const owner = { id: 'owner', grants: { hero: ['read', 'draft', 'approve', 'publish', 'rollback'] } };
const agent = { id: 'agent', grants: { hero: ['read', 'draft', 'publish', 'rollback'] } };
const card = (title: string) => ({ component: 'card', props: { title, price: '¥99', link: 'https://example.com/' } });

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ai-slot-mcp-'));
  const store = await openFileStore(directory);
  const source = { id: 'cms', version: 's1', expiresAt: Date.now() + 100000, data: { price: '¥99' } };
  const env = createEnvironment({ readSource: async () => source });
  const app = createApp(createOperations(store, env), new Map([['owner-test', owner], ['agent-test', agent]]));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url, init) => {
    const request = new Request(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), host: '127.0.0.1:4194' } });
    return app(request);
  }) as typeof fetch;
  const server = createManagementServer(createManagementClient({ baseUrl, token: 'agent-test' }));
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, app, async cleanup() { await client.close(); await server.close(); globalThis.fetch = originalFetch; await store.close(); await rm(directory, { recursive: true, force: true }); } };
}

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); cleanup = undefined; });

function value(result: Awaited<ReturnType<Client['callTool']>>) {
  return JSON.parse(((result as { content: Array<{ text: string }> }).content[0]).text);
}
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

test('工具列表恰好七个，参数严格且权限限制到已有 scope', async () => {
  const f = await fixture(); cleanup = f.cleanup;
  const tools = (await f.client.listTools()).tools;
  expect(tools.map(x => x.name).sort()).toEqual(['create_draft', 'get_status', 'list_slots', 'preview_draft', 'publish_draft', 'read_slot', 'rollback_slot']);
  expect(tools.map(x => x.name).join(' ')).not.toMatch(/approve|policy/);
  expect(value(await call(f.client, 'list_slots'))).toEqual(['hero']);
  expect(value(await call(f.client, 'read_slot', { slotId: 'other' }))).toEqual({ error: 'forbidden' });
  expect((await call(f.client, 'read_slot', { slotId: 'hero', extra: true })).isError).toBe(true);
  expect((await call(f.client, 'rollback_slot', { input: { phase: 'commit', slotId: 'hero' } })).isError).toBe(true);
});

test('草稿经真实路由预览，未经 owner 批准不可发布；批准后幂等返回同一回执', async () => {
  const f = await fixture(); cleanup = f.cleanup;
  const draftResult = await call(f.client, 'create_draft', { slotId: 'hero', tree: card('新品'), baseRevision: 0, sourceVersion: 's1' });
  expect(draftResult.isError).not.toBe(true);
  const draft = value(draftResult);
  expect(value(await call(f.client, 'preview_draft', { draftId: draft.id })).draft.id).toBe(draft.id);
  const input = { draftId: draft.id, artifactHash: draft.artifactHash, expectedRevision: 0, idempotencyKey: 'publish-1' };
  const denied = await call(f.client, 'publish_draft', input);
  expect(denied.isError).toBe(true);
  expect(value(denied)).toEqual({ error: 'approval_required' });
  const approval = await f.app(new Request(`${baseUrl}/ops/approve`, { method: 'POST', headers: { host: '127.0.0.1:4194', authorization: 'Bearer owner-test', 'content-type': 'application/json' }, body: JSON.stringify({ draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: Date.now() + 60000 }) }));
  expect(approval.status).toBe(200);
  const first = await call(f.client, 'publish_draft', input);
  expect(first.isError).not.toBe(true);
  expect(value(await call(f.client, 'publish_draft', input))).toEqual(value(first));
  expect(value(await call(f.client, 'get_status', { slotId: 'hero' })).desiredRevision).toBe(1);
  const prepared = await call(f.client, 'rollback_slot', { input: { phase: 'prepare', slotId: 'hero', targetRevision: 1, expectedRevision: 1 } });
  expect(prepared.isError).not.toBe(true);
  expect(value(prepared).intent).toBe('rollback');
  expect(value(await call(f.client, 'get_status', { slotId: 'hero' })).desiredRevision).toBe(1);
  const rollbackDenied = await call(f.client, 'rollback_slot', { input: { phase: 'commit', draftId: value(prepared).id,
    artifactHash: value(prepared).artifactHash, expectedRevision: 1, idempotencyKey: 'rollback-1' } });
  expect(rollbackDenied.isError).toBe(true);
  expect(value(rollbackDenied)).toEqual({ error: 'approval_required' });
});

test('客户端拒绝非 loopback 地址、重定向和 200 假成功', async () => {
  expect(() => createManagementClient({ baseUrl: 'https://example.com', token: 'x' })).toThrow();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  try {
    await expect(createManagementClient({ baseUrl, token: 'x' }).call('/ops/list', {})).rejects.toMatchObject({ code: 'forbidden' });
    expect(globalThis.fetch).toHaveBeenCalledWith(new URL('/ops/list', baseUrl), expect.objectContaining({ redirect: 'error' }));
  }
  finally { globalThis.fetch = originalFetch; }
});
