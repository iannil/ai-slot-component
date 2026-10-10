import { expect, it } from 'vitest';
import { canonical, hash } from './canonical.js';

it('键顺序不影响hash，数组顺序影响hash，拒绝非JSON', () => {
  expect(hash({ b: 2, a: 1 })).toBe(hash({ a: 1, b: 2 }));
  expect(hash([1, 2])).not.toBe(hash([2, 1]));
  expect(() => canonical({ x: undefined })).toThrow();
  expect(() => canonical({ x: Number.NaN })).toThrow();
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(() => canonical(cyclic)).toThrow();
});
