import { authorize } from './policy.js';
import { approveDraft, createDraft, prepareRollback, previewDraft, type ApprovalInput, type DraftInput, type RollbackInput } from './drafts.js';
import { commitDraft, type PublishInput } from './publishing.js';
import { type Approval, type Artifact, type Draft, type Environment, type Principal, type Receipt, type Store } from './types.js';

export type { DraftInput, ApprovalInput, RollbackInput } from './drafts.js';
export type { PublishInput } from './publishing.js';

/** 治理操作入口；交付操作由后续阶段补齐。 */
export interface Operations {
  listSlots(actor: Principal): Promise<string[]>;
  readSlot(actor: Principal, slotId: string): Promise<{ pointer: Receipt | null; drafts: Draft[] }>;
  createDraft(actor: Principal, input: DraftInput): Promise<Draft>;
  previewDraft(actor: Principal, draftId: string): Promise<{ draft: Draft; artifact: Artifact; previous: Artifact | null }>;
  approveDraft(actor: Principal, input: ApprovalInput): Promise<Approval>;
  publishDraft(actor: Principal, input: PublishInput): Promise<Receipt>;
  prepareRollback(actor: Principal, input: RollbackInput): Promise<Draft>;
  rollbackSlot(actor: Principal, input: PublishInput): Promise<Receipt>;
}

export function createOperations(store: Store, env: Environment): Operations {
  return {
    async listSlots(actor) {
      return Object.keys(env.policies).filter(slotId => {
        try { authorize(actor, slotId, 'read'); return true; }
        catch { return false; }
      }).sort();
    },
    async readSlot(actor, slotId) {
      authorize(actor, slotId, 'read');
      const state = await store.read();
      return structuredClone({
        pointer: state.pointers[slotId] ?? null,
        drafts: Object.values(state.drafts).filter(draft => draft.slotId === slotId),
      });
    },
    createDraft: (actor, input) => createDraft(store, env, actor, input),
    previewDraft: (actor, draftId) => previewDraft(store, env, actor, draftId),
    approveDraft: (actor, input) => approveDraft(store, env, actor, input),
    publishDraft: (actor, input) => commitDraft(store, env, actor, input, 'publish'),
    prepareRollback: (actor, input) => prepareRollback(store, env, actor, input),
    rollbackSlot: (actor, input) => commitDraft(store, env, actor, input, 'rollback'),
  };
}
