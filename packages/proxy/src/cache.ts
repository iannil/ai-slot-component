/** 双层缓存：fresh TTL 内直接返回；超过 TTL 但在 stale 窗口内可作为降级结果返回。 */

export interface CacheEntry<T> {
  value: T;
  /** fresh 截止时刻（ms 时间戳） */
  expiresAt: number;
  /** stale 截止时刻，之后彻底删除 */
  staleUntil: number;
}

export class MemoryCacheStore {
  private map = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string, now: number): CacheEntry<T> | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (now >= entry.staleUntil) {
      this.map.delete(key);
      return undefined;
    }
    return entry as CacheEntry<T>;
  }

  set<T>(key: string, value: T, ttlMs: number, staleMs: number, now: number): void {
    this.map.set(key, { value, expiresAt: now + ttlMs, staleUntil: now + ttlMs + staleMs });
  }
}

export interface CacheLookup<T> {
  value: T;
  status: "fresh" | "stale";
}

export function lookup<T>(store: MemoryCacheStore, key: string, now: number): CacheLookup<T> | undefined {
  const entry = store.get<T>(key, now);
  if (!entry) return undefined;
  return { value: entry.value, status: now < entry.expiresAt ? "fresh" : "stale" };
}

/** djb2 哈希：同步、零依赖，足够做缓存 key（非安全用途）。 */
export function hashKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/** 用户提示词规范化：trim + 小写 + 合并空白，提高 L2 缓存命中率。 */
export function normalizeUserPrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

/** L1 开发者路径 key：hash(slotId + 内容版本 + 提示词版本)。 */
export function developerCacheKey(slotId: string, contentVersion: string, promptVersion: string): string {
  return `dev:${hashKey(`${slotId}|${contentVersion}|${promptVersion}`)}`;
}

/** L2 用户路径 key：hash(slotId + 规范化用户提示词)。 */
export function userCacheKey(slotId: string, userPrompt: string): string {
  return `usr:${hashKey(`${slotId}|${normalizeUserPrompt(userPrompt)}`)}`;
}
