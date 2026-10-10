import { describe, expect, it } from 'vitest';
import { card, makeFixture } from './test-fixture.js';

async function withFixture(run: (f: Awaited<ReturnType<typeof makeFixture>>) => Promise<void>) {
  const f = await makeFixture();
  try { await run(f); } finally { await f.cleanup(); }
}

async function publish(f: Awaited<ReturnType<typeof makeFixture>>) {
  const draft = await f.ops.createDraft(f.agent, {
    slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1',
  });
  await f.ops.approveDraft(f.owner, { draftId: draft.id, artifactHash: draft.artifactHash, expiresAt: 5000 });
  const receipt = await f.ops.publishDraft(f.agent, {
    draftId: draft.id, artifactHash: draft.artifactHash, expectedRevision: 0, idempotencyKey: 'first',
  });
  return { draft, receipt };
}

describe('公开投递与状态', () => {
  it('草稿不能公开读取，未知槽位返回404', async () => withFixture(async f => {
    await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    const unpublished = await f.ops.deliver('hero');
    expect(unpublished.status).toBe(503);
    expect(unpublished.headers.get('cache-control')).toBe('no-store');
    expect(await unpublished.json()).toEqual({ error: 'ai_unavailable' });
    const unknown = await f.ops.deliver('missing');
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('cache-control')).toBe('no-store');
    expect(await unknown.json()).toEqual({ error: 'not_found' });
    expect(await f.ops.getStatus(f.owner, 'hero')).toEqual({
      desiredRevision: 0, readableRevision: null, browserObservation: null,
    });
  }));

  it('发布后只交付已校验树与公开元数据', async () => withFixture(async f => {
    f.setSource({ ...f.source, data: { ...f.source.data, credential: 'private-source-token' } });
    const { draft, receipt } = await publish(f);
    await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('未发布草稿正文'), baseRevision: 1, sourceVersion: 's1' });
    const artifact = (await f.store.read()).artifacts[draft.artifactHash];
    const response = await f.ops.deliver('hero');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual({
      version: 1, slot: 'hero', tree: artifact.tree,
      meta: {
        revision: receipt.revision, artifactHash: artifact.hash,
        sourceVersion: artifact.sourceVersion, expiresAt: artifact.expiresAt,
      },
    });
    expect(JSON.stringify(body)).not.toContain(draft.id);
    expect(JSON.stringify(body)).not.toContain(f.owner.id);
    expect(JSON.stringify(body)).not.toContain(artifact.sourceId);
    expect(JSON.stringify(body)).not.toContain('private-source-token');
    expect(JSON.stringify(body)).not.toContain('未发布草稿正文');
    expect(await f.ops.getStatus(f.owner, 'hero')).toEqual({
      desiredRevision: 1, readableRevision: 1, browserObservation: null,
    });
  }));

  it('来源过期、读取故障与来源变更都使旧版本不可读，保留目标版本', async () => withFixture(async f => {
    await publish(f);
    for (const makeUnreadable of [
      () => { f.env.now = () => 20_000; },
      () => { f.env.now = () => 1000; f.env.readSource = async () => { throw Error('secret source failure'); }; },
      () => { f.setSource({ ...f.source, version: 's2' }); f.env.readSource = async () => ({ ...f.source, version: 's2' }); },
    ]) {
      makeUnreadable();
      const response = await f.ops.deliver('hero');
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'ai_unavailable' });
      expect(await f.ops.getStatus(f.owner, 'hero')).toEqual({
        desiredRevision: 1, readableRevision: null, browserObservation: null,
      });
    }
  }));

  it('当前契约和来源身份变更均拒绝交付', async () => withFixture(async f => {
    await publish(f);
    f.env.policies.hero.rendererVersion = 'v2';
    expect((await f.ops.deliver('hero')).status).toBe(503);
    f.env.policies.hero.rendererVersion = 'v1';
    f.env.policies.hero.sourceId = 'other-cms';
    f.setSource({ ...f.source, id: 'other-cms' });
    expect((await f.ops.deliver('hero')).status).toBe(503);
  }));

  it('授权范围只显示策略存在的槽位，单槽读取不泄露其他草稿', async () => withFixture(async f => {
    f.env.policies.other = { ...f.env.policies.hero, slotId: 'other' };
    const otherActor = { id: 'reader', grants: { hero: ['read' as const], missing: ['read' as const] } };
    expect(await f.ops.listSlots(otherActor)).toEqual(['hero']);
    const heroDraft = await f.ops.createDraft(f.agent, { slotId: 'hero', tree: card('A'), baseRevision: 0, sourceVersion: 's1' });
    const other = { id: 'other', grants: { other: ['draft' as const] } };
    const otherDraft = await f.ops.createDraft(other, { slotId: 'other', tree: card('B'), baseRevision: 0, sourceVersion: 's1' });
    expect((await f.ops.readSlot(otherActor, 'hero')).drafts.map(d => d.id)).toEqual([heroDraft.id]);
    expect(JSON.stringify(await f.ops.readSlot(otherActor, 'hero'))).not.toContain(otherDraft.id);
    await expect(f.ops.readSlot(otherActor, 'other')).rejects.toThrow('forbidden');
    await expect(f.ops.getStatus(otherActor, 'other')).rejects.toThrow('forbidden');
    await expect(f.ops.getStatus(otherActor, 'missing')).rejects.toThrow('not_found');
  }));

  it('公开读取与状态查询不写入发布状态', async () => withFixture(async f => {
    await publish(f);
    const before = await f.store.read();
    await f.ops.deliver('hero');
    await f.ops.getStatus(f.owner, 'hero');
    expect(await f.store.read()).toEqual(before);
  }));
});
