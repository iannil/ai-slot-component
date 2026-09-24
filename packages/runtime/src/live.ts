export interface SubscribeInvalidationOptions {
  /** 通道地址，如 /ai-invalidate（slot 以查询参数附加） */
  src: string;
  slot: string;
  onInvalidate: () => void;
  /** 测试注入用 */
  fetchImpl?: typeof fetch;
}

export interface InvalidationSubscription {
  close: () => void;
}

/**
 * 订阅失效推送（fetch 流式读取 SSE）。任何失败静默——订阅是渐进增强，
 * 断开即停止（v1.1 不做自动重连）。
 */
export function subscribeInvalidation(opts: SubscribeInvalidationOptions): InvalidationSubscription {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  let closed = false;

  void (async () => {
    try {
      const res = await doFetch(`${opts.src}?slot=${encodeURIComponent(opts.slot)}`, {
        headers: { accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // 按 \n\n 分帧；最后一帧可能不完整，留在 buffer
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = frame.match(/^event: (.+)$/m)?.[1];
          const raw = frame.match(/^data: (.+)$/m)?.[1];
          if (event !== "invalidate" || !raw) continue;
          try {
            const data = JSON.parse(raw) as { slot?: unknown };
            if (data.slot === opts.slot && !closed) opts.onInvalidate();
          } catch {
            // 单帧损坏：跳过
          }
        }
      }
    } catch {
      // 静默：网络错误/中止
    }
  })();

  return {
    close() {
      closed = true;
      controller.abort();
    },
  };
}
