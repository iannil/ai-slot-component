import type { ComponentNode } from "@ai-slot/registry";

/**
 * 可插拔线格式：把非原生响应（如 A2UI messages）解析为内部组件树。
 * detect 必须是纯函数且不得抛异常；parse 任何失败返回 null，调用方据此静默兜底。
 */
export interface WireFormat {
  detect(data: unknown): boolean;
  parse(data: unknown): ComponentNode | null;
}

const wireFormats = new Map<string, WireFormat>();

/** 注册线格式解析器（与 registerRenderer 对称）。同 id 后注册覆盖先注册；检测按注册顺序。 */
export function registerWireFormat(id: string, format: WireFormat): void {
  wireFormats.set(id, format);
}

/** 注销线格式解析器。返回是否确实删除了条目（Map.delete 语义）。用于测试隔离与动态换装。 */
export function unregisterWireFormat(id: string): boolean {
  return wireFormats.delete(id);
}

export interface WireParseResult {
  /** 有 wire format 的 detect 命中（命中后无论 parse 成败都不再走原生路径） */
  matched: boolean;
  tree: ComponentNode | null;
}

/** 供 fetch-tree 调用：按注册顺序探测。防御性容错——detect/parse 抛异常按「未命中/失败」处理。 */
export function parseWithWireFormats(data: unknown): WireParseResult {
  for (const format of wireFormats.values()) {
    try {
      if (!format.detect(data)) continue;
    } catch {
      continue;
    }
    try {
      return { matched: true, tree: format.parse(data) };
    } catch {
      return { matched: true, tree: null };
    }
  }
  return { matched: false, tree: null };
}
