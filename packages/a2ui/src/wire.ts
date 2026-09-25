import type { ComponentNode } from "@ai-slot/registry";
import type { WireFormat } from "@ai-slot/runtime";
import { adjacencyToTree } from "./adjacency.js";
import type { A2uiComponent, A2uiMessage } from "./types.js";

export interface A2uiWireOptions {
  /** A2UI 组件名 → 注册表组件名。优先级最高；未命中的名字保留原样（交给渲染器 defs 表）。 */
  mappings?: Record<string, string>;
}

function isEnvelope(m: unknown): m is A2uiMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    ("createSurface" in m || "updateComponents" in m || "deleteSurface" in m || "updateDataModel" in m)
  );
}

/**
 * 结构检测：messages 包裹对象、信封数组、单个信封对象均可。
 * 判据与原生 AiRenderResponse {version:1, slot, tree} 结构不重叠（有专项测试钉死）。
 */
export function detectA2ui(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  if ("messages" in data) return Array.isArray((data as { messages: unknown }).messages);
  if (Array.isArray(data)) return data.length > 0 && data.every(isEnvelope);
  return isEnvelope(data);
}

/** 抽取消息列表：兼容 {name, description, messages} 包裹、裸数组、单信封。 */
function extractMessages(data: unknown): A2uiMessage[] | null {
  if (typeof data !== "object" || data === null) return null;
  if ("messages" in data) {
    const msgs = (data as { messages: unknown }).messages;
    return Array.isArray(msgs) && msgs.every(isEnvelope) ? (msgs as A2uiMessage[]) : null;
  }
  if (Array.isArray(data)) return data.every(isEnvelope) ? (data as A2uiMessage[]) : null;
  return isEnvelope(data) ? [data as A2uiMessage] : null;
}

/** 解析 A2UI 输出为组件树。任何结构异常返回 null（调用方静默兜底）。 */
export function parseA2ui(data: unknown, opts: A2uiWireOptions = {}): ComponentNode | null {
  const messages = extractMessages(data);
  if (!messages || messages.length === 0) return null;
  const firstSurfaceId = messages.find((m) => m.createSurface)?.createSurface?.surfaceId;
  let components: A2uiComponent[] | null = null;
  const index = new Map<string, number>();
  for (const message of messages) {
    const del = message.deleteSurface;
    // deleteSurface 指向所选 surface：内容被撤 → null 兜底
    if (del && (firstSurfaceId === undefined || del.surfaceId === firstSurfaceId)) return null;
    const update = message.updateComponents;
    if (!update) continue;
    // 取首个 surface，其余忽略
    if (firstSurfaceId !== undefined && update.surfaceId !== firstSurfaceId) continue;
    components ??= [];
    for (const comp of Array.isArray(update.components) ? update.components : []) {
      const at = typeof comp?.id === "string" ? index.get(comp.id) : undefined;
      if (at === undefined) {
        if (typeof comp?.id === "string") index.set(comp.id, components.push(comp) - 1);
        else components.push(comp); // 非法 id 交给 adjacencyToTree 判 null
      } else {
        components[at] = comp; // 同 id 后帧覆盖
      }
    }
  }
  if (!components) return null;
  const tree = adjacencyToTree(components);
  if (!tree) return null;
  return rewriteTree(tree, opts.mappings ?? {});
}

/** 名字改写 + 属性降级：mappings 改名；action 丢弃；{path} 绑定视为 prop 缺失（required 缺失由 validator 拒绝）。 */
function rewriteTree(node: ComponentNode, mappings: Record<string, string>): ComponentNode {
  const cleaned = cleanProps(node.props);
  return {
    component: mappings[node.component] ?? node.component,
    ...(cleaned ? { props: cleaned } : {}),
    ...(node.children?.length ? { children: node.children.map((c) => rewriteTree(c, mappings)) } : {}),
    ...(node.slots ? { slots: node.slots } : {}),
  };
}

function cleanProps(props: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "action") continue; // 交互降级：内容槽位无 agent 回程
    if (isPathBinding(value)) continue; // 绑定降级：数据模型在内容槽位无意义
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isPathBinding(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "path" in value;
}

/** 免配置默认实例。导入方自行 registerWireFormat("a2ui", a2uiWireFormat)——本包不隐式注册。 */
export const a2uiWireFormat: WireFormat = {
  detect: detectA2ui,
  parse: (data) => parseA2ui(data),
};

/** 带配置（mappings）的工厂。 */
export function createA2uiWireFormat(opts: A2uiWireOptions = {}): WireFormat {
  return { detect: detectA2ui, parse: (data) => parseA2ui(data, opts) };
}
