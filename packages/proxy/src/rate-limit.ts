/** 进程内滑动窗口限流（Edge 单实例语义；多实例部署需换外部存储，接口保持不变）。 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private opts: { limit: number; windowMs: number }) {}

  check(key: string, now: number): boolean {
    const windowStart = now - this.opts.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (list.length >= this.opts.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
}
