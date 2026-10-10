import { hash } from './canonical.js';
import { assertCurrentArtifact } from './drafts.js';
import { authorize } from './policy.js';
import { OperationError, type Action, type Draft, type Environment, type Principal, type Receipt, type State, type Store } from './types.js';

export interface PublishInput { draftId: string; artifactHash: string; expectedRevision: number; idempotencyKey: string }

/** 所有可变前置条件都在 Store 事务内复核。 */
async function assertPublishable(state: State, env: Environment, draft: Draft, input: PublishInput): Promise<void> {
  const artifact = state.artifacts[draft.artifactHash];
  const approval = state.approvals[draft.id];
  if (!artifact || !approval) throw new OperationError('approval_required');
  if (input.artifactHash !== artifact.hash || approval.artifactHash !== artifact.hash) throw new OperationError('hash_mismatch');
  const current = state.pointers[draft.slotId]?.revision ?? 0;
  if (current !== input.expectedRevision || current !== draft.baseRevision || current !== approval.baseRevision) {
    throw new OperationError('conflict');
  }
  if (approval.expiresAt <= env.now()) throw new OperationError('approval_expired');
  await assertCurrentArtifact(env, artifact);
  // 来源读取可能跨过批准期限，提交前必须重新取时。
  if (approval.expiresAt <= env.now()) throw new OperationError('approval_expired');
}

/** 原子 CAS 发布；幂等命中前仍检查当前授权。 */
export async function commitDraft(store: Store, env: Environment, actor: Principal, input: PublishInput, action: Extract<Action, 'publish' | 'rollback'>): Promise<Receipt> {
  if (!input || typeof input.draftId !== 'string' || !input.draftId ||
      typeof input.artifactHash !== 'string' || !input.artifactHash ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new OperationError('invalid_input');
  }
  const receipt = await store.transact(async state => {
    const draft = Object.hasOwn(state.drafts, input.draftId) ? state.drafts[input.draftId] : undefined;
    if (!draft) throw new OperationError('not_found');
    authorize(actor, draft.slotId, action);
    if (draft.intent !== action) throw new OperationError('wrong_action');
    if (typeof input.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.idempotencyKey)) {
      throw new OperationError('invalid_key');
    }
    const key = hash([actor.id, draft.slotId, action, input.idempotencyKey]);
    const fingerprint = hash(input);
    const previous = Object.hasOwn(state.idempotency, key) ? state.idempotency[key] : undefined;
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new OperationError('idempotency_conflict');
      return previous.receipt;
    }
    await assertPublishable(state, env, draft, input);
    const revision = (state.pointers[draft.slotId]?.revision ?? 0) + 1;
    const result: Receipt = { slotId: draft.slotId, revision, artifactHash: draft.artifactHash };
    state.releases.push({ ...result, draftId: draft.id, actor: actor.id, action, at: env.now() });
    state.pointers[draft.slotId] = result;
    state.idempotency[key] = { fingerprint, receipt: result };
    return result;
  });
  try { await env.notify(receipt.slotId); }
  catch { /* 已提交的版本不能因通知失败而撤销；订阅端下次读取当前指针。 */ }
  return receipt;
}
