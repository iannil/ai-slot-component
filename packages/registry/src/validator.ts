import type { PropSchema, Registry } from "./types.js";

export interface ValidatorOptions {
  /** 嵌套深度上限，默认 5 */
  maxDepth?: number;
  /** 节点总数上限，默认 50 */
  maxNodes?: number;
}

export interface ValidationError {
  path: string;
  rule: "structure" | "unknown-component" | "props" | "slot" | "depth" | "nodes";
  message: string;
}

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

/**
 * OutputValidator：AI 输出永远被视为不可信输入。
 * 纯函数，第一个错误即停（fail-fast）。
 */
export function validateComponentTree(
  registry: Registry,
  tree: unknown,
  options: ValidatorOptions = {},
): ValidationResult {
  const maxDepth = options.maxDepth ?? 5;
  const maxNodes = options.maxNodes ?? 50;
  const errors: ValidationError[] = [];
  let nodeCount = 0;

  const fail = (path: string, rule: ValidationError["rule"], message: string): void => {
    errors.push({ path, rule, message });
  };

  function visit(node: unknown, path: string, depth: number): void {
    if (errors.length > 0) return;
    if (depth > maxDepth) return fail(path, "depth", `嵌套深度超过上限 ${maxDepth}`);
    nodeCount += 1;
    if (nodeCount > maxNodes) return fail(path, "nodes", `节点总数超过上限 ${maxNodes}`);
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      return fail(path, "structure", "节点必须是对象");
    }
    const n = node as Record<string, unknown>;
    if (typeof n.component !== "string") {
      return fail(path, "structure", "节点缺少 component 字段");
    }
    // Object.hasOwn：只认自有属性，阻断 "toString"/"constructor" 之类沿原型链命中的伪造组件名
    if (!Object.hasOwn(registry.components, n.component)) {
      return fail(path, "unknown-component", `组件未注册: ${n.component}`);
    }
    const def = registry.components[n.component];
    if (n.props !== undefined) {
      validateProps(def.props, def.required, n.props, `${path}.props`);
      if (errors.length > 0) return;
    }
    if (n.children !== undefined) {
      if (!def.slots.includes("default")) {
        return fail(path, "slot", `组件 ${n.component} 不允许 children`);
      }
      if (!Array.isArray(n.children)) return fail(path, "structure", "children 必须是数组");
      for (let i = 0; i < n.children.length; i++) visit(n.children[i], `${path}.children[${i}]`, depth + 1);
    }
    if (errors.length > 0) return;
    if (n.slots !== undefined) {
      if (typeof n.slots !== "object" || n.slots === null || Array.isArray(n.slots)) {
        return fail(path, "structure", "slots 必须是对象");
      }
      for (const [slotName, nodes] of Object.entries(n.slots as Record<string, unknown>)) {
        if (!def.slots.includes(slotName)) {
          return fail(path, "slot", `组件 ${n.component} 不支持槽位 ${slotName}`);
        }
        if (!Array.isArray(nodes)) return fail(path, "structure", `槽位 ${slotName} 必须是数组`);
        for (let i = 0; i < nodes.length; i++) visit(nodes[i], `${path}.slots.${slotName}[${i}]`, depth + 1);
        if (errors.length > 0) return;
      }
    }
  }

  function validateProps(
    schemas: Record<string, PropSchema>,
    required: string[],
    value: unknown,
    path: string,
  ): void {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return fail(path, "props", "props 必须是对象");
    }
    const props = value as Record<string, unknown>;
    for (const key of required) {
      if (!(key in props)) return fail(`${path}.${key}`, "props", `缺少必填 prop: ${key}`);
    }
    for (const [key, v] of Object.entries(props)) {
      // Object.hasOwn：只认自有属性，阻断 "constructor"/"__proto__" 之类沿原型链命中的未声明 prop
      const schema = Object.hasOwn(schemas, key) ? schemas[key] : undefined;
      if (!schema) return fail(`${path}.${key}`, "props", `未声明的 prop: ${key}`);
      validateValue(schema, v, `${path}.${key}`);
      if (errors.length > 0) return;
    }
  }

  function validateValue(schema: PropSchema, value: unknown, path: string): void {
    switch (schema.type) {
      case "string": {
        if (typeof value !== "string") return fail(path, "props", "期望 string");
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
          return fail(path, "props", `超过 maxLength ${schema.maxLength}`);
        }
        if (schema.enum && !schema.enum.includes(value)) return fail(path, "props", "不在枚举范围内");
        return;
      }
      case "number": {
        if (typeof value !== "number" || !Number.isFinite(value)) return fail(path, "props", "期望 number");
        if (schema.enum && !schema.enum.includes(value)) return fail(path, "props", "不在枚举范围内");
        return;
      }
      case "boolean": {
        if (typeof value !== "boolean") return fail(path, "props", "期望 boolean");
        return;
      }
      case "object": {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          return fail(path, "props", "期望 object");
        }
        if (schema.props) validateProps(schema.props as Record<string, PropSchema>, [], value, path);
        return;
      }
      case "array": {
        if (!Array.isArray(value)) return fail(path, "props", "期望 array");
        if (schema.maxItems !== undefined && value.length > schema.maxItems) {
          return fail(path, "props", `超过 maxItems ${schema.maxItems}`);
        }
        if (schema.items) {
          for (let i = 0; i < value.length; i++) {
            validateValue(schema.items as PropSchema, value[i], `${path}[${i}]`);
            if (errors.length > 0) return;
          }
        }
        return;
      }
      default: {
        // 防御未知 schema.type（如原型链污染传入的非 PropSchema 对象）：宁可拒绝也不静默放行
        return fail(path, "props", "未知的 schema 类型");
      }
    }
  }

  visit(tree, "tree", 1);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
