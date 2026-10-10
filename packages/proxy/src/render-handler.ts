import { validateComponentTree, type AiRenderResponse, type ComponentNode } from "@ai-slot/registry";
import { MemoryCacheStore, lookup } from "./cache.js";
import type { RenderHandlerOptions } from "./provider.js";
import { json, sse } from "./render-response.js";

export function createRenderHandler(opts: RenderHandlerOptions): (req: Request) => Promise<Response> {
  if (![opts.namespace, opts.registryVersion, opts.provider.id].every(v => typeof v === "string" && v.length > 0)) {
    throw new Error("namespace、registryVersion 与 provider.id 必须非空");
  }
  const store = opts.store ?? new MemoryCacheStore();
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? 60_000;
  const stale = opts.staleMs ?? 0;
  if (![ttl, stale].every(v => Number.isFinite(v) && v >= 0)) throw new Error("缓存时间必须为非负有限数");

  return async (req: Request): Promise<Response> => {
    const match = new URL(req.url).pathname.match(/^\/ai-render\/([\w-]+)\/?$/);
    if (!match) return json({ error: "not_found" }, 404);
    if (req.method !== "GET") {
      const response = json({ error: "method_not_allowed" }, 405);
      response.headers.set("allow", "GET");
      return response;
    }
    const slotId = match[1];
    const wantsSSE = req.headers.get("accept")?.includes("text/event-stream") ?? false;
    const unavailable = () => json({ error: "ai_unavailable" }, 503);
    const encode = (value: AiRenderResponse) => wantsSSE ? sse(value) : json(value, 200);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const work = async (): Promise<Response> => {
      const slot = await opts.resolveSlot(slotId, controller.signal);
      if (controller.signal.aborted) return unavailable();
      if (!slot) return json({ error: "unknown_slot" }, 404);
      if (slot.slotId !== slotId || typeof slot.contentVersion !== "string" || !slot.contentVersion) return unavailable();
      const key = `provider:${JSON.stringify([
        opts.namespace, opts.provider.id, opts.registryVersion,
        slotId, slot.contentVersion, slot.promptVersion ?? "1",
      ])}`;
      const validCached = () => {
        const hit = lookup<AiRenderResponse>(store, key, now());
        const cached = hit?.value;
        return cached?.version === 1 && cached.slot === slotId &&
          validateComponentTree(opts.registry, cached.tree).ok ? hit : undefined;
      };
      const hit = validCached();
      if (hit?.status === "fresh") return encode(hit.value);
      try {
        const output = await opts.provider.produce({ slot, signal: controller.signal });
        if (controller.signal.aborted) return unavailable();
        if (!validateComponentTree(opts.registry, output).ok) throw new Error("invalid_tree");
        const response: AiRenderResponse = {
          version: 1, slot: slotId, tree: output as ComponentNode,
          meta: { reason: "data-source", sourceVersion: slot.contentVersion, registryVersion: opts.registryVersion },
        };
        store.set(key, response, ttl, stale, now());
        return encode(response);
      } catch {
        const fallback = !controller.signal.aborted && validCached();
        return fallback ? encode(fallback.value) : unavailable();
      }
    };

    const deadline = new Promise<Response>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(unavailable()); }, 8000);
    });
    try {
      const response = await Promise.race([work().catch(unavailable), deadline]);
      response.headers.set("cache-control", "no-store");
      return response;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
