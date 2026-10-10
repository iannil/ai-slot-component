import { randomUUID } from 'node:crypto';
import { OperationError } from '@ai-slot/operations';

const MAX_BODY = 65_536;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const allowedHosts = new Set(['127.0.0.1:4194', 'localhost:4194']);
const specifications = {
  '/ops/list': [],
  '/ops/read': ['slotId'],
  '/ops/draft': ['slotId', 'tree', 'baseRevision', 'sourceVersion'],
  '/ops/preview': ['draftId'],
  '/ops/approve': ['draftId', 'artifactHash', 'expiresAt'],
  '/ops/publish': ['draftId', 'artifactHash', 'expectedRevision', 'idempotencyKey'],
  '/ops/rollback/prepare': ['slotId', 'targetRevision', 'expectedRevision'],
  '/ops/rollback/commit': ['draftId', 'artifactHash', 'expectedRevision', 'idempotencyKey'],
  '/ops/status': ['slotId'],
};
const stringFields = new Set(['slotId', 'sourceVersion', 'draftId', 'artifactHash', 'idempotencyKey']);
const revisionFields = new Set(['baseRevision', 'targetRevision', 'expectedRevision']);

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}
function statusFor(code) {
  if (code === 'forbidden') return 403;
  if (['not_found', 'draft_not_found'].includes(code)) return 404;
  if (['conflict', 'revision_conflict', 'hash_mismatch', 'idempotency_conflict', 'source_changed'].includes(code)) return 409;
  if (['source_unavailable', 'commit_unknown'].includes(code)) return 503;
  return 400;
}
async function parseBody(request, path) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new OperationError('invalid_input');
  let length = 0;
  const chunks = [];
  if (request.body) {
    const reader = request.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BODY) throw new OperationError('body_too_large');
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  let input;
  try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new OperationError('invalid_input'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new OperationError('invalid_input');
  const keys = specifications[path];
  if (Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key))) throw new OperationError('invalid_input');
  for (const key of keys) {
    const value = input[key];
    if (stringFields.has(key) && (typeof value !== 'string' || value.length === 0)) throw new OperationError('invalid_input');
    if (revisionFields.has(key) && (!Number.isSafeInteger(value) || value < (key === 'targetRevision' ? 1 : 0))) throw new OperationError('invalid_input');
    if (key === 'expiresAt' && (typeof value !== 'number' || !Number.isFinite(value))) throw new OperationError('invalid_input');
    if (key === 'tree' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new OperationError('invalid_input');
  }
  return Object.fromEntries(keys.map(key => [key, input[key]]));
}
function actorFor(request, tokens) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ') || header.length <= 7) return null;
  return tokens.get(header.slice(7)) ?? null;
}
function safeRequestUrl(request, publicOrigins) {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (url.protocol !== 'http:' || !allowedHosts.has(url.host) || !allowedHosts.has(host) || host !== url.host) throw new OperationError('forbidden');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin && !(publicOrigins.has(origin) && ['/registry.json', '/ai-render/hero'].includes(url.pathname))) throw new OperationError('forbidden');
  return url;
}

/** 固定路由表；Operations 是唯一状态入口，管理身份不进入公开响应。 */
export function createApp(ops, tokens, { registry, policy, invalidation, publicOrigins = [] } = {}) {
  const allowedPublicOrigins = new Set(publicOrigins);
  const withPublicCors = (response, request, path) => {
    const origin = request.headers.get('origin');
    if (!origin || !allowedPublicOrigins.has(origin) || !['/registry.json', '/ai-render/hero'].includes(path)) return response;
    const headers = new Headers(response.headers);
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
  };
  const actions = {
    '/ops/list': actor => ops.listSlots(actor),
    '/ops/read': (actor, x) => ops.readSlot(actor, x.slotId),
    '/ops/draft': (actor, x) => ops.createDraft(actor, x),
    '/ops/preview': (actor, x) => ops.previewDraft(actor, x.draftId),
    '/ops/approve': (actor, x) => ops.approveDraft(actor, x),
    '/ops/publish': (actor, x) => ops.publishDraft(actor, x),
    '/ops/rollback/prepare': (actor, x) => ops.prepareRollback(actor, x),
    '/ops/rollback/commit': (actor, x) => ops.rollbackSlot(actor, x),
    '/ops/status': (actor, x) => ops.getStatus(actor, x.slotId),
  };
  return async request => {
    const requestId = randomUUID();
    try {
      const url = safeRequestUrl(request, allowedPublicOrigins);
      if (Object.hasOwn(specifications, url.pathname)) {
        if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
        if (url.search) return json({ error: 'invalid_input' }, 400);
        const actor = actorFor(request, tokens);
        if (!actor) return json({ error: 'unauthorized' }, 401);
        const input = await parseBody(request, url.pathname);
        return json(await actions[url.pathname](actor, input));
      }
      if (url.pathname === '/registry.json') {
        if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
        if (url.search) return json({ error: 'invalid_input' }, 400);
        return withPublicCors(json({ registry, registryVersion: policy?.registryVersion, rendererVersion: policy?.rendererVersion, allowedOrigins: policy?.allowedOrigins }), request, url.pathname);
      }
      if (url.pathname === '/ai-render/hero') {
        if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
        if (url.search) return json({ error: 'invalid_input' }, 400);
        return withPublicCors(await ops.deliver('hero'), request, url.pathname);
      }
      if (url.pathname === '/ai-invalidate') {
        if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
        if (url.searchParams.size !== 1 || url.searchParams.get('slot') !== 'hero') return json({ error: 'invalid_input' }, 400);
        return invalidation ? invalidation.handler(request) : json({ error: 'not_found' }, 404);
      }
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      if (error instanceof OperationError) return json({ error: error.code }, error.code === 'body_too_large' ? 413 : statusFor(error.code));
      process.stderr.write(JSON.stringify({ code: 'internal_error', requestId }) + '\n');
      return json({ error: 'internal_error', requestId }, 500);
    }
  };
}
