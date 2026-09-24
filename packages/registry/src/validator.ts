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
  _options: ValidatorOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];

  const fail = (path: string, rule: ValidationError["rule"], message: string): void => {
    errors.push({ path, rule, message });
  };

  function visit(node: unknown, path: string, depth: number): void {
    if (errors.length > 0) return;
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      return fail(path, "structure", "节点必须是对象");
    }
    const n = node as Record<string, unknown>;
    if (typeof n.component !== "string") {
      return fail(path, "structure", "节点缺少 component 字段");
    }
    if (!registry.components[n.component]) {
      return fail(path, "unknown-component", `组件未注册: ${n.component}`);
    }
    const def = registry.components[n.component];
    if (n.props !== undefined) {
      validateProps(def.props, def.required, n.props, `${path}.props`);
      if (errors.length > 0) return;
    }
    if (Array.isArray(n.children)) {
      for (let i = 0; i < n.children.length; i++) visit(n.children[i], `${path}.children[${i}]`, depth + 1);
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
      const schema = schemas[key];
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
    }
  }

  visit(tree, "tree", 1);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
