import { validateComponentTree } from '@ai-slot/registry';
import { renderTree } from '@ai-slot/runtime';
import { registry, rendererVersion } from './registry.mjs';
import { createStrictRenderer } from './components.mjs';

let token = '';
let previewed = null;
let approved = null;
let previewSequence = 0;
const byId = id => document.getElementById(id);
const field = id => byId(id).value.trim();
const renderer = createStrictRenderer();

async function call(path, input) {
  const response = await fetch(path, { method: 'POST', headers: {
    'content-type': 'application/json', authorization: `Bearer ${token}`,
  }, body: JSON.stringify(input) });
  const body = await response.json();
  if (!response.ok) throw Error(body.error);
  return body;
}

function resetPreview() {
  previewSequence += 1;
  previewed = null;
  approved = null;
  byId('approve-button').disabled = true;
  byId('publish-button').disabled = true;
  byId('rollback-button').disabled = true;
  byId('artifact-hash').value = '';
  byId('preview').replaceChildren();
  byId('baseline-json').textContent = '';
  byId('candidate-json').textContent = '';
}
function useDraft(draft) {
  resetPreview();
  byId('draft-id').value = draft.id;
  byId('base-revision').value = String(draft.baseRevision);
  byId('status').textContent = `草稿已准备：${draft.id}`;
}
function run(action) {
  return async () => {
    try {
      const result = await action();
      if (typeof result === 'string') byId('status').textContent = result;
    } catch (error) {
      byId('status').textContent = error instanceof Error ? error.message : '操作失败';
    }
  };
}
function currentRevision() {
  const number = Number(field('base-revision'));
  if (!Number.isSafeInteger(number) || number < 0) throw Error('基线修订无效');
  return number;
}
function requirePreview() {
  if (!previewed || field('draft-id') !== previewed.draftId || currentRevision() !== previewed.baseRevision) {
    throw Error('请重新预览当前草稿');
  }
  return previewed;
}

byId('renderer-version').textContent = `Renderer 版本：${rendererVersion}`;
byId('token').addEventListener('change', event => {
  token = event.target.value;
  event.target.value = '';
  resetPreview();
  byId('status').textContent = token ? '令牌已在此页暂存，刷新后失效。' : '请填写 Owner 令牌';
});
byId('draft-id').addEventListener('input', resetPreview);
byId('base-revision').addEventListener('input', resetPreview);
for (const radio of document.querySelectorAll('input[name="width"]')) {
  radio.addEventListener('change', () => { byId('preview').style.width = `${radio.value}px`; });
}
byId('preview').style.width = '768px';

byId('create-draft').addEventListener('click', run(async () => {
  const draft = await call('/ops/draft', { slotId: 'hero', tree: JSON.parse(field('tree')),
    sourceVersion: field('source-version'), baseRevision: currentRevision() });
  useDraft(draft);
}));
byId('prepare-rollback').addEventListener('click', run(async () => {
  const draft = await call('/ops/rollback/prepare', { slotId: 'hero', targetRevision: Number(field('target-revision')),
    expectedRevision: currentRevision() });
  useDraft(draft);
}));
byId('preview-button').addEventListener('click', run(async () => {
  resetPreview();
  const sequence = previewSequence;
  const { draft, artifact, previous } = await call('/ops/preview', { draftId: field('draft-id') });
  if (draft.id !== field('draft-id') || draft.artifactHash !== artifact.hash || draft.baseRevision !== currentRevision()) {
    throw Error('草稿和预览产物不一致');
  }
  const result = validateComponentTree(registry, artifact.tree);
  if (!result.ok) throw Error(`组件树校验失败：${result.errors[0].message}`);
  const element = await renderTree(renderer, artifact.tree);
  if (!element) throw Error('组件预览渲染失败');
  if (sequence !== previewSequence || draft.id !== field('draft-id') || draft.baseRevision !== currentRevision()) {
    throw Error('草稿选择已变化，请重新预览');
  }
  byId('preview').replaceChildren(element);
  byId('baseline-json').textContent = JSON.stringify(previous?.tree ?? null, null, 2);
  byId('candidate-json').textContent = JSON.stringify(artifact.tree, null, 2);
  byId('artifact-hash').value = artifact.hash;
  previewed = { draftId: draft.id, hash: artifact.hash, baseRevision: draft.baseRevision, intent: draft.intent, expiresAt: artifact.expiresAt };
  byId('approve-button').disabled = false;
  return `预览成功：${draft.intent}，hash ${artifact.hash}，基线 ${draft.baseRevision}`;
}));
byId('approve-button').addEventListener('click', run(async () => {
  const selected = requirePreview();
  const minutes = Number(field('expires-minutes'));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 15) throw Error('批准有效分钟须在 1–15 之间');
  const approval = await call('/ops/approve', { draftId: selected.draftId, artifactHash: selected.hash,
    expiresAt: Math.min(Date.now() + minutes * 60_000, selected.expiresAt) });
  if (approval.artifactHash !== selected.hash || approval.baseRevision !== selected.baseRevision) {
    throw Error('批准结果和预览不一致');
  }
  approved = selected;
  byId(selected.intent === 'rollback' ? 'rollback-button' : 'publish-button').disabled = false;
  return `已批准产物 ${selected.hash}；尚未发布。`;
}));
async function commit(action) {
  const selected = requirePreview();
  if (approved !== selected || selected.intent !== action) throw Error('当前草稿尚未批准');
  const endpoint = action === 'rollback' ? '/ops/rollback/commit' : '/ops/publish';
  const receipt = await call(endpoint, { draftId: selected.draftId, artifactHash: selected.hash,
    expectedRevision: selected.baseRevision, idempotencyKey: crypto.randomUUID() });
  resetPreview();
  byId('base-revision').value = String(receipt.revision);
  return `${action === 'rollback' ? '回滚' : '发布'}成功：修订 ${receipt.revision}`;
}
byId('publish-button').addEventListener('click', run(() => commit('publish')));
byId('rollback-button').addEventListener('click', run(() => commit('rollback')));
