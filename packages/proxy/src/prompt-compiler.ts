import type { Registry } from "@ai-slot/registry";

export interface CompileInput {
  registry: Registry;
  slotId: string;
  /** 槽位的原始兜底内容（摘要） */
  originalContent: string;
  developerPrompt?: string;
  /** 已经过 sanitize 的用户提示词 */
  userPrompt?: string;
  /** 数据源解析后的实时数据 */
  data?: Record<string, unknown>;
}

export interface CompiledPrompt {
  system: string;
  user: string;
}

/**
 * 分层提示词组装。层级：系统提示（框架内置）→ 注册表约束 → 开发者提示词 → 用户提示词，
 * 越往下权限越窄；用户提示词只能以受限上下文的形式注入。
 */
export function compilePrompt(input: CompileInput): CompiledPrompt {
  const system = [
    "你是一个页面内容增强引擎。你只能输出符合给定组件注册表的组件树 JSON，禁止输出 HTML、CSS 或任何代码。",
    "所有文本内容必须是纯文本；组件名必须来自注册表；props 必须满足 Schema 约束。",
    '输出协议：{"version":1,"slot":"<槽位名>","tree":{"component":"<组件名>","props":{...},"children":[...],"slots":{"<槽位名>":[...]}}}',
    "children 对应组件声明的 default 槽位；未声明槽位的组件不允许包含子节点。",
    "组件注册表（JSON）：",
    JSON.stringify(serializeRegistry(input.registry), null, 2),
  ].join("\n");

  const userParts = [
    `槽位：${input.slotId}`,
    `原始内容：\n${input.originalContent}`,
  ];
  if (input.data && Object.keys(input.data).length > 0) {
    userParts.push(`实时数据：\n${JSON.stringify(input.data)}`);
  }
  if (input.developerPrompt) {
    userParts.push(`开发者要求：${input.developerPrompt}`);
  }
  if (input.userPrompt) {
    userParts.push(`在保持上述组件约束的前提下，按用户要求调整：${input.userPrompt}`);
  }
  return { system, user: userParts.join("\n\n") };
}

/** 给 LLM 看的注册表视图：只保留生成所需字段，不泄露 dataSources 等内部声明。 */
function serializeRegistry(registry: Registry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(registry.components)) {
    out[name] = { description: def.description, props: def.props, required: def.required, slots: def.slots };
  }
  return out;
}
