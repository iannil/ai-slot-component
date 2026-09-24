import type { Registry } from "./types.js";

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
    if (Array.isArray(n.children)) {
      for (let i = 0; i < n.children.length; i++) visit(n.children[i], `${path}.children[${i}]`, depth + 1);
    }
  }

  visit(tree, "tree", 1);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
