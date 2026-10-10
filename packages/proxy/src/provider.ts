import type { Registry } from "@ai-slot/registry";
import type { SlotSource } from "./handler.js";
import type { MemoryCacheStore } from "./cache.js";

export interface ProviderContext {
  slot: SlotSource;
  signal: AbortSignal;
}

export interface ContentProvider {
  /** 映射逻辑变化时必须更换 id */
  id: string;
  produce(context: ProviderContext): unknown | Promise<unknown>;
}

export interface RenderHandlerOptions {
  registry: Registry;
  registryVersion: string;
  /** 同一 store 中不同站点的公开内容命名空间；不是权限机制 */
  namespace: string;
  provider: ContentProvider;
  resolveSlot(slotId: string, signal: AbortSignal): SlotSource | null | Promise<SlotSource | null>;
  store?: MemoryCacheStore;
  ttlMs?: number;
  staleMs?: number;
  now?: () => number;
}
