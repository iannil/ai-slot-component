import { describe, expect, it } from 'vitest';
import { authorize, validateArtifact } from './policy.js';
import { card, policyFixture } from './test-fixture.js';
import { OperationError } from './types.js';

const valid = () => card('Hi');

describe('槽位权限', () => {
  it('仅允许明确授予的槽位动作', () => {
    const { owner, agent } = policyFixture();
    expect(() => authorize(owner, 'hero', 'approve')).not.toThrow();
    expect(() => authorize(agent, 'hero', 'approve')).toThrow('forbidden');
    expect(() => authorize(owner, 'missing', 'read')).toThrow('forbidden');
    expect(() => authorize({ id: 'empty', grants: {} }, 'hero', 'publish')).toThrow('forbidden');
  });

  it('不继承原型链上的授权', () => {
    const grants = Object.create({ hero: ['publish'] }) as Record<string, ('publish')[]>;
    expect(() => authorize({ id: 'actor', grants }, 'hero', 'publish')).toThrow('forbidden');
  });
});

describe('组件树和来源策略', () => {
  it('返回独立快照并补齐每个节点的 props', () => {
    const { env, source } = policyFixture();
    const tree = valid();
    tree.children = [valid()];
    tree.slots = { aside: [valid()] };
    const result = validateArtifact(env, 'hero', tree, source);
    expect(result).not.toBe(tree);
    expect(result.children?.[0]).not.toBe(tree.children[0]);
    expect(result.slots?.aside[0]).not.toBe(tree.slots.aside[0]);
    tree.props!.title = 'changed';
    expect(result.props?.title).toBe('Hi');
  });

  it.each(['javascript:alert(1)', 'https://evil.test/offer', 'https://user:pass@example.com/'])('拒绝链接 %s', link => {
    const { env, source } = policyFixture();
    expect(() => validateArtifact(env, 'hero', { component: 'card', props: { title: 'Hi', price: '¥99', link } }, source)).toThrow('url_denied');
  });

  it('缺失必填 props 与改写事实被拒绝', () => {
    const { env, source } = policyFixture();
    expect(() => validateArtifact(env, 'hero', { component: 'card' }, source)).toThrow();
    expect(() => validateArtifact(env, 'hero', { component: 'card', props: { title: 'Hi', price: '¥1', link: 'https://example.com/' } }, source)).toThrow('locked_prop');
  });

  it('嵌套节点缺少必填 props 也被拒绝', () => {
    const { env, source } = policyFixture();
    const tree = valid();
    tree.children = [{ component: 'card' }];
    expect(() => validateArtifact(env, 'hero', tree, source)).toThrow('invalid_tree');
    tree.children = [valid()];
    tree.slots = { aside: [{ component: 'card' }] };
    expect(() => validateArtifact(env, 'hero', tree, source)).toThrow('invalid_tree');
  });

  it('未在策略允许清单中的注册组件被拒绝', () => {
    const { env, source } = policyFixture();
    expect(() => validateArtifact(env, 'hero', { component: 'note', props: { text: 'Hi' } }, source)).toThrow('component_denied');
    expect(() => validateArtifact(env, 'hero', { component: 'unknown', props: {} }, source)).toThrow('invalid_tree');
  });

  it('递归检查 children 和全部具名 slots 中的锁与链接', () => {
    const { env, source } = policyFixture();
    const tree = valid();
    tree.children = [{ component: 'card', props: { title: 'child', price: '¥1', link: 'https://example.com/' } }];
    expect(() => validateArtifact(env, 'hero', tree, source)).toThrow('locked_prop');
    tree.children = [valid()];
    tree.slots = { aside: [{ component: 'card', props: { title: 'slot', price: '¥99', link: 'https://evil.test/' } }] };
    expect(() => validateArtifact(env, 'hero', tree, source)).toThrow('url_denied');
  });

  it('锁定字段缺失时使用 locked_prop 错误', () => {
    const { env, source } = policyFixture();
    delete source.data.price;
    expect(() => validateArtifact(env, 'hero', valid(), source)).toThrow('locked_prop');
  });

  it('拒绝来源 id 不匹配、空版本和过期来源', () => {
    const { env, source } = policyFixture();
    expect(() => validateArtifact(env, 'hero', valid(), { ...source, id: 'other' })).toThrow('source_invalid');
    expect(() => validateArtifact(env, 'hero', valid(), { ...source, id: '' })).toThrow('source_invalid');
    expect(() => validateArtifact(env, 'hero', valid(), { ...source, version: '' })).toThrow('source_invalid');
    expect(() => validateArtifact(env, 'hero', valid(), { ...source, expiresAt: 1000 })).toThrow('expired');
  });

  it('来源字段运行时类型非法时统一返回 source_invalid', () => {
    const { env, source } = policyFixture();
    const malformed: unknown[] = [
      null, undefined, 42, [],
      { ...source, id: 7 },
      { ...source, version: 7 },
      { ...source, version: { trim: null } },
      { ...source, expiresAt: Number.NaN },
      { ...source, expiresAt: Number.POSITIVE_INFINITY },
      { ...source, data: null },
    ];
    for (const value of malformed) {
      const run = () => validateArtifact(env, 'hero', valid(), value as typeof source);
      expect(run).toThrow(OperationError);
      expect(run).toThrow('source_invalid');
    }
  });

  it('拒绝未知槽位、循环和非 JSON 树以及超过 64KiB 的树', () => {
    const { env, source } = policyFixture();
    expect(() => validateArtifact(env, 'missing', valid(), source)).toThrow('forbidden');
    const cycle: { component: string; children?: unknown[] } = { component: 'card' };
    cycle.children = [cycle];
    expect(() => validateArtifact(env, 'hero', cycle, source)).toThrow('invalid_tree');
    expect(() => validateArtifact(env, 'hero', { ...valid(), extra: undefined }, source)).toThrow('invalid_tree');
    expect(() => validateArtifact(env, 'hero', { ...valid(), extra: 'x'.repeat(65_536) }, source)).toThrow('invalid_tree');
  });

  it('所有拒绝均为 OperationError', () => {
    const { env, source } = policyFixture();
    expect(() => validateArtifact(env, 'hero', { component: 'card' }, source)).toThrow(OperationError);
  });
});
