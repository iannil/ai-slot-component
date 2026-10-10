import { defineRegistry, type ComponentNode } from '@ai-slot/registry';
import type { Environment, Principal, Source } from './types.js';

export const card = (title: string): ComponentNode => ({
  component: 'card',
  props: { title, price: '¥99', link: 'https://example.com/' },
});

export function policyFixture(): { env: Environment; source: Source; owner: Principal; agent: Principal } {
  const source: Source = { id: 'cms', version: 's1', expiresAt: 20_000, data: { price: '¥99' } };
  const env: Environment = {
    registry: defineRegistry({ components: {
      card: { description: '商品卡片', props: { title: 'string', link: 'string', price: 'string' }, required: ['title', 'link', 'price'], slots: ['default', 'aside'] },
      note: { description: '备注', props: { text: 'string' }, required: ['text'] },
    } }),
    policies: { hero: {
      slotId: 'hero', registryVersion: 'r1', rendererVersion: 'v1', sourceId: 'cms',
      allowedComponents: ['card'],
      lockedProps: [{ component: 'card', prop: 'price', sourceField: 'price' }],
      urlProps: [{ component: 'card', prop: 'link' }],
      allowedOrigins: ['https://example.com'],
    } },
    readSource: async () => source,
    now: () => 1000,
    notify: () => undefined,
  };
  const owner: Principal = { id: 'owner', grants: { hero: ['read', 'draft', 'approve', 'publish', 'rollback'] } };
  const agent: Principal = { id: 'agent', grants: { hero: ['read', 'draft', 'publish', 'rollback'] } };
  return { env, source, owner, agent };
}
