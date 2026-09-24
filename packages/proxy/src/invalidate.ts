const encoder = new TextEncoder();

export interface InvalidationChannel {
  /** GET /ai-invalidate?slot=<slotId> 的 SSE 订阅端点 */
  handler: (req: Request) => Response;
  /** 向某槽位的所有订阅者广播失效信号 */
  invalidate: (slotId: string) => void;
  /** 当前订阅者数（测试与观测用） */
  subscriberCount: (slotId: string) => number;
}

/**
 * 失效推送通道（SSE）。协议：订阅后服务端按 slotId 过滤广播
 * `event: invalidate\ndata: {"slot":"<slotId>"}\n\n`，心跳为 `: ping` 注释行。
 * 接入方自行决定 invalidate() 的触发时机（数据源 webhook、定时 diff、管理端点等）。
 */
export function createInvalidationChannel(opts: { heartbeatMs?: number } = {}): InvalidationChannel {
  const heartbeatMs = opts.heartbeatMs ?? 25_000;
  const subscribers = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();

  function subscribe(slotId: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
    let set = subscribers.get(slotId);
    if (!set) {
      set = new Set();
      subscribers.set(slotId, set);
    }
    set.add(controller);
  }

  function unsubscribe(slotId: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
    subscribers.get(slotId)?.delete(controller);
  }

  return {
    handler(req: Request): Response {
      const slotId = new URL(req.url).searchParams.get("slot");
      if (!slotId) {
        return new Response(JSON.stringify({ error: "missing_slot" }), {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      // 心跳在订阅断开（cancel）或 enqueue 抛错时清理，避免 interval 泄漏
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
          subscribe(slotId, c);
        },
        cancel() {
          unsubscribe(slotId, controller);
          if (heartbeat !== undefined) clearInterval(heartbeat);
        },
      });
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          if (heartbeat !== undefined) clearInterval(heartbeat);
        }
      }, heartbeatMs);
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    },

    invalidate(slotId: string): void {
      const frame = encoder.encode(`event: invalidate\ndata: ${JSON.stringify({ slot: slotId })}\n\n`);
      for (const controller of subscribers.get(slotId) ?? []) {
        try {
          controller.enqueue(frame);
        } catch {
          unsubscribe(slotId, controller);
        }
      }
    },

    subscriberCount(slotId: string): number {
      return subscribers.get(slotId)?.size ?? 0;
    },
  };
}
