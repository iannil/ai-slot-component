/** AI 输出协议与组件注册表的核心类型。 */

export type PropType = "string" | "number" | "boolean" | "object" | "array";

export interface PropSchema {
  type: PropType;
  /** string：最大长度 */
  maxLength?: number;
  /** array：最大元素数 */
  maxItems?: number;
  enum?: readonly (string | number | boolean)[];
  /** object：嵌套属性（允许字符串简写，defineRegistry 会规范化） */
  props?: Record<string, PropSchemaInput>;
  /** array：元素 Schema */
  items?: PropSchemaInput;
  required?: boolean;
}

/** 注册表输入侧的 props 写法：完整 Schema 或 "string" 之类的简写。 */
export type PropSchemaInput = PropType | PropSchema;

export interface ComponentDefInput {
  description: string;
  props?: Record<string, PropSchemaInput>;
  required?: string[];
  /** 允许的槽位名；"default" 对应组件树的 children 字段 */
  slots?: string[];
  dataSources?: string[];
}

export interface ComponentDef {
  description: string;
  props: Record<string, PropSchema>;
  required: string[];
  slots: string[];
  dataSources: string[];
}

export interface Registry {
  components: Record<string, ComponentDef>;
}

/** AI 输出的组件树节点。 */
export interface ComponentNode {
  component: string;
  props?: Record<string, unknown>;
  /** 默认槽位（要求组件声明 slots 含 "default"） */
  children?: ComponentNode[];
  /** 命名槽位（槽位名必须在组件声明的 slots 内） */
  slots?: Record<string, ComponentNode[]>;
}

/** 代理返回给客户端的响应协议。 */
export interface AiRenderResponse {
  version: 1;
  slot: string;
  tree: ComponentNode;
  meta?: Record<string, unknown>;
}
