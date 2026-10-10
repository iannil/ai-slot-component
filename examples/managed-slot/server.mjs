import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createInvalidationChannel } from '@ai-slot/proxy';
import { createOperations, openFileStore } from '@ai-slot/operations';
import { tokensFromEnv } from './auth.mjs';
import { createEnvironment, policy, registry } from './config.mjs';
import { createApp } from './routes.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/', join(root, 'public/index.html')],
  ['/index.html', join(root, 'public/index.html')],
  ['/admin.html', join(root, 'public/admin.html')],
  ['/admin.mjs', join(root, 'public/admin.mjs')],
  ['/components.mjs', join(root, 'public/components.mjs')],
  ['/registry.mjs', join(root, 'public/registry.mjs')],
  ['/vendor/registry/index.js', fileURLToPath(new URL('../../packages/registry/dist/index.js', import.meta.url))],
  ['/vendor/runtime/index.js', fileURLToPath(new URL('../../packages/runtime/dist/index.js', import.meta.url))],
  ['/vendor/adapter-dom/index.js', fileURLToPath(new URL('../../packages/adapter-dom/dist/index.js', import.meta.url))],
]);
const allowedHosts = new Set(['127.0.0.1:4194', 'localhost:4194']);
const mime = path => path.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8';

function isTraversal(rawUrl) {
  try {
    const path = decodeURIComponent(rawUrl.split('?')[0]);
    return path.includes('\\') || path.split('/').includes('..') || path.includes('\0');
  } catch { return true; }
}
function toRequest(req) {
  const host = req.headers.host;
  const url = new URL(req.url ?? '/', `http://${host}`);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, { method: req.method, headers: req.headers,
    ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
}
async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.headers.get('content-type')?.startsWith('text/event-stream')) res.flushHeaders();
  if (response.body) {
    const reader = response.body.getReader();
    res.on('close', () => void reader.cancel().catch(() => {}));
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(value)) await new Promise(resolve => { res.once('drain', resolve); res.once('close', resolve); });
      }
    } catch { /* 客户端断开时清理 SSE 订阅。 */ }
  }
  res.end();
}

export async function startServer(envVars = process.env) {
  const tokens = tokensFromEnv(envVars);
  const directory = envVars.AI_SLOT_DATA_DIR ?? join(homedir(), '.cache', 'ai-slot', 'managed-slot');
  const channel = createInvalidationChannel({ maxSubscribers: 64, maxQueuedFrames: 1 });
  const env = createEnvironment({
    sourceFile: envVars.AI_SLOT_SOURCE_FILE ?? join(root, 'source.json'),
    notify: slotId => channel.invalidate(slotId),
  });
  const store = await openFileStore(directory);
  const app = createApp(createOperations(store, env), tokens, { registry, policy, invalidation: channel });
  const server = createServer(async (req, res) => {
    try {
      if (!allowedHosts.has(req.headers.host)) { res.writeHead(403).end(); return; }
      if (isTraversal(req.url ?? '/')) {
        res.writeHead(400).end('bad path');
        return;
      }
      const path = new URL(req.url ?? '/', 'http://127.0.0.1:4194').pathname;
      if (files.has(path)) {
        if (req.method !== 'GET') { res.writeHead(405).end(); return; }
        // 固定文件也只接受本机 Host；静态页不承载 CORS。
        try {
          const bytes = await readFile(files.get(path));
          res.writeHead(200, { 'content-type': mime(path), 'cache-control': 'no-store' }).end(bytes);
        } catch { res.writeHead(404).end('not found'); }
        return;
      }
      await send(res, await app(toRequest(req)));
    } catch {
      if (!res.headersSent) res.writeHead(500).end('internal error');
      else res.destroy();
    }
  });
  const close = async () => {
    const stopped = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await stopped;
    await store.close();
  };
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(4194, '127.0.0.1', resolve);
    });
  } catch (error) { await store.close(); throw error; }
  return { server, store, channel, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const running = await startServer();
    process.stdout.write('管理示例: http://127.0.0.1:4194\n');
    let closing = false;
    const stop = () => {
      if (closing) return;
      closing = true;
      void running.close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : '启动失败'}\n`);
    process.exitCode = 1;
  }
}
