import { readFile } from 'node:fs/promises';
import { defineRegistry } from '@ai-slot/registry';
import { createCampaignSource, validateCampaignUrl } from '../cms-campaign-slot/source.mjs';

export const registry = defineRegistry({ components: {
  card: { description: '商品卡片', props: { title: 'string', price: 'string', link: 'string' }, required: ['title', 'price', 'link'] },
} });
export const policy = {
  slotId: 'hero', registryVersion: 'r1', rendererVersion: 'v1', sourceId: 'cms',
  allowedComponents: ['card'],
  lockedProps: [{ component: 'card', prop: 'price', sourceField: 'price' }],
  urlProps: [{ component: 'card', prop: 'link' }],
  allowedOrigins: ['https://example.com'],
};

/** 来源快照须由运营手工更新版本和有效期；读取不会延长有效期。 */
export function createEnvironment({ sourceFile, cmsUrl, fetchImpl, readSource, notify = () => {} } = {}) {
  let sourceId = policy.sourceId;
  if (cmsUrl) {
    const match = validateCampaignUrl(cmsUrl).pathname.match(/\/wp-json\/ai-slot\/v1\/campaign\/([1-9]\d*)\/?$/);
    if (!match) throw new Error('cms_url_invalid');
    sourceId = `campaign-${match[1]}`;
  }
  const activePolicy = { ...policy, sourceId };
  return {
    registry,
    policies: { hero: activePolicy },
    now: () => Date.now(),
    readSource: readSource ?? (cmsUrl
      ? createCampaignSource({ url: cmsUrl, fetchImpl, allowedOrigins: activePolicy.allowedOrigins })
      : async () => JSON.parse(await readFile(sourceFile, { encoding: 'utf8', signal: AbortSignal.timeout(8000) }))),
    notify,
  };
}
