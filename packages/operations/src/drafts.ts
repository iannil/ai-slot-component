import { randomUUID } from 'node:crypto';
import { canonical, hash } from './canonical.js';
import { authorize, validateArtifact } from './policy.js';
import { OperationError, type Approval, type Artifact, type Draft, type Environment, type Principal, type Source, type Store } from './types.js';

export interface DraftInput { slotId: string; tree: unknown; baseRevision: number; sourceVersion: string }
export interface ApprovalInput { draftId: string; artifactHash: string; expiresAt: number }

export async function readSource(env: Environment, slotId: string): Promise<Source> {
  try { return await env.readSource(slotId); }
  catch { throw new OperationError('source_unavailable'); }
}

/** 发布、批准和回滚共同使用当前契约与来源快照校验。 */
export async function assertCurrentArtifact(env: Environment, artifact: Artifact): Promise<void> {
  const policy = Object.hasOwn(env.policies, artifact.slotId) ? env.policies[artifact.slotId] : undefined;
  if (!policy || artifact.registryVersion !== policy.registryVersion || artifact.rendererVersion !== policy.rendererVersion) {
    throw new OperationError('contract_changed');
  }
  if (artifact.sourceId !== policy.sourceId) throw new OperationError('source_changed');
  const source = await readSource(env, artifact.slotId);
  validateArtifact(env, artifact.slotId, artifact.tree, source);
  if (source.id !== artifact.sourceId || source.version !== artifact.sourceVersion || source.expiresAt !== artifact.expiresAt) {
    throw new OperationError('source_changed');
  }
  if (artifact.expiresAt <= env.now()) throw new OperationError('expired');
}

function requireDraftInput(input: DraftInput): void {
  if (!input || typeof input.slotId !== 'string' || !input.slotId ||
      !Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0 ||
      typeof input.sourceVersion !== 'string' || !input.sourceVersion) {
    throw new OperationError('invalid_input');
  }
}

/** 在单个事务中校验来源与基线，然后固定草稿及内容哈希。 */
export function createDraft(store: Store, env: Environment, actor: Principal, input: DraftInput): Promise<Draft> {
  requireDraftInput(input);
  return store.transact(async state => {
    authorize(actor, input.slotId, 'draft');
    const policy = Object.hasOwn(env.policies, input.slotId) ? env.policies[input.slotId] : undefined;
    if (!policy) throw new OperationError('forbidden');
    if (input.baseRevision !== (state.pointers[input.slotId]?.revision ?? 0)) throw new OperationError('revision_conflict');
    const source = await readSource(env, input.slotId);
    const tree = validateArtifact(env, input.slotId, input.tree, source);
    if (source.version !== input.sourceVersion) throw new OperationError('source_changed');
    const payload = {
      slotId: input.slotId, tree, sourceId: source.id, sourceVersion: source.version,
      registryVersion: policy.registryVersion, rendererVersion: policy.rendererVersion,
      expiresAt: source.expiresAt,
    };
    const artifact: Artifact = { hash: hash(payload), ...payload };
    const existing = state.artifacts[artifact.hash];
    if (existing && canonical(existing) !== canonical(artifact)) throw new OperationError('hash_collision');
    if (!existing) state.artifacts[artifact.hash] = artifact;
    const draft: Draft = {
      id: randomUUID(), artifactHash: artifact.hash, slotId: input.slotId,
      baseRevision: input.baseRevision, createdBy: actor.id,
      intent: 'publish', createdAt: env.now(),
    };
    state.drafts[draft.id] = draft;
    return draft;
  });
}

/** 差异基线固定为草稿创建时的版本。 */
export async function previewDraft(store: Store, _env: Environment, actor: Principal, draftId: string): Promise<{ draft: Draft; artifact: Artifact; previous: Artifact | null }> {
  const state = await store.read();
  const draft = Object.hasOwn(state.drafts, draftId) ? state.drafts[draftId] : undefined;
  if (!draft) throw new OperationError('draft_not_found');
  authorize(actor, draft.slotId, 'read');
  const artifact = state.artifacts[draft.artifactHash];
  if (!artifact) throw new OperationError('corrupt_state');
  const release = state.releases.find(r => r.slotId === draft.slotId && r.revision === draft.baseRevision);
  const previous = release ? state.artifacts[release.artifactHash] ?? null : null;
  return structuredClone({ draft, artifact, previous });
}

/** 批准前再次校验来源、组件契约和线上基线。 */
export function approveDraft(store: Store, env: Environment, actor: Principal, input: ApprovalInput): Promise<Approval> {
  if (!input || typeof input.draftId !== 'string' || typeof input.artifactHash !== 'string' ||
      typeof input.expiresAt !== 'number' || !Number.isFinite(input.expiresAt)) throw new OperationError('invalid_input');
  return store.transact(async state => {
    const draft = Object.hasOwn(state.drafts, input.draftId) ? state.drafts[input.draftId] : undefined;
    if (!draft) throw new OperationError('draft_not_found');
    authorize(actor, draft.slotId, 'approve');
    if (draft.artifactHash !== input.artifactHash) throw new OperationError('hash_mismatch');
    if (draft.baseRevision !== (state.pointers[draft.slotId]?.revision ?? 0)) throw new OperationError('revision_conflict');
    const artifact = state.artifacts[draft.artifactHash];
    if (!artifact) throw new OperationError('corrupt_state');
    await assertCurrentArtifact(env, artifact);
    const now = env.now();
    if (!(input.expiresAt > now && input.expiresAt <= Math.min(now + 15 * 60_000, artifact.expiresAt))) {
      throw new OperationError('invalid_expiry');
    }
    const approval: Approval = {
      draftId: draft.id, artifactHash: artifact.hash, baseRevision: draft.baseRevision,
      approvedBy: actor.id, expiresAt: input.expiresAt,
    };
    state.approvals[draft.id] = approval;
    return approval;
  });
}

export interface RollbackInput { slotId: string; targetRevision: number; expectedRevision: number }

/** 历史内容重新进入草稿和审批链；线上指针保持原状。 */
export function prepareRollback(store: Store, env: Environment, actor: Principal, input: RollbackInput): Promise<Draft> {
  if (!input || typeof input.slotId !== 'string' || !input.slotId ||
      !Number.isSafeInteger(input.targetRevision) || input.targetRevision < 1 ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new OperationError('invalid_input');
  }
  return store.transact(async state => {
    authorize(actor, input.slotId, 'rollback');
    if (input.expectedRevision !== (state.pointers[input.slotId]?.revision ?? 0)) throw new OperationError('conflict');
    const release = state.releases.find(r => r.slotId === input.slotId && r.revision === input.targetRevision);
    if (!release) throw new OperationError('not_found');
    const artifact = state.artifacts[release.artifactHash];
    if (!artifact) throw new OperationError('corrupt_state');
    await assertCurrentArtifact(env, artifact);
    const draft: Draft = {
      id: randomUUID(), artifactHash: artifact.hash, slotId: input.slotId,
      baseRevision: input.expectedRevision, createdBy: actor.id,
      intent: 'rollback', createdAt: env.now(),
    };
    state.drafts[draft.id] = draft;
    return draft;
  });
}
