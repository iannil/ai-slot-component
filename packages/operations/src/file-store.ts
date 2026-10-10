import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical } from './canonical.js';
import { assertState, emptyState } from './state.js';
import { OperationError, type State, type Store } from './types.js';

const MAX_BYTES = 64 * 1024 * 1024;
type Phase = 'beforeRename' | 'afterRename';
type Fault = (phase: Phase) => void;

async function readState(directory: string): Promise<State> {
  const file = await open(join(directory, 'state.json'), 'r');
  try {
    if ((await file.stat()).size > MAX_BYTES) throw new OperationError('storage_limit');
    const bytes = await file.readFile();
    if (bytes.length > MAX_BYTES) throw new OperationError('storage_limit');
    let state: unknown;
    try { state = JSON.parse(bytes.toString('utf8')); }
    catch { throw new OperationError('corrupt_state'); }
    assertState(state);
    return state;
  } finally { await file.close(); }
}

async function writeState(directory: string, state: State, fault?: Fault): Promise<void> {
  assertState(state);
  const bytes = Buffer.from(canonical(state));
  if (bytes.length > MAX_BYTES || state.releases.length > 1000) throw new OperationError('storage_limit');
  const temp = join(directory, `state-${randomUUID()}.tmp`);
  let renamed = false;
  try {
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); }
    finally { await file.close(); }
    fault?.('beforeRename');
    await rename(temp, join(directory, 'state.json'));
    renamed = true;
    fault?.('afterRename');
    const dir = await open(directory, 'r');
    try { await dir.sync(); }
    finally { await dir.close(); }
  } catch (error) {
    if (renamed) throw new OperationError('commit_unknown');
    throw error;
  } finally {
    try { await rm(temp, { force: true }); }
    catch (error) { if (renamed) throw new OperationError('commit_unknown'); throw error; }
  }
}

async function unlockOwned(lock: string, identity: string): Promise<void> {
  try {
    if (await readFile(lock, 'utf8') === identity) await rm(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** 单进程写者；锁残留必须由管理员核实后人工移走。 */
export async function openFileStore(directory: string, fault?: Fault): Promise<Store> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, 'writer.lock');
  const identity = `${process.pid}:${randomUUID()}`;
  const handle = await open(lock, 'wx', 0o600);
  try {
    await handle.writeFile(identity);
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlockOwned(lock, identity);
    throw error;
  }
  try {
    try { await readState(directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await writeState(directory, emptyState());
    }
  } catch (error) {
    await unlockOwned(lock, identity);
    throw error;
  }

  let tail: Promise<void> = Promise.resolve();
  let closed = false;
  let poisoned = false;
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const job = tail.then(work);
    tail = job.then(() => undefined, () => undefined);
    return job;
  }
  return {
    read() {
      if (closed) return Promise.reject(new OperationError('store_closed'));
      return enqueue(async () => structuredClone(await readState(directory)));
    },
    transact<T>(change: (state: State) => T | Promise<T>): Promise<T> {
      if (closed) return Promise.reject(new OperationError('store_closed'));
      return enqueue(async () => {
        if (poisoned) throw new OperationError('commit_unknown');
        const state = structuredClone(await readState(directory));
        const result = structuredClone(await change(state));
        try { await writeState(directory, structuredClone(state), fault); }
        catch (error) {
          if (error instanceof OperationError && error.code === 'commit_unknown') poisoned = true;
          throw error;
        }
        return result;
      });
    },
    close() {
      if (closed) return tail;
      closed = true;
      return enqueue(async () => { await unlockOwned(lock, identity); });
    },
  };
}
