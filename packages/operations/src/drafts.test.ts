import { describe, expect, it } from 'vitest';
import { card, makeFixture } from './test-fixture.js';

async function withFixture(run: (f: Awaited<ReturnType<typeof makeFixture>>) => Promise<void>) {
  const f = await makeFixture();
  try { await run(f); } finally { await f.cleanup(); }
}

describe('草稿、预览与批准', () => {
  it('预览与批准绑定同一不可变内容', async () => withFixture(async f => {
    const draft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    const preview = await f.ops.previewDraft(f.owner, draft.id);
    expect(preview.artifact.hash).toBe(draft.artifactHash);
    expect(preview.previous).toBeNull();
    await expect(f.ops.approveDraft(f.agent, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 5000 })).rejects.toThrow('forbidden');
    await expect(f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: '0'.repeat(64), expiresAt: 5000 })).rejects.toThrow('hash_mismatch');
    await f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 5000 });
    expect((await f.store.read()).approvals[draft.id].approvedBy).toBe('owner');
    expect((await f.store.read()).pointers).toEqual({});
    expect((await f.store.read()).releases).toEqual([]);
  }));

  it('输入对象和返回对象修改均不改变已存artifact', async () => withFixture(async f => {
    const tree = card('A');
    const draft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree, baseRevision: 0, sourceVersion: 's1' });
    tree.props!.title = 'B';
    const preview = await f.ops.previewDraft(f.owner, draft.id);
    preview.artifact.tree.props!.title = 'C';
    preview.draft.createdBy = 'intruder';
    expect((await f.store.read()).artifacts[draft.artifactHash].tree.props?.title).toBe('A');
    expect((await f.store.read()).drafts[draft.id].createdBy).toBe('agent');
  }));

  it('来源版本变化拒绝批准', async () => withFixture(async f => {
    const draft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    f.setSource({ ...f.source, version: 's2' });
    await expect(f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 5000 })).rejects.toThrow('source_changed');
    expect((await f.store.read()).approvals).toEqual({});
  }));

  it('非法树与来源异常不产生草稿', async () => withFixture(async f => {
    await expect(f.ops.createDraft(f.agent, { slotId: 'hero', tree: { component: 'evil' }, baseRevision: 0, sourceVersion: 's1' })).rejects.toThrow();
    f.env.readSource = async () => { throw Error('internal detail'); };
    await expect(f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' })).rejects.toThrow('source_unavailable');
    expect((await f.store.read()).drafts).toEqual({});
  }));

  it('发布改变基线后旧草稿不能批准，预览仍指向创建时基线', async () => withFixture(async f => {
    const draft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    const published = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('B'), baseRevision: 0, sourceVersion: 's1' });
    await f.store.transact(s => {
      s.releases.push({ slotId: 'hero', revision: 1, artifactHash: published.artifactHash, draftId: published.id, actor: 'owner', action: 'publish', at: 1000 });
      s.pointers.hero = { slotId: 'hero', revision: 1, artifactHash: published.artifactHash };
    });
    await expect(f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 5000 })).rejects.toThrow('revision_conflict');
    expect((await f.ops.previewDraft(f.owner, draft.id)).previous).toBeNull();
    expect((await f.ops.readSlot(f.owner, 'hero')).pointer?.revision).toBe(1);
    await expect(f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('C'), baseRevision: 0, sourceVersion: 's1' })).rejects.toThrow('revision_conflict');
  }));

  it('批准期限不能超出十五分钟或来源期限', async () => withFixture(async f => {
    const draft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    await expect(f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 20001 })).rejects.toThrow('invalid_expiry');
    await expect(f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 1000 })).rejects.toThrow('invalid_expiry');
    f.setSource({ ...f.source, expiresAt: 2_000_000 });
    const longDraft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    await expect(f.ops.approveDraft(f.owner, { draftId: longDraft.id, artifactHash: longDraft.artifactHash, expiresAt: 901_001 })).rejects.toThrow('invalid_expiry');
  }));

  it('相同内容复用artifact，但草稿身份独立', async () => withFixture(async f => {
    const first = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    const second = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    expect(first.id).not.toBe(second.id);
    expect(first.artifactHash).toBe(second.artifactHash);
    expect(Object.keys((await f.store.read()).artifacts)).toHaveLength(1);
  }));

  it('预览历史基线不会误用当前版本', async () => withFixture(async f => {
    const first = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    await f.store.transact(s => {
      s.releases.push({ slotId: 'hero', revision: 1, artifactHash: first.artifactHash, draftId: first.id, actor: 'owner', action: 'publish', at: 1000 });
      s.pointers.hero = { slotId: 'hero', revision: 1, artifactHash: first.artifactHash };
    });
    const second = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('B'), baseRevision: 1, sourceVersion: 's1' });
    await f.store.transact(s => {
      s.releases.push({ slotId: 'hero', revision: 2, artifactHash: second.artifactHash, draftId: second.id, actor: 'owner', action: 'publish', at: 1001 });
      s.pointers.hero = { slotId: 'hero', revision: 2, artifactHash: second.artifactHash };
    });
    expect((await f.ops.previewDraft(f.owner, second.id)).previous?.hash).toBe(first.artifactHash);
  }));

  it('来源身份或契约变化使批准失效', async () => withFixture(async f => {
    const draft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    f.setSource({ ...f.source, id: 'other' });
    await expect(f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 5000 })).rejects.toThrow('source_invalid');
    f.setSource(f.source);
    f.env.policies.hero.rendererVersion = 'v2';
    await expect(f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 5000 })).rejects.toThrow('contract_changed');
  }));

  it('策略与来源同时切换仍拒绝批准旧草稿', async () => withFixture(async f => {
    const draft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    f.env.policies.hero.sourceId = 'other-cms';
    f.setSource({ ...f.source, id: 'other-cms' });
    await expect(f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 5000 })).rejects.toThrow('source_changed');
    expect((await f.store.read()).approvals).toEqual({});
  }));

  it('未授权用户不能读取草稿，公开指针不受草稿影响', async () => withFixture(async f => {
    const draft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    const stranger = { id: 'stranger', grants: {} };
    await expect(f.ops.previewDraft(stranger, draft.id)).rejects.toThrow('forbidden');
    await expect(f.ops.readSlot(stranger, 'hero')).rejects.toThrow('forbidden');
    expect(await f.ops.listSlots(stranger)).toEqual([]);
    expect((await f.store.read()).pointers).toEqual({});
  }));
});
