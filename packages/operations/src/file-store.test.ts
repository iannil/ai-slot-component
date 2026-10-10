import { afterEach, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from './canonical.js';
import { openFileStore } from './file-store.js';
import { emptyState } from './state.js';
import type { State, Store } from './types.js';

const dirs: string[] = [];
const stores: Store[] = [];
async function makeDir() { const dir = await mkdtemp(join(tmpdir(), 'slot-store-')); dirs.push(dir); return dir; }
async function openStore(dir: string, fault?: (phase: 'beforeRename' | 'afterRename') => void) {
  const store = await openFileStore(dir, fault); stores.push(store); return store;
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
function seed(state: State) {
  const artifact = { slotId: 'hero', tree: { component: 'Text', props: { text: 'hello' } }, sourceId: 'cms', sourceVersion: '1', registryVersion: '1', rendererVersion: '1', expiresAt: 100 };
  const artifactHash = hash(artifact);
  state.artifacts[artifactHash] = { ...artifact, hash: artifactHash };
  state.drafts.d1 = { id: 'd1', artifactHash, slotId: 'hero', baseRevision: 0, createdBy: 'operator', intent: 'publish', createdAt: 1 };
  state.approvals.d1 = { draftId: 'd1', artifactHash, baseRevision: 0, approvedBy: 'reviewer', expiresAt: 200 };
  state.releases.push({ slotId: 'hero', revision: 1, artifactHash, draftId: 'd1', actor: 'operator', action: 'publish', at: 2 });
  state.pointers.hero = { slotId: 'hero', revision: 1, artifactHash };
  state.idempotency.key = { fingerprint: 'a'.repeat(64), receipt: { slotId: 'hero', revision: 1, artifactHash } };
}

it('完整事务可重启，第二写者拒绝', async () => {
  const dir = await makeDir();
  const store = await openStore(dir);
  await expect(openFileStore(dir)).rejects.toThrow();
  const result = await store.transact(s => { expect(s.format).toBe(1); return 'ok'; });
  expect(result).toBe('ok');
  await store.close();
  const restored = await openStore(dir);
  expect(await restored.read()).toEqual(emptyState());
});

it('事务与读取排队，返回对象修改不影响已提交状态', async () => {
  const dir = await makeDir();
  const store = await openStore(dir);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = store.transact(async s => { await gate; seed(s); return s.pointers.hero; });
  const second = store.transact(s => { expect(s.releases).toHaveLength(1); return s.releases[0].revision; });
  const read = store.read();
  release();
  const receipt = await first;
  expect(await second).toBe(1);
  expect((await read).releases).toHaveLength(1);
  receipt.revision = 99;
  expect((await store.read()).pointers.hero.revision).toBe(1);
});

it('change 抛错与 rename 前故障均保留旧状态', async () => {
  const dir = await makeDir();
  const store = await openStore(dir);
  await expect(store.transact(s => { seed(s); throw Error('change'); })).rejects.toThrow('change');
  expect(await store.read()).toEqual(emptyState());
  await store.close();
  const failing = await openStore(dir, phase => { if (phase === 'beforeRename') throw Error('before'); });
  await expect(failing.transact(s => seed(s))).rejects.toThrow('before');
  await failing.close();
  const restored = await openStore(dir);
  expect(await restored.read()).toEqual(emptyState());
});

it('rename 后故障报告 commit_unknown，禁止继续写，重开读取完整新状态', async () => {
  const dir = await makeDir();
  const store = await openStore(dir, phase => { if (phase === 'afterRename') throw Error('after'); });
  await expect(store.transact(s => seed(s))).rejects.toMatchObject({ code: 'commit_unknown' });
  await expect(store.transact(s => seed(s))).rejects.toMatchObject({ code: 'commit_unknown' });
  await store.close();
  const restored = await openStore(dir);
  expect((await restored.read()).releases).toHaveLength(1);
});

it('坏 JSON、hash、悬空引用均拒绝启动且不清空文件', async () => {
  for (const kind of ['json', 'hash', 'reference']) {
    const dir = await makeDir();
    const state = emptyState(); seed(state);
    if (kind === 'hash') state.artifacts[Object.keys(state.artifacts)[0]].sourceVersion = 'tampered';
    if (kind === 'reference') state.drafts.d1.artifactHash = 'b'.repeat(64);
    const contents = kind === 'json' ? '{' : JSON.stringify(state);
    await writeFile(join(dir, 'state.json'), contents);
    await expect(openFileStore(dir)).rejects.toThrow();
    expect(await readFile(join(dir, 'state.json'), 'utf8')).toBe(contents);
    await expect(readFile(join(dir, 'writer.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  }
});

it('已有锁不自动抢占，启动失败不删除别人的锁', async () => {
  const dir = await makeDir();
  await writeFile(join(dir, 'writer.lock'), '123:other');
  await expect(openFileStore(dir)).rejects.toThrow();
  expect(await readFile(join(dir, 'writer.lock'), 'utf8')).toBe('123:other');
});

it('超限拒绝并保留旧状态', async () => {
  const dir = await makeDir();
  const store = await openStore(dir);
  await expect(store.transact(s => { s.releases = Array.from({ length: 1001 }, () => ({ slotId: 'hero', revision: 1, artifactHash: 'a'.repeat(64), draftId: 'd1', actor: 'x', action: 'publish', at: 1 })); })).rejects.toMatchObject({ code: 'storage_limit' });
  expect(await store.read()).toEqual(emptyState());
});

it('合法状态写入超过 64MiB 时拒绝，旧快照和重开读取仍完整', async () => {
  const dir = await makeDir();
  const store = await openStore(dir);
  await store.transact(s => seed(s));
  const oldBytes = await readFile(join(dir, 'state.json'));
  const oldState = await store.read();
  await expect(store.transact(s => {
    const text = 'x'.repeat(62_000);
    for (let i = 0; i < 1100; i++) {
      const payload = { slotId: 'hero', tree: { component: 'Text', props: { text, index: i } },
        sourceId: 'cms', sourceVersion: '1', registryVersion: '1', rendererVersion: '1', expiresAt: 100 };
      const artifactHash = hash(payload);
      s.artifacts[artifactHash] = { ...payload, hash: artifactHash };
    }
  })).rejects.toMatchObject({ code: 'storage_limit' });
  expect(await readFile(join(dir, 'state.json'))).toEqual(oldBytes);
  expect(await store.read()).toEqual(oldState);
  await store.close();
  const reopened = await openStore(dir);
  expect(await reopened.read()).toEqual(oldState);
});

it('启动前先拒绝超过 64MiB 的快照，即使内容也不是 JSON', async () => {
  const dir = await makeDir();
  const file = await open(join(dir, 'state.json'), 'w');
  try { await file.truncate(64 * 1024 * 1024 + 1); } finally { await file.close(); }
  await expect(openFileStore(dir)).rejects.toMatchObject({ code: 'storage_limit' });
  await expect(readFile(join(dir, 'writer.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('close 仅移走自己 nonce 的锁', async () => {
  const dir = await makeDir();
  const store = await openStore(dir);
  await writeFile(join(dir, 'writer.lock'), 'replacement-owner');
  await store.close();
  expect(await readFile(join(dir, 'writer.lock'), 'utf8')).toBe('replacement-owner');
});

it('另一进程持有 writer.lock 时拒绝启动', async () => {
  const dir = await makeDir();
  const child = spawn(process.execPath, ['-e',
    "require('node:fs').writeFileSync(process.argv[1] + '/writer.lock', 'child-owner', { flag: 'wx' }); process.stdout.write('ready'); setInterval(() => {}, 1000)", dir],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await once(child.stdout!, 'data');
    await expect(openFileStore(dir)).rejects.toThrow();
    expect(await readFile(join(dir, 'writer.lock'), 'utf8')).toBe('child-owner');
  } finally {
    child.kill();
    await once(child, 'exit');
  }
});
