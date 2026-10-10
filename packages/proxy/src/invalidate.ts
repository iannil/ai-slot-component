const encoder = new TextEncoder();

export interface InvalidationChannel {
  /** GET /ai-invalidate?slot=<slotId> 的 SSE 订阅端点 */
  handler: (req: Request) => Response;
  /** 向某槽位的所有订阅者广播失效信号 */
  invalidate: (slotId: string) => void;
  /** 当前订阅者数（测试与观测用） */
  subscriberCount: (slotId: string) => number;
}

interface Subscriber {
  send(frame: Uint8Array): void;
}

/**
 * 失效推送通道（SSE）。协议：订阅后服务端按 slotId 过滤广播
 * `event: invalidate\ndata: {"slot":"<slotId>"}\n\n`，心跳为 `: ping` 注释行。
 * 接入方自行决定 invalidate() 的触发时机（数据源 webhook、定时 diff、管理端点等）。
 * 可选边界只用于有界部署；未设置时保持原有订阅与队列行为。
 */
export function createInvalidationChannel(opts: {
  heartbeatMs?: number;
  maxSubscribers?: number;
  maxQueuedFrames?: number;
} = {}): InvalidationChannel {
  const heartbeatMs = opts.heartbeatMs ?? 25_000;
  const maxSubscribers = opts.maxSubscribers ?? Infinity;
  const maxQueuedFrames = opts.maxQueuedFrames ?? Infinity;
  if ((opts.maxSubscribers !== undefined && (!Number.isSafeInteger(maxSubscribers) || maxSubscribers < 1)) ||
      (opts.maxQueuedFrames !== undefined && (!Number.isSafeInteger(maxQueuedFrames) || maxQueuedFrames < 1))) {
    throw new TypeError('订阅数和待消费帧上限必须是正整数');
  }
  const subscribers = new Map<string, Set<Subscriber>>();
  let totalSubscribers = 0;

  function subscribe(slotId: string, subscriber: Subscriber): void {
    let set = subscribers.get(slotId);
    if (!set) {
      set = new Set();
      subscribers.set(slotId, set);
    }
    set.add(subscriber);
    totalSubscribers++;
  }

  function unsubscribe(slotId: string, subscriber: Subscriber): void {
    const set = subscribers.get(slotId);
    if (!set?.delete(subscriber)) return;
    totalSubscribers--;
    if (set.size === 0) subscribers.delete(slotId);
  }

  return {
    handler(req: Request): Response {
      const slotId = new URL(req.url).searchParams.get('slot');
      if (!slotId) {
        return new Response(JSON.stringify({ error: 'missing_slot' }), {
          status: 400,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      if (totalSubscribers >= maxSubscribers) {
        return new Response(JSON.stringify({ error: 'invalidation_busy' }), {
          status: 503,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let active = true;
      const cleanup = (): void => {
        if (!active) return;
        active = false;
        unsubscribe(slotId, subscriber);
        if (heartbeat !== undefined) clearInterval(heartbeat);
      };
      const close = (): void => {
        cleanup();
        try { controller.close(); }
        catch { /* 断开的流已由 cancel 清理。 */ }
      };
      const subscriber: Subscriber = {
        send(frame) {
          if (!active) return;
          try {
            // 队列达到上限后关闭连接；客户端重连时核对当前发布指针。
            if (Number.isFinite(maxQueuedFrames) && (controller.desiredSize ?? 0) <= 0) {
              close();
              return;
            }
            controller.enqueue(frame);
          } catch { close(); }
        },
      };
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
          subscribe(slotId, subscriber);
        },
        cancel: cleanup,
      }, Number.isFinite(maxQueuedFrames) ? { highWaterMark: maxQueuedFrames } : undefined);
      heartbeat = setInterval(() => subscriber.send(encoder.encode(': ping\n\n')), heartbeatMs);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
      });
    },

    invalidate(slotId: string): void {
      const frame = encoder.encode(`event: invalidate\ndata: ${JSON.stringify({ slot: slotId })}\n\n`);
      for (const subscriber of subscribers.get(slotId) ?? []) subscriber.send(frame);
    },

    subscriberCount(slotId: string): number {
      return subscribers.get(slotId)?.size ?? 0;
    },
  };
}
