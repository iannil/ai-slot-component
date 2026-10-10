import { describe, expect, it, vi } from 'vitest';
import { createOperations } from './operations.js';
import { openFileStore } from './file-store.js';
import { card, makeFixture } from './test-fixture.js';

async function withFixture(run: (f: Awaited<ReturnType<typeof makeFixture>>) => Promise<void>) {
  const f = await makeFixture();
  try { await run(f); } finally { await f.cleanup(); }
}

async function approved(f: Awaited<ReturnType<typeof makeFixture>>, title: string, baseRevision: number) {
  const draft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card(title), baseRevision, sourceVersion: 's1' });
  await f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 5000 });
  return { draftId: draft.id, artifactHash: draft.artifactHash, expectedRevision: baseRevision, idempotencyKey: `request-${title}` };
}

describe('幂等发布与回滚', () => {
  it('相同请求只创建一条发布，异参同key被拒绝', async () => withFixture(async f => {
    const input = await approved(f, 'A', 0);
    const first = await f.ops.publishDraft(f.agent, input);
    expect(await f.ops.publishDraft(f.agent, input)).toEqual(first);
    await expect(f.ops.publishDraft(f.agent, { ...input, expectedRevision: 1 })).rejects.toThrow('idempotency_conflict');
    expect((await f.store.read()).releases).toHaveLength(1);
  }));

  it('相同基线并发发布只有一个成功', async () => withFixture(async f => {
    const a = await approved(f, 'A', 0);
    const b = await approved(f, 'B', 0);
    const results = await Promise.allSettled([f.ops.publishDraft(f.agent, a), f.ops.publishDraft(f.agent, b)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await f.store.read()).releases).toHaveLength(1);
  }));

  it('重启后幂等重试仍返回原收据；撤销授权后拒绝重试', async () => withFixture(async f => {
    const input = await approved(f, 'A', 0);
    const first = await f.ops.publishDraft(f.agent, input);
    // 同一文件只能由单个写者持锁，重开前关闭原 Store。
    const directory = f.directory;
    await f.store.close();
    const reopened = await openFileStore(directory);
    try {
      const ops = createOperations(reopened, f.env);
      expect(await ops.publishDraft(f.agent, input)).toEqual(first);
      const revoked = { ...f.agent, grants: { hero: ['read' as const] } };
      await expect(ops.publishDraft(revoked, input)).rejects.toThrow('forbidden');
      expect((await reopened.read()).releases).toHaveLength(1);
    } finally { await reopened.close(); }
  }));

  it('通知失败不撤销已经提交的指针', async () => withFixture(async f => {
    f.env.notify = vi.fn().mockRejectedValue(Error('network'));
    const receipt = await f.ops.publishDraft(f.agent, await approved(f, 'A', 0));
    expect((await f.store.read()).pointers.hero).toEqual(receipt);
    expect(f.env.notify).toHaveBeenCalledWith('hero');
  }));

  it('过期批准、来源及渲染契约变化均不能发布', async () => withFixture(async f => {
    const input = await approved(f, 'A', 0);
    f.env.now = () => 5000;
    await expect(f.ops.publishDraft(f.agent, input)).rejects.toThrow('approval_expired');
    f.env.now = () => 1000;
    f.setSource({ ...f.source, version: 's2' });
    await expect(f.ops.publishDraft(f.agent, input)).rejects.toThrow('source_changed');
    f.setSource(f.source);
    f.env.policies.hero.rendererVersion = 'v2';
    await expect(f.ops.publishDraft(f.agent, input)).rejects.toThrow('contract_changed');
    expect((await f.store.read()).releases).toEqual([]);
  }));

  it('来源身份同时切换仍不能发布旧artifact', async () => withFixture(async f => {
    const input = await approved(f, 'A', 0);
    f.env.policies.hero.sourceId = 'new-cms';
    f.setSource({ ...f.source, id: 'new-cms' });
    await expect(f.ops.publishDraft(f.agent, input)).rejects.toThrow('source_changed');
    expect((await f.store.read()).releases).toEqual([]);
  }));

  it('回滚必须重新批准，成功后产生新revision且历史保留', async () => withFixture(async f => {
    const first = await f.ops.publishDraft(f.agent, await approved(f, 'A', 0));
    await f.ops.publishDraft(f.agent, await approved(f, 'B', 1));
    const rollback = await f.ops.prepareRollback(f.agent, { slotId: 'hero', targetRevision: 1, expectedRevision: 2 });
    expect(rollback.intent).toBe('rollback');
    expect(rollback.baseRevision).toBe(2);
    expect(rollback.artifactHash).toBe(first.artifactHash);
    const input = { draftId: rollback.id, artifactHash: rollback.artifactHash, expectedRevision: 2, idempotencyKey: 'rollback-1' };
    await expect(f.ops.rollbackSlot(f.agent, input)).rejects.toThrow('approval_required');
    await f.ops.approveDraft(f.owner, { draftId: rollback.id, artifactHash: rollback.artifactHash, expiresAt: 5000 });
    const receipt = await f.ops.rollbackSlot(f.agent, input);
    expect(receipt).toEqual({ slotId: 'hero', revision: 3, artifactHash: first.artifactHash });
    const state = await f.store.read();
    expect(state.releases.map(r => r.revision)).toEqual([1, 2, 3]);
    expect(state.releases[2].action).toBe('rollback');
  }));

  it('回滚检查权限、目标版本和发布动作', async () => withFixture(async f => {
    const first = await approved(f, 'A', 0);
    await expect(f.ops.rollbackSlot(f.agent, first)).rejects.toThrow('wrong_action');
    await f.ops.publishDraft(f.agent, first);
    const request = { slotId: 'hero', targetRevision: 1, expectedRevision: 1 };
    await expect(f.ops.prepareRollback({ id: 'guest', grants: {} }, request)).rejects.toThrow('forbidden');
    await expect(f.ops.prepareRollback(f.agent, { ...request, targetRevision: 2 })).rejects.toThrow('not_found');
    await expect(f.ops.prepareRollback(f.agent, { ...request, expectedRevision: 0 })).rejects.toThrow('conflict');
    const draft = await f.ops.prepareRollback(f.agent, request);
    const input = { draftId: draft.id, artifactHash: draft.artifactHash, expectedRevision: 1, idempotencyKey: 'rollback-action' };
    await expect(f.ops.publishDraft(f.agent, input)).rejects.toThrow('wrong_action');
    expect((await f.store.read()).releases).toHaveLength(1);
  }));

  it('过期或旧来源的历史版本不能准备回滚', async () => withFixture(async f => {
    await f.ops.publishDraft(f.agent, await approved(f, 'A', 0));
    await f.ops.publishDraft(f.agent, await approved(f, 'B', 1));
    f.setSource({ ...f.source, version: 's2' });
    await expect(f.ops.prepareRollback(f.agent, { slotId: 'hero', targetRevision: 1, expectedRevision: 2 })).rejects.toThrow('source_changed');
    f.setSource(f.source);
    f.env.now = () => 20_000;
    await expect(f.ops.prepareRollback(f.agent, { slotId: 'hero', targetRevision: 1, expectedRevision: 2 })).rejects.toThrow('expired');
  }));
});
