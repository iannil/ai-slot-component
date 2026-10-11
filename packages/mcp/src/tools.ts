import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ManagementClient } from './client.js';
import { ManagementError } from './client.js';

const slotId = z.string().min(1).max(100);
const draftId = z.string().uuid();
const publish = z.object({
  draftId, artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
}).strict();
const rollback = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('prepare'), slotId, targetRevision: z.number().int().positive(), expectedRevision: z.number().int().nonnegative() }).strict(),
  publish.extend({ phase: z.literal('commit') }).strict(),
]);
const draft = z.object({ slotId, tree: z.record(z.string(), z.unknown()), baseRevision: z.number().int().nonnegative(), sourceVersion: z.string().min(1).max(100) }).strict();
const reply = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

function errorCode(error: unknown): string {
  return error instanceof ManagementError ? error.code : 'internal_error';
}

export function createManagementServer(client: ManagementClient): McpServer {
  const server = new McpServer({ name: 'ai-slot-management', version: '0.1.0' });
  async function run(path: string, input: unknown) {
    try { return reply(await client.call(path, input)); }
    catch (error) { return { isError: true, ...reply({ error: errorCode(error) }) }; }
  }
  server.registerTool('list_slots', { description: '列出当前 Agent 有权读取的槽位。', inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true } }, () => run('/ops/list', {}));
  server.registerTool('read_slot', { description: '读取授权槽位的当前指针和草稿。', inputSchema: z.object({ slotId }).strict(), annotations: { readOnlyHint: true } }, ({ slotId }) => run('/ops/read', { slotId }));
  server.registerTool('create_draft', { description: '为授权槽位创建候选草稿，不影响线上内容。', inputSchema: draft }, input => run('/ops/draft', input));
  server.registerTool('preview_draft', { description: '预览候选草稿和上一版本。', inputSchema: z.object({ draftId }).strict(), annotations: { readOnlyHint: true } }, ({ draftId }) => run('/ops/preview', { draftId }));
  server.registerTool('publish_draft', { description: '发布已经由 Owner 人工批准的草稿；服务端重新验证批准和修订。', inputSchema: publish, annotations: { idempotentHint: true } }, input => run('/ops/publish', input));
  server.registerTool('get_status', { description: '读取授权槽位的期望、可读和浏览器观察状态。', inputSchema: z.object({ slotId }).strict(), annotations: { readOnlyHint: true } }, ({ slotId }) => run('/ops/status', { slotId }));
  server.registerTool('rollback_slot', { description: 'prepare 只生成回滚候选，不生效；commit 必须先由 Owner 人工批准该候选。', inputSchema: z.object({ input: rollback }).strict() }, ({ input }) => {
    const { phase, ...fields } = input;
    return run(phase === 'prepare' ? '/ops/rollback/prepare' : '/ops/rollback/commit', fields);
  });
  return server;
}
