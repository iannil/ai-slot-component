import { startServer } from '../../managed-slot/server.mjs';
import { createEnvironment } from '../../managed-slot/config.mjs';

// 专用本机验收辅助程序：仍通过真实私有草稿→批准→发布路由，不直接改 Store。
const running = await startServer(process.env);
const base = 'http://127.0.0.1:4194';
const token = process.env.AI_SLOT_OWNER_TOKEN;
async function operation(path, body) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: {
    authorization: `Bearer ${token}`, 'content-type': 'application/json',
  }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}
try {
  const source = await createEnvironment({ cmsUrl: process.env.AI_SLOT_CMS_URL }).readSource();
  const draft = await operation('/ops/draft', { slotId: 'hero', tree: { component: 'card', props: {
    title: source.data.title, price: source.data.price, link: source.data.link,
  } }, baseRevision: 0, sourceVersion: source.version });
  await operation('/ops/approve', { draftId: draft.id, artifactHash: draft.artifactHash,
    expiresAt: Math.min(source.expiresAt, Date.now() + 600_000) });
  await operation('/ops/publish', { draftId: draft.id, artifactHash: draft.artifactHash,
    expectedRevision: 0, idempotencyKey: 'local-cms-demo' });
  process.stdout.write('本机参考内容已通过私有治理接口发布\n');
} catch (error) {
  await running.close();
  throw error;
}
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (closing) return;
  closing = true;
  void running.close();
});
