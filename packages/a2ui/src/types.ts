/** A2UI 信封类型（宽松）：只声明本包消费的字段。v0.9 / v0.9.1 / v1.0 信封结构一致，version 不做强校验。 */

export interface A2uiCreateSurface {
  surfaceId: string;
  catalogId?: string;
}

/** 邻接表组件：id + component + children 引用 + 自有 props（text/url/variant…、action、{path} 绑定等）。 */
export interface A2uiComponent {
  id: string;
  component: string;
  children?: string[];
  [key: string]: unknown;
}

export interface A2uiUpdateComponents {
  surfaceId: string;
  components: A2uiComponent[];
}

export interface A2uiDeleteSurface {
  surfaceId: string;
}

export interface A2uiMessage {
  version?: string;
  createSurface?: A2uiCreateSurface;
  updateComponents?: A2uiUpdateComponents;
  deleteSurface?: A2uiDeleteSurface;
  /** updateDataModel 等本包不消费的消息类型原样保留 */
  [key: string]: unknown;
}
