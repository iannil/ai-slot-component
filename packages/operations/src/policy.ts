import { validateComponentTree, type ComponentNode } from '@ai-slot/registry';
import { canonical } from './canonical.js';
import { OperationError, type Action, type Environment, type Principal, type Source } from './types.js';

const MAX_TREE_BYTES = 64 * 1024;

/** 权限必须由调用者对该槽位显式授予。 */
export function authorize(actor: Principal, slotId: string, action: Action): void {
  if (!actor.grants || !Object.hasOwn(actor.grants, slotId) ||
      !Array.isArray(actor.grants[slotId]) || !actor.grants[slotId].includes(action)) {
    throw new OperationError('forbidden');
  }
}

/** 治理路径的树快照会为每个节点补 props，使旧校验器执行必填校验。 */
function normalizeNode(value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
  const node = value as Record<string, unknown>;
  if (!Object.hasOwn(node, 'props')) node.props = {};
  if (Array.isArray(node.children)) for (const child of node.children) normalizeNode(child);
  if (node.slots !== null && typeof node.slots === 'object' && !Array.isArray(node.slots)) {
    for (const children of Object.values(node.slots)) {
      if (Array.isArray(children)) for (const child of children) normalizeNode(child);
    }
  }
}

/** 检查组件、来源事实和 URL；返回与调用方输入隔离的已验证快照。 */
export function validateArtifact(env: Environment, slotId: string, tree: unknown, source: Source): ComponentNode {
  const policy = Object.hasOwn(env.policies, slotId) ? env.policies[slotId] : undefined;
  if (!policy) throw new OperationError('forbidden');
  const activePolicy = policy;
  if (!source || source.id !== policy.sourceId || !source.id?.trim() || !source.version?.trim() ||
      !Number.isFinite(source.expiresAt)) throw new OperationError('source_invalid');
  if (source.expiresAt <= env.now()) throw new OperationError('expired');
  if (!source.data || typeof source.data !== 'object' || Array.isArray(source.data)) {
    throw new OperationError('source_invalid');
  }

  let snapshot: unknown;
  try {
    const encoded = canonical(tree);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_TREE_BYTES) throw new OperationError('invalid_tree');
    snapshot = JSON.parse(encoded) as unknown;
    normalizeNode(snapshot);
  } catch {
    throw new OperationError('invalid_tree');
  }
  if (!validateComponentTree(env.registry, snapshot).ok) throw new OperationError('invalid_tree');
  const root = snapshot as ComponentNode;

  function visit(node: ComponentNode): void {
    if (!activePolicy.allowedComponents.includes(node.component)) throw new OperationError('component_denied');
    for (const rule of activePolicy.lockedProps) {
      if (rule.component !== node.component) continue;
      if (!Object.hasOwn(source.data, rule.sourceField) || !Object.hasOwn(node.props ?? {}, rule.prop)) {
        throw new OperationError('locked_prop');
      }
      try {
        if (canonical(node.props?.[rule.prop]) !== canonical(source.data[rule.sourceField])) {
          throw new OperationError('locked_prop');
        }
      } catch {
        throw new OperationError('locked_prop');
      }
    }
    for (const rule of activePolicy.urlProps) {
      if (rule.component !== node.component) continue;
      let url: URL;
      try { url = new URL(String(node.props?.[rule.prop])); }
      catch { throw new OperationError('url_denied'); }
      if (url.protocol !== 'https:' || url.username || url.password || !activePolicy.allowedOrigins.includes(url.origin)) {
        throw new OperationError('url_denied');
      }
    }
    for (const child of node.children ?? []) visit(child);
    for (const children of Object.values(node.slots ?? {})) for (const child of children) visit(child);
  }
  visit(root);
  return root;
}
