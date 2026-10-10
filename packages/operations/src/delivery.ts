import { assertCurrentArtifact } from './drafts.js';
import { authorize } from './policy.js';
import { OperationError, type Artifact, type Environment, type Principal, type Receipt, type State, type Store } from './types.js';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

/** 公开读取和管理状态共用同一可读性判断，每次都重新核对当前来源。 */
async function readableArtifact(state: State, env: Environment, slotId: string, pointer: Receipt | undefined): Promise<Artifact | null> {
  if (!pointer || pointer.slotId !== slotId) return null;
  const artifact = Object.hasOwn(state.artifacts, pointer.artifactHash) ? state.artifacts[pointer.artifactHash] : undefined;
  if (!artifact || artifact.hash !== pointer.artifactHash || artifact.slotId !== slotId) return null;
  try { await assertCurrentArtifact(env, artifact); }
  catch { return null; }
  return artifact;
}

/** 只交付当前活动版本；来源读取失败时不使用先前快照补位。 */
export async function deliver(store: Store, env: Environment, slotId: string): Promise<Response> {
  if (!Object.hasOwn(env.policies, slotId)) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });
  }
  try {
    const state = await store.read();
    const pointer = Object.hasOwn(state.pointers, slotId) ? state.pointers[slotId] : undefined;
    const artifact = await readableArtifact(state, env, slotId, pointer);
    if (pointer && artifact) {
      return new Response(JSON.stringify({
        version: 1, slot: slotId, tree: artifact.tree,
        meta: {
          revision: pointer.revision, artifactHash: artifact.hash,
          sourceVersion: artifact.sourceVersion, expiresAt: artifact.expiresAt,
        },
      }), { headers });
    }
  } catch { /* 存储或序列化失败也必须退回原始槽位内容。 */ }
  return new Response(JSON.stringify({ error: 'ai_unavailable' }), { status: 503, headers });
}

/** desired来自发布指针；readable必须通过与公开投递相同的实时检查。 */
export async function getStatus(store: Store, env: Environment, actor: Principal, slotId: string): Promise<{
  desiredRevision: number; readableRevision: number | null; browserObservation: null;
}> {
  authorize(actor, slotId, 'read');
  if (!Object.hasOwn(env.policies, slotId)) throw new OperationError('not_found');
  const state = await store.read();
  const pointer = Object.hasOwn(state.pointers, slotId) ? state.pointers[slotId] : undefined;
  const artifact = await readableArtifact(state, env, slotId, pointer);
  return {
    desiredRevision: pointer?.revision ?? 0,
    readableRevision: pointer && artifact ? pointer.revision : null,
    browserObservation: null,
  };
}
