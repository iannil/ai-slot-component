import { hash } from './canonical.js';
import { OperationError, type State } from './types.js';

const fail = (): never => { throw new OperationError('corrupt_state'); };
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const own = (value: Record<string, unknown>, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined;
const validString = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const validHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const revision = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum;
const time = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function requireString(value: unknown): asserts value is string { if (!validString(value)) fail(); }
function requireHash(value: unknown): asserts value is string { if (!validHash(value)) fail(); }
function requireRevision(value: unknown, minimum = 0): asserts value is number { if (!revision(value, minimum)) fail(); }
function requireTime(value: unknown): asserts value is number { if (!time(value)) fail(); }
function requireRecord(value: unknown): asserts value is Record<string, unknown> { if (!record(value)) fail(); }
function requireEnum(value: unknown, allowed: readonly string[]): void { if (!allowed.includes(value as string)) fail(); }

/** 确保快照只含可安全序列化的 JSON 值，并限制键和字符串。 */
function json(value: unknown, active = new Set<object>(), depth = 0): void {
  if (depth > 256) fail();
  if (typeof value === 'string') { requireString(value); return; }
  if (value === null || typeof value === 'boolean' || time(value)) return;
  if (typeof value !== 'object' || value === null) fail();
  const object = value as object;
  if (active.has(object)) fail();
  if (!Array.isArray(value) && !record(value)) fail();
  active.add(object);
  try {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) { if (!Object.hasOwn(value, i)) fail(); json(value[i], active, depth + 1); }
    } else {
      for (const [key, child] of Object.entries(object)) { requireString(key); json(child, active, depth + 1); }
    }
  } finally { active.delete(object); }
}

function requireTree(value: unknown, depth = 0): void {
  if (depth > 256) fail();
  requireRecord(value);
  requireString(own(value, 'component'));
  const props = own(value, 'props');
  if (props !== undefined) requireRecord(props);
  const children = own(value, 'children');
  if (children !== undefined) {
    if (!Array.isArray(children)) fail();
    for (const child of children as unknown[]) requireTree(child, depth + 1);
  }
  const slots = own(value, 'slots');
  if (slots !== undefined) {
    requireRecord(slots);
    for (const nodes of Object.values(slots)) {
      if (!Array.isArray(nodes)) fail();
      for (const child of nodes as unknown[]) requireTree(child, depth + 1);
    }
  }
}

export function emptyState(): State {
  return { format: 1, artifacts: {}, drafts: {}, approvals: {}, releases: [], pointers: {}, idempotency: {} };
}

/** 启动和提交共同使用的完整结构及引用校验。 */
export function assertState(input: unknown): asserts input is State {
  requireRecord(input);
  if (own(input, 'format') !== 1) fail();
  for (const name of ['artifacts', 'drafts', 'approvals', 'pointers', 'idempotency']) requireRecord(own(input, name));
  const releases = own(input, 'releases');
  if (!Array.isArray(releases)) fail();
  json(input);
  const state = input as unknown as State;
  if (state.releases.length > 1000) throw new OperationError('storage_limit');

  for (const [key, artifact] of Object.entries(state.artifacts)) {
    requireHash(key); requireRecord(artifact);
    const stored = own(artifact, 'hash'); requireHash(stored);
    requireString(own(artifact, 'slotId'));
    requireTree(own(artifact, 'tree'));
    requireString(own(artifact, 'sourceId'));
    requireString(own(artifact, 'sourceVersion'));
    requireString(own(artifact, 'registryVersion'));
    requireString(own(artifact, 'rendererVersion'));
    requireTime(own(artifact, 'expiresAt'));
    const { hash: _, ...payload } = artifact;
    if (key !== stored || stored !== hash(payload)) fail();
  }
  for (const [key, draft] of Object.entries(state.drafts)) {
    requireString(key); requireRecord(draft);
    const id = own(draft, 'id'); requireString(id);
    const artifactHash = own(draft, 'artifactHash'); requireHash(artifactHash);
    const slotId = own(draft, 'slotId'); requireString(slotId);
    requireRevision(own(draft, 'baseRevision'));
    requireString(own(draft, 'createdBy'));
    requireEnum(own(draft, 'intent'), ['publish', 'rollback']);
    requireTime(own(draft, 'createdAt'));
    const artifact = Object.hasOwn(state.artifacts, artifactHash) ? state.artifacts[artifactHash] : undefined;
    if (key !== id || !artifact || artifact.slotId !== slotId) fail();
  }
  for (const [key, approval] of Object.entries(state.approvals)) {
    requireString(key); requireRecord(approval);
    const draftId = own(approval, 'draftId'); requireString(draftId);
    const artifactHash = own(approval, 'artifactHash'); requireHash(artifactHash);
    const baseRevision = own(approval, 'baseRevision'); requireRevision(baseRevision);
    requireString(own(approval, 'approvedBy'));
    requireTime(own(approval, 'expiresAt'));
    const draft = Object.hasOwn(state.drafts, draftId) ? state.drafts[draftId] : undefined;
    if (key !== draftId || !draft || draft.artifactHash !== artifactHash || draft.baseRevision !== baseRevision) fail();
  }
  const last = new Map<string, State['releases'][number]>();
  for (const release of state.releases) {
    requireRecord(release);
    const slotId = own(release, 'slotId'); requireString(slotId);
    const currentRevision = own(release, 'revision'); requireRevision(currentRevision, 1);
    const artifactHash = own(release, 'artifactHash'); requireHash(artifactHash);
    const draftId = own(release, 'draftId'); requireString(draftId);
    requireString(own(release, 'actor'));
    requireEnum(own(release, 'action'), ['publish', 'rollback']);
    requireTime(own(release, 'at'));
    const draft = Object.hasOwn(state.drafts, draftId) ? state.drafts[draftId] : undefined;
    const artifact = Object.hasOwn(state.artifacts, artifactHash) ? state.artifacts[artifactHash] : undefined;
    if (!draft || !artifact || draft.slotId !== slotId || artifact.slotId !== slotId || draft.artifactHash !== artifactHash || draft.intent !== release.action) fail();
    if (currentRevision !== (last.get(slotId)?.revision ?? 0) + 1) fail();
    last.set(slotId, release);
  }
  for (const [slot, pointer] of Object.entries(state.pointers)) {
    requireString(slot); requireRecord(pointer);
    const pointerSlot = own(pointer, 'slotId'); requireString(pointerSlot);
    const pointerRevision = own(pointer, 'revision'); requireRevision(pointerRevision, 1);
    const pointerHash = own(pointer, 'artifactHash'); requireHash(pointerHash);
    const release = last.get(slot);
    if (!release || pointerSlot !== slot || pointerRevision !== release.revision || pointerHash !== release.artifactHash) fail();
  }
  if (last.size !== Object.keys(state.pointers).length) fail();
  for (const [key, entry] of Object.entries(state.idempotency)) {
    requireString(key); requireRecord(entry);
    requireHash(own(entry, 'fingerprint'));
    const receipt = own(entry, 'receipt'); requireRecord(receipt);
    const slotId = own(receipt, 'slotId'); requireString(slotId);
    const receiptRevision = own(receipt, 'revision'); requireRevision(receiptRevision, 1);
    const artifactHash = own(receipt, 'artifactHash'); requireHash(artifactHash);
    if (!state.releases.some(r => r.slotId === slotId && r.revision === receiptRevision && r.artifactHash === artifactHash)) fail();
  }
}
