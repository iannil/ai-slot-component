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

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { openFileStore } from './file-store.js';
import { createOperations } from './operations.js';

/** 每个测试使用独立的真实持久化 Store。 */
export async function makeFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ai-slot-operations-'));
  let store: Awaited<ReturnType<typeof openFileStore>> | undefined;
  try {
    store = await openFileStore(directory);
    const { env, source, owner, agent } = policyFixture();
    let activeSource = structuredClone(source);
    env.readSource = async () => structuredClone(activeSource);
    env.notify = vi.fn();
    const openedStore = store;
    const ops = createOperations(openedStore, env);
    return {
      directory, store: openedStore, env, source, owner, agent, ops,
      setSource(next: Source) { activeSource = structuredClone(next); },
      async cleanup() { await openedStore.close(); await rm(directory, { recursive: true, force: true }); },
    };
  } catch (error) {
    if (store) await store.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
