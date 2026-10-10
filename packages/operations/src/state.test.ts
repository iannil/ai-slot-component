import { expect, it } from 'vitest';
import { hash } from './canonical.js';
import { assertState, emptyState } from './state.js';
import type { State } from './types.js';

function validState(): State {
  const state = emptyState();
  const payload = { slotId: 'hero', tree: { component: 'Text', props: { text: 'Welcome' } }, sourceVersion: 's1', registryVersion: 'r1', rendererVersion: 'v1', expiresAt: 100 };
  const artifactHash = hash(payload);
  state.artifacts[artifactHash] = { ...payload, hash: artifactHash };
  state.drafts.d1 = { id: 'd1', artifactHash, slotId: 'hero', baseRevision: 0, createdBy: 'author', intent: 'publish', createdAt: 1 };
  state.approvals.d1 = { draftId: 'd1', artifactHash, baseRevision: 0, approvedBy: 'reviewer', expiresAt: 200 };
  state.releases.push({ slotId: 'hero', revision: 1, artifactHash, draftId: 'd1', actor: 'author', action: 'publish', at: 2 });
  state.pointers.hero = { slotId: 'hero', revision: 1, artifactHash };
  state.idempotency.request = { fingerprint: 'f'.repeat(64), receipt: { slotId: 'hero', revision: 1, artifactHash } };
  return state;
}
function corrupt(change: (s: State) => void) {
  const state = validState(); change(state);
  expect(() => assertState(state)).toThrowError(expect.objectContaining({ code: 'corrupt_state' }));
}

it('空库与完整关联状态有效', () => {
  expect(() => assertState(emptyState())).not.toThrow();
  expect(() => assertState(validState())).not.toThrow();
});
it('拒绝格式、非 JSON 值与非法元数据', () => {
  corrupt(s => { (s as unknown as { format: number }).format = 2; });
  corrupt(s => { s.releases[0].at = Number.NaN; });
  corrupt(s => { s.drafts.d1.baseRevision = -1; });
  corrupt(s => { s.releases[0].revision = 0; });
  corrupt(s => { s.drafts.d1.createdBy = ''; });
  corrupt(s => { s.drafts.d1.createdBy = 'a'.repeat(201); });
  corrupt(s => { s.idempotency.request.fingerprint = 'bad'; });
  corrupt(s => { (s.artifacts[Object.keys(s.artifacts)[0]].tree.props as Record<string, unknown>).bad = undefined; });
  corrupt(s => { s.artifacts[Object.keys(s.artifacts)[0]].tree.children = [{} as never]; });
});
it('拒绝篡改产物、悬空草稿与不匹配审批', () => {
  corrupt(s => { s.artifacts[Object.keys(s.artifacts)[0]].sourceVersion = 'changed'; });
  corrupt(s => { s.drafts.d1.artifactHash = 'a'.repeat(64); });
  corrupt(s => { s.approvals.d1.baseRevision = 1; });
});
it('拒绝发布序号、跨槽位发布、指针和幂等回执不一致', () => {
  corrupt(s => { s.releases[0].revision = 2; });
  corrupt(s => { s.releases[0].slotId = 'other'; });
  corrupt(s => { s.pointers.hero.revision = 2; });
  corrupt(s => { delete s.pointers.hero; });
  corrupt(s => { s.idempotency.request.receipt.revision = 2; });
});
it('只读取对象自身属性，不接受继承字段', () => {
  const state = validState();
  const artifactHash = Object.keys(state.artifacts)[0];
  const artifact = state.artifacts[artifactHash];
  state.artifacts[artifactHash] = Object.create(artifact) as typeof artifact;
  expect(() => assertState(state)).toThrowError(expect.objectContaining({ code: 'corrupt_state' }));
});
