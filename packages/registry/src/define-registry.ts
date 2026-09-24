import type { ComponentDef, ComponentDefInput, PropSchema, PropSchemaInput, Registry } from "./types.js";

/** 开发者声明「AI 可用的积木清单」。输入允许字符串简写，输出为规范化后的注册表。 */
export function defineRegistry(input: { components: Record<string, ComponentDefInput> }): Registry {
  const components: Record<string, ComponentDef> = {};
  for (const [name, def] of Object.entries(input.components)) {
    components[name] = {
      description: def.description,
      props: normalizeProps(def.props ?? {}),
      required: def.required ?? [],
      slots: def.slots ?? [],
      dataSources: def.dataSources ?? [],
    };
  }
  return { components };
}

function normalizeProps(props: Record<string, PropSchemaInput>): Record<string, PropSchema> {
  const out: Record<string, PropSchema> = {};
  for (const [key, schema] of Object.entries(props)) {
    out[key] = normalizeSchema(schema);
  }
  return out;
}

function normalizeSchema(schema: PropSchemaInput): PropSchema {
  if (typeof schema === "string") return { type: schema };
  const out: PropSchema = { ...schema };
  if (schema.props) out.props = normalizeProps(schema.props);
  if (schema.items) out.items = normalizeSchema(schema.items);
  return out;
}
