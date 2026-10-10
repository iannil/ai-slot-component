export interface SubscribeInvalidationOptions {
  /** 通道地址，如 /ai-invalidate（slot 以查询参数附加） */
  src: string;
  slot: string;
  onInvalidate: () => void;
  /** 每次成功建立连接时调用，供上层主动核对内容。 */
  onConnect?: () => void;
  /** 测试注入用 */
  fetchImpl?: typeof fetch;
  random?: () => number;
}

export interface InvalidationSubscription {
  close: () => void;
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(new Error("aborted"));
    if (signal.aborted) { stop(); return; }
    signal.addEventListener("abort", stop, { once: true });
    work.then(
      (value) => { signal.removeEventListener("abort", stop); resolve(value); },
      (error) => { signal.removeEventListener("abort", stop); reject(error); },
    );
  });
}

function retryDelay(failures: number, random: () => number): number {
  return Math.floor(Math.min(30000, 1000 * 2 ** Math.min(failures, 5)) * (0.5 + 0.5 * random()));
}

function consumeFrames(buffer: string, slot: string, notify: () => void): string {
  const frames = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = frames.pop() ?? "";
  for (const frame of frames) {
    const event = frame.match(/^event: ?(.+)$/m)?.[1];
    const raw = frame.split("\n").filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (event !== "invalidate" || !raw) continue;
    try { if (JSON.parse(raw).slot === slot) notify(); } catch {
      // 单帧损坏或回调异常：继续读取后续帧
    }
  }
  return rest;
}

/** 订阅失效推送；断线、超时和异常均静默重连。 */
export function subscribeInvalidation(opts: SubscribeInvalidationOptions): InvalidationSubscription {
  const doFetch = opts.fetchImpl ?? fetch;
  const random = opts.random ?? Math.random;
  const url = `${opts.src}${opts.src.includes("?") ? "&" : "?"}slot=${encodeURIComponent(opts.slot)}`;
  let closed = false;
  let failures = 0;
  let currentController: AbortController | undefined;
  let currentReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };

  void (async () => {
    while (!closed) {
      const controller = new AbortController();
      currentController = controller;
      let connectedAt: number | undefined;
      try {
        timer = setTimeout(() => controller.abort(), 8000);
        const res = await abortable(doFetch(url, {
          headers: { accept: "text/event-stream" }, signal: controller.signal,
        }), controller.signal);
        clearTimer();
        if (!res.ok || !res.body) throw new Error("invalid SSE response");
        if (closed) break;
        connectedAt = Date.now();
        try { opts.onConnect?.(); } catch { /* 观察回调不能影响订阅 */ }
        const reader = res.body.getReader();
        currentReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          timer = setTimeout(() => controller.abort(), 60000);
          const { done, value } = await abortable(reader.read(), controller.signal);
          clearTimer();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // 在解析前限制输入；超大合法批次也按异常断线重试。
          if (buffer.length > 65536) throw new Error("SSE buffer exceeded");
          buffer = consumeFrames(buffer, opts.slot, () => {
            failures = 0;
            if (!closed) opts.onInvalidate();
          });
        }
      } catch {
        // 网络、超时、输入异常和主动取消均不影响页面兜底内容。
      } finally {
        clearTimer();
        controller.abort();
        if (currentReader) void currentReader.cancel().catch(() => {});
        currentReader = undefined;
        currentController = undefined;
      }
      if (closed) break;
      if (connectedAt !== undefined && Date.now() - connectedAt >= 30000) failures = 0;
      await new Promise<void>((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, retryDelay(failures++, random));
      });
      wake = undefined;
      clearTimer();
    }
  })();

  return {
    close() {
      if (closed) return;
      closed = true;
      clearTimer();
      currentController?.abort();
      if (currentReader) void currentReader.cancel().catch(() => {});
      wake?.();
    },
  };
}
