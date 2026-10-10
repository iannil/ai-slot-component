import { createHash } from 'node:crypto';

export function canonical(value: unknown): string {
  const active = new Set<object>();
  function visit(v: unknown): string {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (typeof v !== 'object' || v === null) throw Error('non_json');
    if (active.has(v)) throw Error('cycle');
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw Error('non_plain');
    active.add(v);
    try {
      if (Array.isArray(v)) return '[' + Array.from(v, x => visit(x)).join(',') + ']';
      return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + visit((v as Record<string, unknown>)[k])).join(',') + '}';
    } finally { active.delete(v); }
  }
  return visit(value);
}
export const hash = (v: unknown): string => createHash('sha256').update(canonical(v)).digest('hex');
