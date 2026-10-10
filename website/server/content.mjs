import { z } from 'zod';
import { records } from './generated-content.mjs';
export { records };
export const searchSchema = z.object({ q: z.string().trim().min(1).max(200), limit: z.coerce.number().int().min(1).max(20).default(10) }).strict();
export const readSchema = z.object({ id: z.string().min(1).max(100), cursor: z.string().regex(/^(0|[1-9][0-9]{0,6})$/).optional() }).strict();
export class QueryError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new QueryError('invalid_request', 400);
  return result.data;
}
export const metadata = ({ body, ...rest }) => rest;
export function search(input) {
  const { q, limit } = parse(searchSchema, input);
  const terms = q.toLowerCase().split(/\s+/);
  const results = records.filter(r => terms.every(term => `${r.title} ${r.body}`.toLowerCase().includes(term)));
  return { results: results.slice(0, limit).map(r => ({ ...metadata(r), excerpt: r.body.slice(0, 300) })), total: results.length, suggestion: results.length ? null : '缩短关键词，或查阅 catalog 与项目仓库。' };
}
export function readContent(input) {
  const { id, cursor } = parse(readSchema, input);
  const record = records.find(r => r.id === id);
  if (!record) throw new QueryError('not_found', 404);
  const offset = Number(cursor ?? 0);
  if (offset >= record.body.length && offset !== 0) throw new QueryError('invalid_request', 400);
  const end = offset + 6000;
  return { ...metadata(record), body: record.body.slice(offset, end), nextCursor: end < record.body.length ? String(end) : null };
}
