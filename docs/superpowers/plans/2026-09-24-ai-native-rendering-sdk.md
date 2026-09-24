# AI Native 渲染 SDK 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零实现设计文档描述的 AI Native 渲染 SDK：pnpm monorepo 下的 registry / proxy / runtime / adapter-dom 四个包 + 一个纯 HTML 端到端示例。

**Architecture:** 框架无关。AI 只输出组件树 JSON（不输出 HTML），服务端代理（标准 Fetch handler）负责提示词编译、LLM 调用、输出校验、双层缓存与限流降级；客户端 `<ai-slot>` 自定义元素通过渲染适配器把组件树变成真实 DOM，任何失败静默回退到兜底内容。

**Tech Stack:** TypeScript（strict）、pnpm workspaces、tsup（ESM 输出）、Vitest（jsdom 环境测客户端）、Playwright（e2e）、零运行时依赖。

**Spec:** `docs/superpowers/specs/2026-09-24-ai-native-rendering-sdk-design.md`

## Global Constraints

- 所有包**零运行时依赖**（devDependencies 允许 tsup/typescript/vitest/jsdom/playwright）。
- Node >= 18（依赖全局 `fetch` / `Request` / `Response` / `AbortController`）。
- TypeScript `strict: true`；相对导入一律带 `.js` 扩展名。
- 文档、注释、提交信息使用**中文**。
- **AI 输出永远视为不可信输入**：校验失败即丢弃并回退兜底，不白屏、不向用户报错。
- 用户提示词不直接发给 LLM，以固定前缀作为受限上下文注入；提交前做长度限制（500 字符）与控制字符过滤。
- LLM 调用必须有超时（默认 8000ms）、token 预算上限（默认 2000）与失败重试 1 次。
- LLM API 密钥只允许出现在服务端代理，客户端包中禁止出现任何密钥相关参数。
- **v1 明确不做**（设计文档有提及但本计划推迟，属刻意范围裁剪）：SSE 流式渲染、WebSocket 失效推送、CI 构建时预生成工具、React/Vue 适配器（`registerRenderer` 接口已预留）。设计文档「YAGNI」节列出的各项同样不实现。

## 文件结构

```
├── package.json                    # 根：private，聚合脚本
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── registry/                   # @ai-slot/registry — 协议类型、defineRegistry、OutputValidator
│   │   ├── package.json  tsconfig.json  vitest.config.ts
│   │   └── src/
│   │       ├── types.ts            # PropSchema / ComponentDef / Registry / ComponentNode / AiRenderResponse
│   │       ├── define-registry.ts  # defineRegistry（简写 props 规范化）
│   │       ├── validator.ts        # validateComponentTree（OutputValidator，纯函数）
│   │       └── index.ts
│   ├── proxy/                      # @ai-slot/proxy — 服务端代理（标准 Fetch handler）
│   │   ├── package.json  tsconfig.json  vitest.config.ts
│   │   └── src/
│   │       ├── cache.ts            # MemoryCacheStore / lookup / key 生成 / 用户提示词规范化
│   │       ├── prompt-compiler.ts  # compilePrompt（分层提示词组装）
│   │       ├── llm-client.ts       # LLMClient 接口 / LLMError / withRetry
│   │       ├── openai-client.ts    # createOpenAIClient（OpenAI 兼容适配器）
│   │       ├── rate-limit.ts       # RateLimiter（滑动窗口）
│   │       ├── sanitize.ts         # sanitizeUserPrompt
│   │       ├── handler.ts          # createAiRenderHandler（GET/POST 流水线 + 降级链）
│   │       └── index.ts
│   ├── runtime/                    # @ai-slot/runtime — <ai-slot> 自定义元素 + 渲染器注册
│   │   ├── package.json  tsconfig.json  vitest.config.ts
│   │   └── src/
│   │       ├── renderer.ts         # registerRenderer / getRenderer / renderTree
│   │       ├── ai-slot.ts          # AiSlotElement（挂载→加载→渲染→降级、editable、refresh-interval）
│   │       └── index.ts
│   └── adapter-dom/                # @ai-slot/adapter-dom — 内置 DOM 渲染器
│       ├── package.json  tsconfig.json  vitest.config.ts
│       └── src/
│           ├── dom-renderer.ts     # createDomRenderer
│           └── index.ts
└── examples/
    └── plain-html/                 # 纯 HTML 老站接入示例（e2e 验收）
        ├── package.json  playwright.config.ts  server.mjs  registry.mjs  components.mjs
        ├── index.html
        └── e2e/ai-slot.spec.ts
```

依赖方向：`proxy → registry`，`runtime → registry`，`adapter-dom → runtime + registry`，`example → 全部`。registry 不依赖任何包。

---

### Task 1: Monorepo 脚手架

**Files:**
- Create: `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`
- Create: `packages/{registry,proxy,runtime,adapter-dom}/package.json`、`tsconfig.json`、`vitest.config.ts`、`src/index.ts`（空占位）
- Modify: `AGENTS.md`（补充「构建与测试命令」一节）

**Interfaces:**
- Produces: 包名 `@ai-slot/registry` / `@ai-slot/proxy` / `@ai-slot/runtime` / `@ai-slot/adapter-dom`（后续任务通过 `workspace:*` 互相引用）；根脚本 `pnpm build` / `pnpm test` / `pnpm typecheck`。

- [ ] **Step 1: 创建根配置文件**

`package.json`：

```json
{
  "name": "ai-slot-component",
  "private": true,
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

`pnpm-workspace.yaml`：

```yaml
packages:
  - "packages/*"
  - "examples/*"
```

`tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "useDefineForClassFields": true
  }
}
```

- [ ] **Step 2: 创建四个包的 package.json**

`packages/registry/package.json`（其余包结构相同，只改 name 与额外字段，见下）：

```json
{
  "name": "@ai-slot/registry",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

差异点：
- `packages/proxy/package.json`：`name` 为 `@ai-slot/proxy`，增加 `"dependencies": { "@ai-slot/registry": "workspace:*" }`。
- `packages/runtime/package.json`：`name` 为 `@ai-slot/runtime`，`dependencies` 同上；devDependencies 增加 `"jsdom": "^25.0.0"`。
- `packages/adapter-dom/package.json`：`name` 为 `@ai-slot/adapter-dom`，`dependencies` 为 `{ "@ai-slot/registry": "workspace:*", "@ai-slot/runtime": "workspace:*" }`；devDependencies 增加 `"jsdom": "^25.0.0"`。

- [ ] **Step 3: 创建四个包的 tsconfig.json、vitest.config.ts 与占位 index.ts**

`packages/registry/tsconfig.json`（proxy、runtime、adapter-dom 相同，仅 lib 不同，见下）：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "outDir": "dist"
  },
  "include": ["src"]
}
```

lib 差异：proxy 为 `["ES2022", "DOM", "DOM.Iterable"]`（需要 `Request`/`Response`/`fetch` 类型）；runtime 与 adapter-dom 为 `["ES2022", "DOM", "DOM.Iterable"]`。

`packages/registry/vitest.config.ts`（registry 用 `node` 环境；proxy 相同）：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

runtime 与 adapter-dom 的 `vitest.config.ts` 需要 jsdom 环境 + 把 workspace 依赖指向源码（避免测试前必须先 build）：

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ai-slot/registry": fileURLToPath(new URL("../registry/src/index.ts", import.meta.url)),
      "@ai-slot/runtime": fileURLToPath(new URL("../runtime/src/index.ts", import.meta.url)),
    },
  },
  test: { environment: "jsdom" },
});
```

注意：proxy 的 vitest.config.ts 也要加 `resolve.alias`（只 alias `@ai-slot/registry`），环境保持 `node`。

每个包创建占位的 `src/index.ts`：

```ts
export {};
```

- [ ] **Step 4: 安装依赖并验证**

Run: `pnpm install && pnpm typecheck && pnpm test && pnpm build`
Expected: typecheck 通过；test 提示无测试文件但退出码为 0 的包可忽略（vitest 默认 `passWithNoTests: false`，若报错则在各包 vitest.config.ts 的 `test` 中加 `passWithNoTests: true`）；build 产出各包 `dist/`。

- [ ] **Step 5: 更新 AGENTS.md 的「构建与测试命令」一节**

把「暂无」替换为：

```markdown
- 安装依赖：`pnpm install`
- 构建全部包：`pnpm build`（tsup，ESM 输出到各包 `dist/`）
- 运行全部测试：`pnpm test`（Vitest；runtime/adapter-dom 用 jsdom 环境）
- 类型检查：`pnpm typecheck`
- 单包命令：`pnpm --filter @ai-slot/<包名> test|build|typecheck`
- 端到端示例：`pnpm --filter example-plain-html test:e2e`（Playwright，首次需 `pnpm --filter example-plain-html exec playwright install chromium`）
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: 初始化 pnpm monorepo 脚手架（registry/proxy/runtime/adapter-dom）"
```

---

### Task 2: registry — 协议类型与 defineRegistry

**Files:**
- Create: `packages/registry/src/types.ts`
- Create: `packages/registry/src/define-registry.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/src/define-registry.test.ts`

**Interfaces:**
- Produces（后续所有任务依赖这些名字）：
  - `type PropType = "string" | "number" | "boolean" | "object" | "array"`
  - `interface PropSchema { type; maxLength?; maxItems?; enum?; props?; items?; required? }`
  - `type PropSchemaInput = PropType | PropSchema`
  - `interface ComponentDefInput { description: string; props?: Record<string, PropSchemaInput>; required?: string[]; slots?: string[]; dataSources?: string[] }`
  - `interface ComponentDef { description: string; props: Record<string, PropSchema>; required: string[]; slots: string[]; dataSources: string[] }`
  - `interface Registry { components: Record<string, ComponentDef> }`
  - `interface ComponentNode { component: string; props?: Record<string, unknown>; children?: ComponentNode[]; slots?: Record<string, ComponentNode[]> }`（`children` 即默认槽位 `"default"`）
  - `interface AiRenderResponse { version: 1; slot: string; tree: ComponentNode; meta?: Record<string, unknown> }`
  - `function defineRegistry(input: { components: Record<string, ComponentDefInput> }): Registry`

- [ ] **Step 1: 写失败的测试**

`packages/registry/src/define-registry.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { defineRegistry } from "./define-registry.js";

describe("defineRegistry", () => {
  it("把字符串简写 props 规范化为完整 Schema", () => {
    const registry = defineRegistry({
      components: {
        "hero-banner": {
          description: "页面顶部主视觉区",
          props: {
            title: "string",
            cta: { type: "object", props: { label: "string", href: "string" } },
          },
          slots: ["media"],
          dataSources: ["latestPosts"],
        },
      },
    });
    const def = registry.components["hero-banner"];
    expect(def.props.title).toEqual({ type: "string" });
    expect(def.props.cta).toEqual({
      type: "object",
      props: { label: { type: "string" }, href: { type: "string" } },
    });
    expect(def.slots).toEqual(["media"]);
    expect(def.dataSources).toEqual(["latestPosts"]);
  });

  it("为缺省字段补默认值", () => {
    const registry = defineRegistry({
      components: { "markdown-block": { description: "纯内容组件" } },
    });
    expect(registry.components["markdown-block"]).toEqual({
      description: "纯内容组件",
      props: {},
      required: [],
      slots: [],
      dataSources: [],
    });
  });

  it("保留 maxLength / enum 等约束", () => {
    const registry = defineRegistry({
      components: {
        "post-card": {
          description: "文章卡片",
          props: { title: { type: "string", maxLength: 60 }, level: { type: "number", enum: [1, 2, 3] } },
          required: ["title"],
        },
      },
    });
    const def = registry.components["post-card"];
    expect(def.props.title).toEqual({ type: "string", maxLength: 60 });
    expect(def.props.level).toEqual({ type: "number", enum: [1, 2, 3] });
    expect(def.required).toEqual(["title"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/registry exec vitest run src/define-registry.test.ts`
Expected: FAIL（`./define-registry.js` 模块不存在）

- [ ] **Step 3: 实现 types.ts 与 define-registry.ts**

`packages/registry/src/types.ts`：

```ts
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
```

`packages/registry/src/define-registry.ts`：

```ts
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
```

`packages/registry/src/index.ts`：

```ts
export * from "./types.js";
export { defineRegistry } from "./define-registry.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/registry exec vitest run src/define-registry.test.ts && pnpm --filter @ai-slot/registry typecheck`
Expected: 3 个测试 PASS；typecheck 通过。

- [ ] **Step 5: Commit**

```bash
git add packages/registry
git commit -m "feat(registry): 协议类型与 defineRegistry（props 简写规范化）"
```

---


### Task 3: OutputValidator — 结构与组件名校验

**Files:**
- Create: `packages/registry/src/validator.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/src/validator.test.ts`

**Interfaces:**
- Consumes: `Registry`、`ComponentNode`（Task 2）。
- Produces:
  - `interface ValidatorOptions { maxDepth?: number; maxNodes?: number }`（默认 5 / 50）
  - `interface ValidationError { path: string; rule: "structure" | "unknown-component" | "props" | "slot" | "depth" | "nodes"; message: string }`
  - `type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] }`
  - `function validateComponentTree(registry: Registry, tree: unknown, options?: ValidatorOptions): ValidationResult`（纯函数；第一个错误即停；`tree` 是 `unknown`，必须防御非对象输入）

- [ ] **Step 1: 写失败的测试**

`packages/registry/src/validator.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { defineRegistry } from "./define-registry.js";
import { validateComponentTree } from "./validator.js";

const registry = defineRegistry({
  components: {
    "hero-banner": {
      description: "主视觉",
      props: { title: { type: "string", maxLength: 60 } },
      required: ["title"],
      slots: ["default"],
    },
    "markdown-block": {
      description: "纯内容",
      props: { content: "string" },
    },
  },
});

describe("validateComponentTree — 结构与组件名", () => {
  it("接受合法的组件树", () => {
    const result = validateComponentTree(registry, {
      component: "hero-banner",
      props: { title: "你好" },
      children: [{ component: "markdown-block", props: { content: "正文" } }],
    });
    expect(result).toEqual({ ok: true });
  });

  it("拒绝伪造的组件名", () => {
    const result = validateComponentTree(registry, { component: "evil-script", props: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].rule).toBe("unknown-component");
  });

  it("拒绝非对象节点（null / 数组 / 字符串 / 数字）", () => {
    for (const bad of [null, [], "text", 42]) {
      const result = validateComponentTree(registry, bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].rule).toBe("structure");
    }
  });

  it("拒绝缺少 component 字段的节点", () => {
    const result = validateComponentTree(registry, { props: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].rule).toBe("structure");
  });

  it("错误信息带路径", () => {
    const result = validateComponentTree(registry, {
      component: "hero-banner",
      props: { title: "ok" },
      children: [{ component: "nope" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe("tree.children[0]");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/registry exec vitest run src/validator.test.ts`
Expected: FAIL（`./validator.js` 模块不存在）

- [ ] **Step 3: 实现 validator.ts（本任务只做结构 + 组件名校验，props/槽位/上限后续任务补）**

`packages/registry/src/validator.ts`：

```ts
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
    if (Array.isArray(n.children)) {
      for (let i = 0; i < n.children.length; i++) visit(n.children[i], `${path}.children[${i}]`, depth + 1);
    }
  }

  visit(tree, "tree", 1);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
```

注意 `PropSchema` 导入本任务暂用不到，先不写这行 import（Task 4 再加），避免 lint 报未使用。

`packages/registry/src/index.ts` 追加：

```ts
export * from "./validator.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/registry exec vitest run src/validator.test.ts`
Expected: 5 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/registry
git commit -m "feat(registry): OutputValidator 骨架——结构与组件名校验"
```

---

### Task 4: OutputValidator — props Schema 校验

**Files:**
- Modify: `packages/registry/src/validator.ts`（新增 `validateProps` / `validateValue`，并在 `visit` 中接入）
- Modify: `packages/registry/src/validator.test.ts`

**Interfaces:**
- Consumes: `validateComponentTree`、`PropSchema`（Task 2/3）。
- Produces: `validateComponentTree` 新增 props 规则——必填、类型、maxLength、maxItems、enum、嵌套 object/array、未声明 prop 一律拒绝。

- [ ] **Step 1: 写失败的测试**

向 `packages/registry/src/validator.test.ts` 追加：

```ts
describe("validateComponentTree — props 对抗性校验", () => {
  const strict = defineRegistry({
    components: {
      "post-card": {
        description: "文章卡片",
        props: {
          title: { type: "string", maxLength: 10 },
          level: { type: "number", enum: [1, 2, 3] },
          pinned: "boolean",
          tags: { type: "array", maxItems: 3, items: "string" },
          cta: { type: "object", props: { label: "string", href: "string" } },
        },
        required: ["title"],
      },
    },
  });

  it("拒绝超长的字符串 prop", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { title: "这是一段非常非常长的标题" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].path).toBe("tree.props.title");
  });

  it("拒绝枚举之外的值", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { title: "ok", level: 99 } });
    expect(r.ok).toBe(false);
  });

  it("拒绝类型错误的 prop", () => {
    for (const props of [{ title: 123 }, { title: "ok", pinned: "yes" }, { title: "ok", tags: "a,b" }]) {
      const r = validateComponentTree(strict, { component: "post-card", props });
      expect(r.ok).toBe(false);
    }
  });

  it("拒绝未声明的 prop（防 AI 夹带私货，如 onclick）", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { title: "ok", onclick: "alert(1)" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("props");
  });

  it("拒绝缺少必填 prop", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { pinned: true } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toContain("必填");
  });

  it("拒绝超过 maxItems 的数组", () => {
    const r = validateComponentTree(strict, { component: "post-card", props: { title: "ok", tags: ["a", "b", "c", "d"] } });
    expect(r.ok).toBe(false);
  });

  it("校验嵌套 object 的内部属性", () => {
    const bad = validateComponentTree(strict, { component: "post-card", props: { title: "ok", cta: { label: 1 } } });
    expect(bad.ok).toBe(false);
    const good = validateComponentTree(strict, { component: "post-card", props: { title: "ok", cta: { label: "开始", href: "/docs" } } });
    expect(good).toEqual({ ok: true });
  });

  it("注入文本作为字符串 prop 是合法的——它只是惰性文本，安全由『永不渲染为 HTML』保证", () => {
    const loose = defineRegistry({ components: { b: { description: "", props: { t: "string" } } } });
    const r = validateComponentTree(loose, { component: "b", props: { t: "<script>alert(1)</script>" } });
    expect(r).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/registry exec vitest run src/validator.test.ts`
Expected: 新增 8 个测试中大部分 FAIL（props 尚未校验，非法树被误判为合法）。

- [ ] **Step 3: 实现 props 校验**

在 `packages/registry/src/validator.ts` 顶部加回 import：

```ts
import type { PropSchema, Registry } from "./types.js";
```

在 `visit` 中、组件名检查之后插入 props 校验，并在 `validateComponentTree` 内（`visit` 之后）新增两个内部函数。修改后的 `visit` 片段：

```ts
    if (!registry.components[n.component]) {
      return fail(path, "unknown-component", `组件未注册: ${n.component}`);
    }
    const def = registry.components[n.component];
    if (n.props !== undefined) {
      validateProps(def.props, def.required, n.props, `${path}.props`);
      if (errors.length > 0) return;
    }
    if (Array.isArray(n.children)) {
```

新增的内部函数（放在 `visit` 函数结束之后、`visit(tree, "tree", 1)` 调用之前）：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/registry exec vitest run src/validator.test.ts`
Expected: 全部 PASS（含 Task 3 的 5 个）。

- [ ] **Step 5: Commit**

```bash
git add packages/registry
git commit -m "feat(registry): props Schema 校验（必填/类型/长度/枚举/嵌套/未声明拒绝）"
```

---

### Task 5: OutputValidator — 槽位合法性、嵌套炸弹与节点炸弹

**Files:**
- Modify: `packages/registry/src/validator.ts`（`visit` 增加深度/节点计数与槽位校验）
- Modify: `packages/registry/src/validator.test.ts`

**Interfaces:**
- Consumes: `validateComponentTree`、`ValidatorOptions`（Task 3）。
- Produces: `validateComponentTree` 完整行为——`children` 要求组件声明 `"default"` 槽位；命名槽位必须在声明内；深度默认上限 5、节点总数默认上限 50，均可通过 options 覆盖。

- [ ] **Step 1: 写失败的测试**

向 `packages/registry/src/validator.test.ts` 追加：

```ts
describe("validateComponentTree — 槽位与数量上限", () => {
  const reg = defineRegistry({
    components: {
      layout: { description: "", slots: ["default", "media"] },
      leaf: { description: "" },
    },
  });

  it("拒绝向未声明 default 槽位的组件塞 children", () => {
    const r = validateComponentTree(reg, { component: "leaf", children: [{ component: "leaf" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("slot");
  });

  it("拒绝未声明的命名槽位", () => {
    const r = validateComponentTree(reg, { component: "layout", slots: { sidebar: [{ component: "leaf" }] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("slot");
  });

  it("接受声明过的命名槽位", () => {
    const r = validateComponentTree(reg, { component: "layout", slots: { media: [{ component: "leaf" }] } });
    expect(r).toEqual({ ok: true });
  });

  it("拒绝嵌套炸弹（深度超限）", () => {
    let tree: unknown = { component: "leaf" };
    for (let i = 0; i < 10; i++) tree = { component: "layout", children: [tree] };
    const r = validateComponentTree(reg, tree);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("depth");
  });

  it("拒绝节点炸弹（宽度超限）", () => {
    const tree = {
      component: "layout",
      children: Array.from({ length: 60 }, () => ({ component: "leaf" })),
    };
    const r = validateComponentTree(reg, tree);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].rule).toBe("nodes");
  });

  it("上限可配置", () => {
    let tree: unknown = { component: "leaf" };
    for (let i = 0; i < 3; i++) tree = { component: "layout", children: [tree] };
    expect(validateComponentTree(reg, tree, { maxDepth: 2 }).ok).toBe(false);
    expect(validateComponentTree(reg, tree, { maxDepth: 10 })).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/registry exec vitest run src/validator.test.ts`
Expected: 新增 6 个测试 FAIL（槽位与上限规则尚未实现）。

- [ ] **Step 3: 实现槽位与上限校验**

把 `validateComponentTree` 的函数体开头与 `visit` 替换为（`_options` 改名 `options`，加入计数与槽位规则）：

```ts
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
    const def = registry.components[n.component];
    if (!def) return fail(path, "unknown-component", `组件未注册: ${n.component}`);
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/registry exec vitest run src/validator.test.ts && pnpm --filter @ai-slot/registry typecheck`
Expected: 全部 PASS；typecheck 通过。

- [ ] **Step 5: Commit**

```bash
git add packages/registry
git commit -m "feat(registry): 槽位合法性与嵌套深度/节点总数上限（防嵌套炸弹）"
```

---

### Task 6: proxy — 双层缓存

**Files:**
- Create: `packages/proxy/src/cache.ts`
- Create: `packages/proxy/src/index.ts`
- Test: `packages/proxy/src/cache.test.ts`

**Interfaces:**
- Produces：
  - `interface CacheEntry<T> { value: T; expiresAt: number; staleUntil: number }`
  - `class MemoryCacheStore { get<T>(key: string, now: number): CacheEntry<T> | undefined; set<T>(key: string, value: T, ttlMs: number, staleMs: number, now: number): void }`
  - `interface CacheLookup<T> { value: T; status: "fresh" | "stale" }`
  - `function lookup<T>(store: MemoryCacheStore, key: string, now: number): CacheLookup<T> | undefined`
  - `function hashKey(input: string): string`（djb2，同步、零依赖）
  - `function normalizeUserPrompt(prompt: string): string`（trim + 小写 + 合并空白）
  - `function developerCacheKey(slotId: string, contentVersion: string, promptVersion: string): string`
  - `function userCacheKey(slotId: string, userPrompt: string): string`

- [ ] **Step 1: 写失败的测试**

`packages/proxy/src/cache.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  MemoryCacheStore,
  developerCacheKey,
  hashKey,
  lookup,
  normalizeUserPrompt,
  userCacheKey,
} from "./cache.js";

describe("MemoryCacheStore + lookup", () => {
  it("TTL 内返回 fresh，超过 TTL 但在 stale 窗口内返回 stale，之后彻底失效", () => {
    const store = new MemoryCacheStore();
    store.set("k", "v", 1000, 5000, 0);
    expect(lookup(store, "k", 500)).toEqual({ value: "v", status: "fresh" });
    expect(lookup(store, "k", 2000)).toEqual({ value: "v", status: "stale" });
    expect(lookup(store, "k", 6001)).toBeUndefined();
    expect(lookup(store, "k", 99999)).toBeUndefined();
  });

  it("未命中的 key 返回 undefined", () => {
    expect(lookup(new MemoryCacheStore(), "nope", 0)).toBeUndefined();
  });
});

describe("key 生成", () => {
  it("hashKey 稳定且为字符串", () => {
    expect(hashKey("a|b|c")).toBe(hashKey("a|b|c"));
    expect(typeof hashKey("a|b|c")).toBe("string");
    expect(hashKey("a|b|c")).not.toBe(hashKey("a|b|d"));
  });

  it("developerCacheKey 随内容/提示词版本变化", () => {
    const base = developerCacheKey("hero", "v1", "p1");
    expect(base).toBe(developerCacheKey("hero", "v1", "p1"));
    expect(base).not.toBe(developerCacheKey("hero", "v2", "p1"));
    expect(base).not.toBe(developerCacheKey("hero", "v1", "p2"));
    expect(base.startsWith("dev:")).toBe(true);
  });

  it("normalizeUserPrompt 做大小写与空白归一", () => {
    expect(normalizeUserPrompt("  换成   更短的 标题 \n")).toBe("换成 更短的 标题");
    expect(normalizeUserPrompt("Hello  World")).toBe("hello world");
  });

  it("userCacheKey 对规范化后等价的提示词命中同一 key", () => {
    expect(userCacheKey("hero", "  Hello   World ")).toBe(userCacheKey("hero", "hello world"));
    expect(userCacheKey("hero", "hello world")).not.toBe(userCacheKey("hero", "hello"));
    expect(userCacheKey("hero", "x").startsWith("usr:")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/cache.test.ts`
Expected: FAIL（`./cache.js` 模块不存在）

- [ ] **Step 3: 实现 cache.ts**

`packages/proxy/src/cache.ts`：

```ts
/** 双层缓存：fresh TTL 内直接返回；超过 TTL 但在 stale 窗口内可作为降级结果返回。 */

export interface CacheEntry<T> {
  value: T;
  /** fresh 截止时刻（ms 时间戳） */
  expiresAt: number;
  /** stale 截止时刻，之后彻底删除 */
  staleUntil: number;
}

export class MemoryCacheStore {
  private map = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string, now: number): CacheEntry<T> | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (now >= entry.staleUntil) {
      this.map.delete(key);
      return undefined;
    }
    return entry as CacheEntry<T>;
  }

  set<T>(key: string, value: T, ttlMs: number, staleMs: number, now: number): void {
    this.map.set(key, { value, expiresAt: now + ttlMs, staleUntil: now + ttlMs + staleMs });
  }
}

export interface CacheLookup<T> {
  value: T;
  status: "fresh" | "stale";
}

export function lookup<T>(store: MemoryCacheStore, key: string, now: number): CacheLookup<T> | undefined {
  const entry = store.get<T>(key, now);
  if (!entry) return undefined;
  return { value: entry.value, status: now < entry.expiresAt ? "fresh" : "stale" };
}

/** djb2 哈希：同步、零依赖，足够做缓存 key（非安全用途）。 */
export function hashKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/** 用户提示词规范化：trim + 小写 + 合并空白，提高 L2 缓存命中率。 */
export function normalizeUserPrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

/** L1 开发者路径 key：hash(slotId + 内容版本 + 提示词版本)。 */
export function developerCacheKey(slotId: string, contentVersion: string, promptVersion: string): string {
  return `dev:${hashKey(`${slotId}|${contentVersion}|${promptVersion}`)}`;
}

/** L2 用户路径 key：hash(slotId + 规范化用户提示词)。 */
export function userCacheKey(slotId: string, userPrompt: string): string {
  return `usr:${hashKey(`${slotId}|${normalizeUserPrompt(userPrompt)}`)}`;
}
```

`packages/proxy/src/index.ts`：

```ts
export * from "./cache.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/cache.test.ts`
Expected: 6 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/proxy
git commit -m "feat(proxy): 双层缓存（fresh/stale TTL、djb2 key、用户提示词规范化）"
```

---

### Task 7: proxy — PromptCompiler（分层提示词组装）

**Files:**
- Create: `packages/proxy/src/prompt-compiler.ts`
- Modify: `packages/proxy/src/index.ts`
- Test: `packages/proxy/src/prompt-compiler.test.ts`

**Interfaces:**
- Consumes: `Registry`（@ai-slot/registry，经 vitest alias 指向源码）。
- Produces:
  - `interface CompileInput { registry: Registry; slotId: string; originalContent: string; developerPrompt?: string; userPrompt?: string; data?: Record<string, unknown> }`
  - `interface CompiledPrompt { system: string; user: string }`
  - `function compilePrompt(input: CompileInput): CompiledPrompt`
  - 分层顺序固定：system = 框架内置规则 + 输出协议 + 注册表 Schema；user = 槽位 → 原始内容 → 实时数据 → 开发者提示词 → 用户提示词（以固定前缀「在保持上述组件约束的前提下，按用户要求调整：」注入）。

- [ ] **Step 1: 写失败的测试（快照测试）**

`packages/proxy/src/prompt-compiler.test.ts`：

```ts
import { defineRegistry } from "@ai-slot/registry";
import { describe, expect, it } from "vitest";
import { compilePrompt } from "./prompt-compiler.js";

const registry = defineRegistry({
  components: {
    "hero-banner": {
      description: "页面顶部主视觉区",
      props: { title: { type: "string", maxLength: 60 } },
      required: ["title"],
      slots: ["default"],
    },
  },
});

describe("compilePrompt", () => {
  it("开发者路径：system 含注册表 Schema，user 含原始内容与开发者提示词", () => {
    const result = compilePrompt({
      registry,
      slotId: "hero",
      originalContent: "<h1>我们的产品</h1>",
      developerPrompt: "面向开发者重写",
    });
    expect(result.system).toMatchSnapshot();
    expect(result.user).toMatchSnapshot();
  });

  it("用户路径：用户提示词以受限前缀注入，且排在开发者提示词之后", () => {
    const result = compilePrompt({
      registry,
      slotId: "hero",
      originalContent: "<h1>我们的产品</h1>",
      developerPrompt: "面向开发者重写",
      userPrompt: "再短一点",
      data: { latestPosts: ["a", "b"] },
    });
    expect(result.user).toContain("在保持上述组件约束的前提下，按用户要求调整：再短一点");
    expect(result.user.indexOf("开发者要求")).toBeLessThan(result.user.indexOf("按用户要求调整"));
    expect(result.user).toContain("latestPosts");
    expect(result.user).toMatchSnapshot();
  });

  it("注册表只暴露 description/props/required/slots，不暴露 dataSources", () => {
    const reg = defineRegistry({
      components: { c: { description: "d", dataSources: ["secretQuery"] } },
    });
    const { system } = compilePrompt({ registry: reg, slotId: "s", originalContent: "x" });
    expect(system).not.toContain("secretQuery");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/prompt-compiler.test.ts`
Expected: FAIL（`./prompt-compiler.js` 模块不存在）

- [ ] **Step 3: 实现 prompt-compiler.ts**

`packages/proxy/src/prompt-compiler.ts`：

```ts
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
```

`packages/proxy/src/index.ts` 追加：

```ts
export * from "./prompt-compiler.js";
```

- [ ] **Step 4: 运行测试确认通过并固化快照**

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/prompt-compiler.test.ts`
Expected: 3 个测试 PASS，生成 `__snapshots__/prompt-compiler.test.ts.snap`。人工检查快照内容：system 含注册表 JSON、user 的分层顺序正确。

- [ ] **Step 5: Commit**

```bash
git add packages/proxy
git commit -m "feat(proxy): PromptCompiler 分层提示词组装（快照测试）"
```

---

### Task 8: proxy — LLMClient 接口、withRetry 与 OpenAI 兼容适配器

**Files:**
- Create: `packages/proxy/src/llm-client.ts`
- Create: `packages/proxy/src/openai-client.ts`
- Modify: `packages/proxy/src/index.ts`
- Test: `packages/proxy/src/llm-client.test.ts`、`packages/proxy/src/openai-client.test.ts`

**Interfaces:**
- Produces:
  - `interface LLMRequest { model: string; system: string; user: string; maxTokens?: number; timeoutMs?: number }`
  - `interface LLMResponse { text: string; usage?: { promptTokens?: number; completionTokens?: number } }`
  - `interface LLMClient { complete(req: LLMRequest): Promise<LLMResponse> }`
  - `class LLMError extends Error`
  - `function withRetry(client: LLMClient, retries?: number): LLMClient`（默认重试 1 次）
  - `function createOpenAIClient(opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }): LLMClient`（默认 baseUrl `https://api.openai.com/v1`；超时默认 8000ms，用 AbortController）

- [ ] **Step 1: 写失败的测试**

`packages/proxy/src/llm-client.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { withRetry, type LLMClient } from "./llm-client.js";

describe("withRetry", () => {
  const ok = { text: "{}" };

  it("第一次就成功则不重试", async () => {
    const complete = vi.fn().mockResolvedValue(ok);
    const client = withRetry({ complete });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).resolves.toBe(ok);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("失败后重试 1 次，第二次成功则返回结果", async () => {
    const complete = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ok);
    const client = withRetry({ complete });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).resolves.toBe(ok);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("重试次数用尽后抛出最后一次错误", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("always"));
    const client = withRetry({ complete });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).rejects.toThrow("always");
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
```

`packages/proxy/src/openai-client.test.ts`（用录制的 fixture 回放，不依赖真实 API）：

```ts
import { describe, expect, it, vi } from "vitest";
import { createOpenAIClient } from "./openai-client.js";

const fixtureBody = {
  choices: [{ message: { content: '{"version":1,"slot":"hero","tree":{"component":"a"}}' } }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
};

function fakeFetch(impl: (url: string, init: RequestInit) => unknown): typeof fetch {
  return vi.fn((url: unknown, init: unknown) => Promise.resolve(impl(url as string, init as RequestInit))) as unknown as typeof fetch;
}

describe("createOpenAIClient", () => {
  it("发送正确的请求并解析 content 与 usage", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = fakeFetch((url, init) => {
      captured = { url, init };
      return { ok: true, json: () => Promise.resolve(fixtureBody) };
    });
    const client = createOpenAIClient({ apiKey: "sk-test", fetchImpl });
    const res = await client.complete({ model: "gpt-4o-mini", system: "sys", user: "usr", maxTokens: 500 });

    expect(captured?.url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = captured?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    const body = JSON.parse(captured?.init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "usr" }]);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(500);
    expect(res.text).toContain('"version":1');
    expect(res.usage).toEqual({ promptTokens: 100, completionTokens: 20 });
  });

  it("HTTP 非 2xx 抛 LLMError", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 500 }));
    const client = createOpenAIClient({ apiKey: "sk-test", fetchImpl });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).rejects.toThrow("500");
  });

  it("响应缺少 content 时抛 LLMError", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, json: () => Promise.resolve({ choices: [] }) }));
    const client = createOpenAIClient({ apiKey: "sk-test", fetchImpl });
    await expect(client.complete({ model: "m", system: "s", user: "u" })).rejects.toThrow("缺少内容");
  });

  it("支持自定义 baseUrl（OpenAI 兼容端点）", async () => {
    let capturedUrl = "";
    const fetchImpl = fakeFetch((url) => {
      capturedUrl = url;
      return { ok: true, json: () => Promise.resolve(fixtureBody) };
    });
    const client = createOpenAIClient({ apiKey: "k", baseUrl: "https://api.deepseek.com/v1", fetchImpl });
    await client.complete({ model: "deepseek-chat", system: "s", user: "u" });
    expect(capturedUrl).toBe("https://api.deepseek.com/v1/chat/completions");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/llm-client.test.ts src/openai-client.test.ts`
Expected: FAIL（两个模块不存在）

- [ ] **Step 3: 实现 llm-client.ts 与 openai-client.ts**

`packages/proxy/src/llm-client.ts`：

```ts
/** LLM 调用的最小抽象：输入分层提示词，输出 JSON 文本。 */

export interface LLMRequest {
  model: string;
  system: string;
  user: string;
  /** token 预算上限 */
  maxTokens?: number;
  /** 超时（ms），默认 8000 */
  timeoutMs?: number;
}

export interface LLMResponse {
  text: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface LLMClient {
  complete(req: LLMRequest): Promise<LLMResponse>;
}

export class LLMError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMError";
  }
}

/** 失败重试：默认重试 1 次（共 2 次尝试）。 */
export function withRetry(client: LLMClient, retries = 1): LLMClient {
  return {
    async complete(req) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await client.complete(req);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    },
  };
}
```

`packages/proxy/src/openai-client.ts`：

```ts
import { LLMError, type LLMClient } from "./llm-client.js";

export interface OpenAIClientOptions {
  apiKey: string;
  /** 默认 https://api.openai.com/v1，可指向任何 OpenAI 兼容端点 */
  baseUrl?: string;
  /** 测试注入用 */
  fetchImpl?: typeof fetch;
}

/** 基于 fetch 的 OpenAI 兼容适配器：零 SDK 依赖，JSON mode 结构化输出。 */
export function createOpenAIClient(opts: OpenAIClientOptions): LLMClient {
  const baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async complete(req) {
      const timeoutMs = req.timeoutMs ?? 8000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${opts.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: req.model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
            response_format: { type: "json_object" },
            ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new LLMError(`LLM HTTP ${res.status}`);
        const data = (await res.json()) as {
          choices?: { message?: { content?: unknown } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = data.choices?.[0]?.message?.content;
        if (typeof text !== "string") throw new LLMError("LLM 响应缺少内容");
        return {
          text,
          usage: { promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
```

`packages/proxy/src/index.ts` 追加：

```ts
export * from "./llm-client.js";
export * from "./openai-client.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/llm-client.test.ts src/openai-client.test.ts`
Expected: 7 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/proxy
git commit -m "feat(proxy): LLMClient 抽象、withRetry 与 OpenAI 兼容适配器（fixture 回放测试）"
```

---

### Task 9: proxy — 限流器与用户提示词过滤

**Files:**
- Create: `packages/proxy/src/rate-limit.ts`
- Create: `packages/proxy/src/sanitize.ts`
- Modify: `packages/proxy/src/index.ts`
- Test: `packages/proxy/src/rate-limit.test.ts`、`packages/proxy/src/sanitize.test.ts`

**Interfaces:**
- Produces:
  - `class RateLimiter { constructor(opts: { limit: number; windowMs: number }); check(key: string, now: number): boolean }`（滑动窗口，`true` = 放行）
  - `function sanitizeUserPrompt(raw: unknown, maxLength?: number): string | null`（默认上限 500；非字符串、空串、超长返回 `null`；剥离控制字符）

- [ ] **Step 1: 写失败的测试**

`packages/proxy/src/rate-limit.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit.js";

describe("RateLimiter（滑动窗口）", () => {
  it("窗口内未超限制全部放行，超限拒绝", () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip1", 1000)).toBe(true);
    expect(limiter.check("ip1", 2000)).toBe(true);
    expect(limiter.check("ip1", 3000)).toBe(false);
  });

  it("不同 key 互不影响", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip2", 0)).toBe(true);
    expect(limiter.check("ip1", 1)).toBe(false);
  });

  it("窗口滑过后恢复放行", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("ip1", 0)).toBe(true);
    expect(limiter.check("ip1", 30_000)).toBe(false);
    expect(limiter.check("ip1", 60_001)).toBe(true);
  });
});
```

`packages/proxy/src/sanitize.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { sanitizeUserPrompt } from "./sanitize.js";

describe("sanitizeUserPrompt", () => {
  it("接受正常输入并 trim", () => {
    expect(sanitizeUserPrompt("  再短一点  ")).toBe("再短一点");
  });

  it("拒绝非字符串 / 空串 / 纯空白", () => {
    expect(sanitizeUserPrompt(undefined)).toBeNull();
    expect(sanitizeUserPrompt(123)).toBeNull();
    expect(sanitizeUserPrompt("")).toBeNull();
    expect(sanitizeUserPrompt("   ")).toBeNull();
  });

  it("拒绝超长输入（默认 500 字符）", () => {
    expect(sanitizeUserPrompt("x".repeat(500))).toHaveLength(500);
    expect(sanitizeUserPrompt("x".repeat(501))).toBeNull();
  });

  it("剥离控制字符", () => {
    expect(sanitizeUserPrompt("a\u0007b")).toBe("a b");
    expect(sanitizeUserPrompt("a\u0085b")).toBe("ab");
  });

  it("maxLength 可配置", () => {
    expect(sanitizeUserPrompt("12345", 4)).toBeNull();
    expect(sanitizeUserPrompt("1234", 4)).toBe("1234");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/rate-limit.test.ts src/sanitize.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 rate-limit.ts 与 sanitize.ts**

`packages/proxy/src/rate-limit.ts`：

```ts
/** 进程内滑动窗口限流（Edge 单实例语义；多实例部署需换外部存储，接口保持不变）。 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private opts: { limit: number; windowMs: number }) {}

  check(key: string, now: number): boolean {
    const windowStart = now - this.opts.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (list.length >= this.opts.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
}
```

`packages/proxy/src/sanitize.ts`：

```ts
/**
 * 用户提示词提交前过滤：类型、长度、控制字符。
 * 返回 null 表示非法输入；通过过滤的提示词仍会经 OutputValidator 最终兜底。
 */
export function sanitizeUserPrompt(raw: unknown, maxLength = 500): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F\u0085]/g, (ch) => (ch === "\u0085" ? "" : " "))
    .replace(/[-]/g, " ")
    .trim();
  if (cleaned.length === 0 || cleaned.length > maxLength) return null;
  return cleaned;
}
```

`packages/proxy/src/index.ts` 追加：

```ts
export * from "./rate-limit.js";
export * from "./sanitize.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/rate-limit.test.ts src/sanitize.test.ts`
Expected: 8 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/proxy
git commit -m "feat(proxy): 滑动窗口限流器与用户提示词过滤"
```

---

### Task 10: proxy — createAiRenderHandler（GET/POST 流水线 + 降级链）

**Files:**
- Create: `packages/proxy/src/handler.ts`
- Modify: `packages/proxy/src/index.ts`
- Test: `packages/proxy/src/handler.test.ts`

**Interfaces:**
- Consumes：`Registry`、`validateComponentTree`、`AiRenderResponse`（@ai-slot/registry）；`MemoryCacheStore`、`lookup`、`developerCacheKey`、`userCacheKey`（Task 6）；`compilePrompt`（Task 7）；`LLMClient`（Task 8）；`RateLimiter`、`sanitizeUserPrompt`（Task 9）。
- Produces:
  - `interface SlotSource { slotId: string; originalContent: string; developerPrompt?: string; contentVersion: string; promptVersion?: string; data?: Record<string, unknown> }`
  - `interface UsageLogEntry { slotId: string; model: string; reason: "developer-prompt" | "user-prompt"; usage?: LLMResponse["usage"]; at: number }`
  - `interface ProxyOptions { registry: Registry; llm: LLMClient; resolveSlot: (slotId: string) => SlotSource | null | Promise<SlotSource | null>; models?: { developer?: string; user?: string }; maxTokens?: number; store?: MemoryCacheStore; developerTtlMs?: number; userTtlMs?: number; staleMs?: number; rateLimit?: { limit: number; windowMs: number } | false; onUsage?: (entry: UsageLogEntry) => void; now?: () => number }`
  - `function createAiRenderHandler(opts: ProxyOptions): (req: Request) => Promise<Response>`
  - 默认值：`developerTtlMs` 3_600_000（1h）、`userTtlMs` 600_000（10min）、`staleMs` 86_400_000（1d）、`rateLimit` `{ limit: 10, windowMs: 60_000 }`、`maxTokens` 2000、`models` 均为 `"gpt-4o-mini"`。
  - 行为契约：路由 `/ai-render/:slotId`；GET=开发者路径，POST=用户路径；LLM/校验失败时有 stale 缓存返回 stale（200），否则 503 `{ "error": "ai_unavailable" }`；限流 429；非法提示词 400；未知槽位 404。

- [ ] **Step 1: 写失败的测试**

`packages/proxy/src/handler.test.ts`：

```ts
import { defineRegistry, type AiRenderResponse } from "@ai-slot/registry";
import { describe, expect, it, vi } from "vitest";
import { createAiRenderHandler, type SlotSource } from "./handler.js";
import type { LLMClient } from "./llm-client.js";

const registry = defineRegistry({
  components: {
    "hero-banner": {
      description: "主视觉",
      props: { title: "string" },
      required: ["title"],
    },
  },
});

const goodTree = { component: "hero-banner", props: { title: "AI 标题" } };

function makeLLM(text: string): LLMClient {
  return { complete: vi.fn().mockResolvedValue({ text }) };
}

const slot: SlotSource = {
  slotId: "hero",
  originalContent: "<h1>原始标题</h1>",
  developerPrompt: "面向开发者重写",
  contentVersion: "v1",
};

function makeHandler(llm: LLMClient, extra: Record<string, unknown> = {}) {
  return createAiRenderHandler({
    registry,
    llm,
    resolveSlot: (id) => (id === "hero" ? slot : null),
    now: () => 1000,
    ...extra,
  });
}

function get(slotId = "hero") {
  return new Request(`https://edge.example/ai-render/${slotId}`);
}

function post(prompt: unknown, headers: Record<string, string> = {}) {
  return new Request("https://edge.example/ai-render/hero", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ prompt }),
  });
}

describe("createAiRenderHandler — GET 开发者路径", () => {
  it("缓存未命中时调用 LLM、校验并返回组件树，meta.reason 为 developer-prompt", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const res = await makeHandler(llm)(get());
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiRenderResponse;
    expect(body).toEqual({ version: 1, slot: "hero", tree: goodTree, meta: { reason: "developer-prompt" } });
    expect(llm.complete).toHaveBeenCalledTimes(1);
    const req = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(req.maxTokens).toBe(2000);
    expect(req.timeoutMs).toBe(8000);
  });

  it("第二次请求命中缓存，不再调用 LLM", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const handler = makeHandler(llm);
    await handler(get());
    const res = await handler(get());
    expect(res.status).toBe(200);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it("LLM 失败且无缓存时返回 503", async () => {
    const llm: LLMClient = { complete: vi.fn().mockRejectedValue(new Error("boom")) };
    const res = await makeHandler(llm)(get());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_unavailable" });
  });

  it("校验失败（伪造组件名）返回 503 且结果不写入缓存", async () => {
    const llm = makeLLM(JSON.stringify({ tree: { component: "evil", props: {} } }));
    const handler = makeHandler(llm);
    const res = await handler(get());
    expect(res.status).toBe(503);
    // 再次请求仍然调用 LLM（坏结果没有被缓存）
    await handler(get());
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it("LLM 输出非法 JSON 返回 503", async () => {
    const llm = makeLLM("这不是 JSON");
    const res = await makeHandler(llm)(get());
    expect(res.status).toBe(503);
  });

  it("LLM 失败但有 stale 缓存时返回 stale（200）", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    let now = 0;
    const handler = makeHandler(llm, { developerTtlMs: 100, staleMs: 1000, now: () => now });
    await handler(get()); // 写入缓存（fresh 到 t=100）
    now = 500; // 进入 stale 窗口
    (llm.complete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const res = await handler(get());
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiRenderResponse;
    expect(body.tree).toEqual(goodTree);
  });

  it("未知槽位返回 404，未匹配路径返回 404", async () => {
    const handler = makeHandler(makeLLM("{}"));
    expect((await handler(get("nope"))).status).toBe(404);
    expect((await handler(new Request("https://edge.example/other"))).status).toBe(404);
  });

  it("LLM 调用成功后记录用量日志", async () => {
    const onUsage = vi.fn();
    const llm: LLMClient = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({ tree: goodTree }),
        usage: { promptTokens: 100, completionTokens: 20 },
      }),
    };
    const handler = makeHandler(llm, { onUsage, models: { developer: "big-model" } });
    await handler(get());
    expect(onUsage).toHaveBeenCalledWith({
      slotId: "hero",
      model: "big-model",
      reason: "developer-prompt",
      usage: { promptTokens: 100, completionTokens: 20 },
      at: 1000,
    });
  });
});

describe("createAiRenderHandler — POST 用户路径", () => {
  it("合法提示词走实时调用，meta.reason 为 user-prompt，用户提示词注入编译后的提示词", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const res = await makeHandler(llm)(post("  再短一点  "));
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiRenderResponse;
    expect(body.meta).toEqual({ reason: "user-prompt" });
    const req = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(req.user).toContain("在保持上述组件约束的前提下，按用户要求调整：再短一点");
  });

  it("非法提示词返回 400", async () => {
    const handler = makeHandler(makeLLM("{}"));
    expect((await handler(post(""))).status).toBe(400);
    expect((await handler(post(123))).status).toBe(400);
    expect((await handler(post("x".repeat(501)))).status).toBe(400);
  });

  it("超过限流返回 429（按 x-forwarded-for 分桶）", async () => {
    const handler = makeHandler(makeLLM(JSON.stringify({ tree: goodTree })), {
      rateLimit: { limit: 2, windowMs: 60_000 },
    });
    const ip = { "x-forwarded-for": "1.2.3.4" };
    expect((await handler(post("a", ip))).status).toBe(200);
    expect((await handler(post("b", ip))).status).toBe(200);
    expect((await handler(post("c", ip))).status).toBe(429);
    expect((await handler(post("c", { "x-forwarded-for": "5.6.7.8" }))).status).toBe(200);
  });

  it("GET 与 POST 使用不同的缓存 key 与模型档位", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const handler = makeHandler(llm, { models: { developer: "big-model", user: "small-model" } });
    await handler(get());
    await handler(post("hi"));
    const calls = (llm.complete as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2); // 缓存互不命中
    expect(calls[0][0].model).toBe("big-model");
    expect(calls[1][0].model).toBe("small-model");
  });

  it("规范化后等价的用户提示词命中同一缓存", async () => {
    const llm = makeLLM(JSON.stringify({ tree: goodTree }));
    const handler = makeHandler(llm);
    await handler(post("Hello   World"));
    await handler(post("  hello world "));
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/proxy exec vitest run src/handler.test.ts`
Expected: FAIL（`./handler.js` 模块不存在）

- [ ] **Step 3: 实现 handler.ts**

`packages/proxy/src/handler.ts`：

```ts
import {
  validateComponentTree,
  type AiRenderResponse,
  type ComponentNode,
  type Registry,
} from "@ai-slot/registry";
import {
  MemoryCacheStore,
  developerCacheKey,
  lookup,
  userCacheKey,
} from "./cache.js";
import type { LLMClient, LLMResponse } from "./llm-client.js";
import { compilePrompt } from "./prompt-compiler.js";
import { RateLimiter } from "./rate-limit.js";
import { sanitizeUserPrompt } from "./sanitize.js";

export interface SlotSource {
  slotId: string;
  /** 原始兜底内容摘要 */
  originalContent: string;
  developerPrompt?: string;
  /** 内容版本，进入 L1 缓存 key */
  contentVersion: string;
  /** 提示词版本，默认 "1" */
  promptVersion?: string;
  /** 数据源解析后的实时数据 */
  data?: Record<string, unknown>;
}

export interface ProxyOptions {
  registry: Registry;
  llm: LLMClient;
  resolveSlot: (slotId: string) => SlotSource | null | Promise<SlotSource | null>;
  /** 双模型档位：开发者预生成可用大模型，用户实时路径默认小模型 */
  models?: { developer?: string; user?: string };
  /** token 预算上限，默认 2000 */
  maxTokens?: number;
  store?: MemoryCacheStore;
  /** L1 缓存 TTL，默认 1 小时 */
  developerTtlMs?: number;
  /** L2 缓存 TTL，默认 10 分钟 */
  userTtlMs?: number;
  /** stale 窗口，默认 1 天 */
  staleMs?: number;
  /** 用户路径限流，默认 10 次/分钟；传 false 关闭 */
  rateLimit?: { limit: number; windowMs: number } | false;
  /** 用量日志：每次 LLM 调用成功后回调（供计费与调优） */
  onUsage?: (entry: UsageLogEntry) => void;
  /** 测试注入用 */
  now?: () => number;
}

/** 用量日志条目（设计文档 §4.2：全部调用记录用量日志）。 */
export interface UsageLogEntry {
  slotId: string;
  model: string;
  reason: "developer-prompt" | "user-prompt";
  usage?: LLMResponse["usage"];
  at: number;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** 无状态渲染代理：GET 开发者路径（长缓存）/ POST 用户路径（实时 + 限流 + 短 TTL）。 */
export function createAiRenderHandler(opts: ProxyOptions): (req: Request) => Promise<Response> {
  const store = opts.store ?? new MemoryCacheStore();
  const now = opts.now ?? (() => Date.now());
  const limiter =
    opts.rateLimit === false
      ? null
      : new RateLimiter(opts.rateLimit ?? { limit: 10, windowMs: 60_000 });

  return async function handler(req: Request): Promise<Response> {
    const match = new URL(req.url).pathname.match(/\/ai-render\/([\w-]+)\/?$/);
    if (!match) return json({ error: "not_found" }, 404);
    const slotId = match[1];
    const slot = await opts.resolveSlot(slotId);
    if (!slot) return json({ error: "unknown_slot" }, 404);

    let userPrompt: string | undefined;
    if (req.method === "POST") {
      if (limiter) {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
        if (!limiter.check(ip, now())) return json({ error: "rate_limited" }, 429);
      }
      const body: unknown = await req.json().catch(() => null);
      const cleaned = sanitizeUserPrompt((body as { prompt?: unknown } | null)?.prompt);
      if (!cleaned) return json({ error: "invalid_prompt" }, 400);
      userPrompt = cleaned;
    } else if (req.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const isUserPath = userPrompt !== undefined;
    const key = isUserPath
      ? userCacheKey(slotId, userPrompt)
      : developerCacheKey(slotId, slot.contentVersion, slot.promptVersion ?? "1");
    const ttlMs = isUserPath ? (opts.userTtlMs ?? 600_000) : (opts.developerTtlMs ?? 3_600_000);
    const staleMs = opts.staleMs ?? 86_400_000;

    const hit = lookup<AiRenderResponse>(store, key, now());
    if (hit?.status === "fresh") return json(hit.value, 200);

    const staleOr503 = (): Response => {
      if (hit) return json(hit.value, 200); // 降级链：stale 缓存兜底
      return json({ error: "ai_unavailable" }, 503);
    };

    try {
      const compiled = compilePrompt({
        registry: opts.registry,
        slotId,
        originalContent: slot.originalContent,
        developerPrompt: slot.developerPrompt,
        userPrompt,
        data: slot.data,
      });
      const model = isUserPath
        ? (opts.models?.user ?? "gpt-4o-mini")
        : (opts.models?.developer ?? "gpt-4o-mini");
      const llmRes = await opts.llm.complete({
        model,
        system: compiled.system,
        user: compiled.user,
        maxTokens: opts.maxTokens ?? 2000,
        timeoutMs: 8000,
      });
      opts.onUsage?.({
        slotId,
        model,
        reason: isUserPath ? "user-prompt" : "developer-prompt",
        usage: llmRes.usage,
        at: now(),
      });
      const parsed: unknown = JSON.parse(llmRes.text);
      const tree = (parsed as Partial<AiRenderResponse> | null)?.tree;
      const result = validateComponentTree(opts.registry, tree);
      if (!result.ok) {
        console.warn("[ai-render] 输出校验失败，已丢弃", result.errors);
        return staleOr503();
      }
      const response: AiRenderResponse = {
        version: 1,
        slot: slotId,
        tree: tree as ComponentNode,
        meta: { reason: isUserPath ? "user-prompt" : "developer-prompt" },
      };
      store.set(key, response, ttlMs, staleMs, now());
      return json(response, 200);
    } catch (error) {
      console.warn("[ai-render] LLM 调用失败", error);
      return staleOr503();
    }
  };
}
```

`packages/proxy/src/index.ts` 改为：

```ts
export * from "./cache.js";
export * from "./handler.js";
export * from "./llm-client.js";
export * from "./openai-client.js";
export * from "./prompt-compiler.js";
export * from "./rate-limit.js";
export * from "./sanitize.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/proxy test && pnpm --filter @ai-slot/proxy typecheck`
Expected: 全部测试 PASS；typecheck 通过。

- [ ] **Step 5: Commit**

```bash
git add packages/proxy
git commit -m "feat(proxy): 渲染代理 handler——GET/POST 流水线、双层缓存、限流与 stale 降级链"
```

---

### Task 11: runtime — 渲染器注册与 renderTree

**Files:**
- Create: `packages/runtime/src/renderer.ts`
- Create: `packages/runtime/src/index.ts`
- Test: `packages/runtime/src/renderer.test.ts`

**Interfaces:**
- Consumes: `ComponentNode`（@ai-slot/registry）。
- Produces:
  - `interface RenderContext { children: HTMLElement[]; slots: Record<string, HTMLElement[]> }`
  - `type Renderer = (node: ComponentNode, ctx: RenderContext) => HTMLElement | null | Promise<HTMLElement | null>`（返回 `null` 表示跳过该节点）
  - `function registerRenderer(name: string, renderer: Renderer): void`
  - `function getRenderer(name: string): Renderer | undefined`
  - `function renderTree(renderer: Renderer, node: ComponentNode): Promise<HTMLElement | null>`（递归渲染 children 与命名槽位后交给 Renderer 组装）

- [ ] **Step 1: 写失败的测试**

`packages/runtime/src/renderer.test.ts`：

```ts
import type { ComponentNode } from "@ai-slot/registry";
import { describe, expect, it, vi } from "vitest";
import { getRenderer, registerRenderer, renderTree, type Renderer } from "./renderer.js";

describe("registerRenderer / getRenderer", () => {
  it("注册后可按名字取回", () => {
    const r: Renderer = () => null;
    registerRenderer("test-basic", r);
    expect(getRenderer("test-basic")).toBe(r);
    expect(getRenderer("not-exists")).toBeUndefined();
  });
});

describe("renderTree", () => {
  it("自底向上组装：子节点先渲染为 HTMLElement，再交给父节点", async () => {
    const renderer: Renderer = (node, ctx) => {
      const el = document.createElement(node.component === "root" ? "section" : "p");
      el.textContent = (node.props?.text as string) ?? "";
      for (const child of ctx.children) el.appendChild(child);
      return el;
    };
    const tree: ComponentNode = {
      component: "root",
      children: [{ component: "leaf", props: { text: "子内容" } }],
    };
    const el = await renderTree(renderer, tree);
    expect(el?.tagName).toBe("SECTION");
    expect(el?.querySelector("p")?.textContent).toBe("子内容");
  });

  it("命名槽位的节点渲染后按槽位名分组传入 ctx.slots", async () => {
    const renderer: Renderer = (node, ctx) => {
      const el = document.createElement("div");
      el.dataset.component = node.component;
      for (const [name, els] of Object.entries(ctx.slots)) {
        for (const child of els) {
          child.dataset.slot = name;
          el.appendChild(child);
        }
      }
      return el;
    };
    const el = await renderTree(renderer, {
      component: "layout",
      slots: { media: [{ component: "img-box" }] },
    });
    expect(el?.querySelector("[data-component=img-box]")?.getAttribute("data-slot")).toBe("media");
  });

  it("Renderer 返回 null 的节点被跳过", async () => {
    const renderer: Renderer = (node, ctx) => {
      if (node.component === "skip") return null;
      const el = document.createElement("div");
      for (const child of ctx.children) el.appendChild(child);
      return el;
    };
    const el = await renderTree(renderer, {
      component: "root",
      children: [{ component: "skip" }, { component: "keep" }],
    });
    expect(el?.childNodes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/runtime exec vitest run src/renderer.test.ts`
Expected: FAIL（`./renderer.js` 模块不存在）

- [ ] **Step 3: 实现 renderer.ts**

`packages/runtime/src/renderer.ts`：

```ts
import type { ComponentNode } from "@ai-slot/registry";

export interface RenderContext {
  /** 已渲染完成的默认槽位子元素 */
  children: HTMLElement[];
  /** 已渲染完成的命名槽位子元素，按槽位名分组 */
  slots: Record<string, HTMLElement[]>;
}

/** 把单个组件树节点映射为真实元素；返回 null 表示跳过该节点。 */
export type Renderer = (
  node: ComponentNode,
  ctx: RenderContext,
) => HTMLElement | null | Promise<HTMLElement | null>;

const renderers = new Map<string, Renderer>();

/** 注册渲染适配器，如 registerRenderer("dom", createDomRenderer(...))。 */
export function registerRenderer(name: string, renderer: Renderer): void {
  renderers.set(name, renderer);
}

export function getRenderer(name: string): Renderer | undefined {
  return renderers.get(name);
}

/** 递归渲染组件树：先渲染子节点与命名槽位，再交给 Renderer 组装当前节点。 */
export async function renderTree(renderer: Renderer, node: ComponentNode): Promise<HTMLElement | null> {
  const children: HTMLElement[] = [];
  for (const child of node.children ?? []) {
    const el = await renderTree(renderer, child);
    if (el) children.push(el);
  }
  const slots: Record<string, HTMLElement[]> = {};
  for (const [name, nodes] of Object.entries(node.slots ?? {})) {
    slots[name] = [];
    for (const child of nodes) {
      const el = await renderTree(renderer, child);
      if (el) slots[name].push(el);
    }
  }
  return renderer(node, { children, slots });
}
```

`packages/runtime/src/index.ts`：

```ts
export * from "./renderer.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/runtime exec vitest run src/renderer.test.ts`
Expected: 4 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/runtime
git commit -m "feat(runtime): 渲染器注册表与 renderTree 递归组装"
```

---

### Task 12: runtime — `<ai-slot>` 元素（挂载→加载→渲染→降级）

**Files:**
- Create: `packages/runtime/src/ai-slot.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `packages/runtime/src/ai-slot.test.ts`

**Interfaces:**
- Consumes：`validateComponentTree`、`Registry`、`AiRenderResponse`（@ai-slot/registry）；`getRenderer`、`renderTree`、`Renderer`（Task 11）。
- Produces:
  - `function configureAiSlot(opts: { registry?: Registry }): void`（全局配置；提供 registry 时客户端在渲染前再校验一次 AI 输出）
  - `class AiSlotElement extends HTMLElement`，属性：`src`（代理地址，缺省则不发起请求）、`renderer`（默认 `"dom"`）、`refresh-interval`（秒，>0 时轮询）；方法 `load(userPrompt?): Promise<void>`、`restore(): void`
  - 行为契约：挂载时保存 `innerHTML` 为兜底；任何失败（无 src/无 renderer/HTTP 非 2xx/校验失败/渲染返回 null/异常）都静默保留兜底；成功后用渲染结果替换内容。`customElements.define("ai-slot", ...)` 在模块加载时完成（已定义则跳过）。

- [ ] **Step 1: 写失败的测试**

`packages/runtime/src/ai-slot.test.ts`：

```ts
import { defineRegistry, type AiRenderResponse } from "@ai-slot/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSlotElement, configureAiSlot } from "./ai-slot.js";
import { registerRenderer, type Renderer } from "./renderer.js";

const registry = defineRegistry({
  components: {
    "hero-banner": { description: "", props: { title: "string" }, required: ["title"] },
  },
});

const domRenderer: Renderer = (node) => {
  const el = document.createElement("div");
  el.className = node.component;
  el.textContent = (node.props?.title as string) ?? "";
  return el;
};
registerRenderer("dom", domRenderer);

function aiResponse(tree: unknown): AiRenderResponse {
  return { version: 1, slot: "hero", tree: tree as AiRenderResponse["tree"] };
}

function mockFetch(impl: () => Promise<{ ok: boolean; status?: number; json?: () => Promise<unknown> }>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function mount(html: string): AiSlotElement {
  const el = document.createElement("ai-slot") as AiSlotElement;
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("<ai-slot> 生命周期", () => {
  beforeEach(() => {
    configureAiSlot({ registry });
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("挂载后请求代理并用 AI 结果替换兜底内容", async () => {
    mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "AI 标题" } })) }));
    const el = mount(`<h1>兜底标题</h1>`);
    el.setAttribute("src", "/ai-render/hero");
    // src 需要在挂载前设置；重新挂载
    el.remove();
    const el2 = document.createElement("ai-slot") as AiSlotElement;
    el2.setAttribute("src", "/ai-render/hero");
    el2.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el2);
    await flush();
    expect(el2.querySelector(".hero-banner")?.textContent).toBe("AI 标题");
    expect(el2.querySelector("h1")).toBeNull();
  });

  it("HTTP 非 2xx 时保留兜底内容", async () => {
    mockFetch(() => Promise.resolve({ ok: false, status: 503 }));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
  });

  it("fetch 抛异常（代理整体不可用）时保留兜底内容", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
  });

  it("客户端校验失败（伪造组件名）时丢弃结果、保留兜底", async () => {
    mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve(aiResponse({ component: "evil", props: {} })) }));
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
  });

  it("没有 src 属性时不发起请求", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mount("<h1>纯静态</h1>");
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refresh-interval 触发轮询重新加载", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", fetchSpy);
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("refresh-interval", "5");
    el.innerHTML = "<h1>兜底</h1>";
    document.body.appendChild(el);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    el.remove();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 断开后停止轮询
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/runtime exec vitest run src/ai-slot.test.ts`
Expected: FAIL（`./ai-slot.js` 模块不存在）

- [ ] **Step 3: 实现 ai-slot.ts**

`packages/runtime/src/ai-slot.ts`：

```ts
import { validateComponentTree, type AiRenderResponse, type Registry } from "@ai-slot/registry";
import { getRenderer, renderTree } from "./renderer.js";

let globalRegistry: Registry | undefined;

/** 全局配置：提供 registry 时，客户端在渲染前对 AI 输出再做一次校验（双保险）。 */
export function configureAiSlot(opts: { registry?: Registry }): void {
  globalRegistry = opts.registry;
}

/**
 * <ai-slot> 自定义元素。渐进增强：内部永远先保留原始兜底内容，
 * AI 结果就绪且校验通过后才替换；任何失败静默回退，不白屏、不报错给用户。
 */
export class AiSlotElement extends HTMLElement {
  static observedAttributes = ["src", "renderer", "editable", "refresh-interval"];

  protected fallbackHTML = "";
  protected editor: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;

  connectedCallback(): void {
    this.fallbackHTML = this.innerHTML;
    if (this.hasAttribute("editable")) this.mountEditor();
    const intervalSec = Number(this.getAttribute("refresh-interval") ?? 0);
    if (intervalSec > 0) {
      this.timer = setInterval(() => void this.load(), intervalSec * 1000);
    }
    void this.load();
  }

  disconnectedCallback(): void {
    clearInterval(this.timer);
  }

  /** 拉取并渲染组件树；userPrompt 存在时走 POST 用户路径。失败时静默保留当前内容。 */
  async load(userPrompt?: string): Promise<void> {
    const src = this.getAttribute("src");
    const renderer = getRenderer(this.getAttribute("renderer") ?? "dom");
    if (!src || !renderer) return;
    try {
      const res = await fetch(
        src,
        userPrompt === undefined
          ? undefined
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ prompt: userPrompt }),
            },
      );
      if (!res.ok) return;
      const data = (await res.json()) as AiRenderResponse;
      if (globalRegistry && !validateComponentTree(globalRegistry, data?.tree).ok) return;
      const el = await renderTree(renderer, data.tree);
      if (!el) return;
      this.setContent(el);
    } catch {
      // 静默回退兜底内容
    }
  }

  /** 恢复为挂载时的原始兜底内容。 */
  restore(): void {
    this.innerHTML = this.fallbackHTML;
    if (this.editor) this.appendChild(this.editor);
  }

  protected setContent(el: HTMLElement): void {
    this.replaceChildren(el);
    if (this.editor) this.appendChild(this.editor);
  }

  /** editable 的默认编辑条，Task 13 实现。 */
  protected mountEditor(): void {}
}

if (typeof customElements !== "undefined" && !customElements.get("ai-slot")) {
  customElements.define("ai-slot", AiSlotElement);
}
```

`packages/runtime/src/index.ts`：

```ts
export * from "./ai-slot.js";
export * from "./renderer.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/runtime exec vitest run src/ai-slot.test.ts`
Expected: 6 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/runtime
git commit -m "feat(runtime): <ai-slot> 自定义元素——挂载/加载/渲染/静默降级与轮询"
```

---

### Task 13: runtime — editable 用户提示词流程与恢复默认

**Files:**
- Modify: `packages/runtime/src/ai-slot.ts`（实现 `mountEditor`）
- Modify: `packages/runtime/src/ai-slot.test.ts`

**Interfaces:**
- Consumes：`AiSlotElement.load(userPrompt)`、`restore()`（Task 12）。
- Produces: `editable` 属性存在时挂载默认编辑条——一个 `<form class="ai-slot-editor">`，含 `input[name=prompt]`（maxLength 500）、提交按钮（文案「应用」）、`button[type=button]`（文案「恢复默认」）。提交走 POST 用户路径，点恢复调用 `restore()`。编辑条在内容替换后仍然保留（作为最后一个子元素重新挂载）。UI 可通过 CSS 完全自定义。

- [ ] **Step 1: 写失败的测试**

向 `packages/runtime/src/ai-slot.test.ts` 追加：

```ts
describe("<ai-slot editable> 用户提示词流程", () => {
  beforeEach(() => {
    configureAiSlot({ registry });
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mountEditable(): AiSlotElement {
    const el = document.createElement("ai-slot") as AiSlotElement;
    el.setAttribute("src", "/ai-render/hero");
    el.setAttribute("editable", "");
    el.innerHTML = "<h1>兜底标题</h1>";
    document.body.appendChild(el);
    return el;
  }

  it("挂载编辑条：输入框 + 应用 + 恢复默认", async () => {
    mockFetch(() => Promise.resolve({ ok: false, status: 503 }));
    const el = mountEditable();
    await flush();
    const form = el.querySelector("form.ai-slot-editor");
    expect(form).not.toBeNull();
    expect(form?.querySelector("input[name=prompt]")).not.toBeNull();
    const buttons = [...(form?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(buttons).toContain("应用");
    expect(buttons).toContain("恢复默认");
  });

  it("提交提示词走 POST 路径并更新该槽位", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "用户定制" } })),
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const el = mountEditable();
    await flush();
    const input = el.querySelector<HTMLInputElement>("input[name=prompt]");
    input!.value = "再短一点";
    el.querySelector("form.ai-slot-editor")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    const postCall = fetchSpy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ prompt: "再短一点" });
    expect(el.querySelector(".hero-banner")?.textContent).toBe("用户定制");
    expect(el.querySelector("form.ai-slot-editor")).not.toBeNull(); // 编辑条仍在
  });

  it("恢复默认回到兜底内容", async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(aiResponse({ component: "hero-banner", props: { title: "AI 标题" } })),
      }),
    );
    const el = mountEditable();
    await flush();
    expect(el.querySelector(".hero-banner")).not.toBeNull();
    const reset = [...el.querySelectorAll("button")].find((b) => b.textContent === "恢复默认");
    reset!.click();
    expect(el.querySelector("h1")?.textContent).toBe("兜底标题");
    expect(el.querySelector("form.ai-slot-editor")).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/runtime exec vitest run src/ai-slot.test.ts`
Expected: 新增 3 个测试 FAIL（`mountEditor` 是空实现）。

- [ ] **Step 3: 实现 mountEditor**

把 `ai-slot.ts` 中的 `protected mountEditor(): void {}` 替换为：

```ts
  /** editable 的默认编辑条；样式通过 .ai-slot-editor 完全开放给用户自定义。 */
  protected mountEditor(): void {
    const form = document.createElement("form");
    form.className = "ai-slot-editor";
    const input = document.createElement("input");
    input.name = "prompt";
    input.maxLength = 500;
    input.placeholder = "用一句话调整这个区域…";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "应用";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "恢复默认";
    form.append(input, submit, reset);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value) void this.load(value);
    });
    reset.addEventListener("click", () => this.restore());
    this.editor = form;
    this.appendChild(form);
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/runtime test && pnpm --filter @ai-slot/runtime typecheck`
Expected: 全部测试 PASS；typecheck 通过。

- [ ] **Step 5: Commit**

```bash
git add packages/runtime
git commit -m "feat(runtime): editable 用户提示词编辑条与恢复默认"
```

---

### Task 14: adapter-dom — 内置 DOM 渲染器

**Files:**
- Create: `packages/adapter-dom/src/dom-renderer.ts`
- Create: `packages/adapter-dom/src/index.ts`
- Test: `packages/adapter-dom/src/dom-renderer.test.ts`

**Interfaces:**
- Consumes：`Renderer`、`RenderContext`（@ai-slot/runtime）；`ComponentNode`（@ai-slot/registry）。
- Produces:
  - `interface DomComponentDef { tag: string; class?: string; applyProps?: (el: HTMLElement, props: Record<string, unknown>) => void; childrenTarget?: (el: HTMLElement) => HTMLElement }`
  - `function createDomRenderer(components: Record<string, DomComponentDef>): Renderer`
  - 安全契约：未注册的组件名跳过并 `console.warn`（渲染其余部分）；`applyProps` 的实现方必须用 `textContent` 写文本（示例与文档中强制执行此约定，AI 文本永不进 `innerHTML`）。

- [ ] **Step 1: 写失败的测试**

`packages/adapter-dom/src/dom-renderer.test.ts`：

```ts
import { renderTree } from "@ai-slot/runtime";
import { describe, expect, it, vi } from "vitest";
import { createDomRenderer, type DomComponentDef } from "./dom-renderer.js";

const components: Record<string, DomComponentDef> = {
  "hero-banner": {
    tag: "section",
    class: "hero",
    applyProps: (el, props) => {
      const h1 = document.createElement("h1");
      h1.textContent = String(props.title ?? "");
      el.appendChild(h1);
    },
  },
  "markdown-block": {
    tag: "div",
    class: "markdown",
    applyProps: (el, props) => {
      el.textContent = String(props.content ?? "");
    },
  },
};

describe("createDomRenderer", () => {
  it("按注册表 tag 映射建 DOM，children 挂到父元素", async () => {
    const renderer = createDomRenderer(components);
    const el = await renderTree(renderer, {
      component: "hero-banner",
      props: { title: "AI 标题" },
      children: [{ component: "markdown-block", props: { content: "正文" } }],
    });
    expect(el?.tagName).toBe("SECTION");
    expect(el?.className).toBe("hero");
    expect(el?.querySelector("h1")?.textContent).toBe("AI 标题");
    expect(el?.querySelector(".markdown")?.textContent).toBe("正文");
  });

  it("AI 文本经 textContent 写入，不会被解析为 HTML", async () => {
    const renderer = createDomRenderer(components);
    const el = await renderTree(renderer, {
      component: "markdown-block",
      props: { content: "<img src=x onerror=alert(1)>" },
    });
    expect(el?.querySelector("img")).toBeNull();
    expect(el?.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("未注册的组件跳过并警告，渲染其余部分", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const renderer = createDomRenderer(components);
    const el = await renderTree(renderer, {
      component: "hero-banner",
      props: { title: "ok" },
      children: [{ component: "not-registered" }, { component: "markdown-block", props: { content: "保留" } }],
    });
    expect(el?.querySelector(".markdown")?.textContent).toBe("保留");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not-registered"));
    warn.mockRestore();
  });

  it("childrenTarget 可指定子元素挂载点", async () => {
    const renderer = createDomRenderer({
      card: {
        tag: "article",
        childrenTarget: (el) => {
          const body = document.createElement("div");
          body.className = "card-body";
          el.appendChild(body);
          return body;
        },
      },
      text: { tag: "p", applyProps: (el, props) => { el.textContent = String(props.t ?? ""); } },
    });
    const el = await renderTree(renderer, {
      component: "card",
      children: [{ component: "text", props: { t: "在 body 里" } }],
    });
    expect(el?.querySelector(".card-body p")?.textContent).toBe("在 body 里");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ai-slot/adapter-dom exec vitest run src/dom-renderer.test.ts`
Expected: FAIL（`./dom-renderer.js` 模块不存在）

- [ ] **Step 3: 实现 dom-renderer.ts**

`packages/adapter-dom/src/dom-renderer.ts`：

```ts
import type { Renderer } from "@ai-slot/runtime";

export interface DomComponentDef {
  /** 组件映射到的 HTML 标签 */
  tag: string;
  class?: string;
  /** 写入 props。实现方必须用 textContent 写文本，禁止把 AI 文本塞进 innerHTML。 */
  applyProps?: (el: HTMLElement, props: Record<string, unknown>) => void;
  /** 子元素挂载点，默认组件元素本身 */
  childrenTarget?: (el: HTMLElement) => HTMLElement;
}

/** 内置 DOM 渲染器：按注册表 tag 映射直接建 DOM。未注册组件跳过并警告。 */
export function createDomRenderer(components: Record<string, DomComponentDef>): Renderer {
  return (node, ctx) => {
    const def = components[node.component];
    if (!def) {
      console.warn(`[ai-slot] 组件未在客户端注册，已跳过: ${node.component}`);
      return null;
    }
    const el = document.createElement(def.tag);
    if (def.class) el.className = def.class;
    def.applyProps?.(el, node.props ?? {});
    const target = def.childrenTarget?.(el) ?? el;
    for (const child of ctx.children) target.appendChild(child);
    return el;
  };
}
```

`packages/adapter-dom/src/index.ts`：

```ts
export * from "./dom-renderer.js";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @ai-slot/adapter-dom test && pnpm --filter @ai-slot/adapter-dom typecheck && pnpm build`
Expected: 全部测试 PASS；typecheck 通过；四个包均构建出 `dist/`。

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-dom
git commit -m "feat(adapter-dom): 内置 DOM 渲染器（tag 映射、textContent 安全写入、未注册跳过）"
```

---

### Task 15: examples/plain-html — 历史项目接入示例与端到端验收

**Files:**
- Create: `examples/plain-html/package.json`、`playwright.config.ts`、`server.mjs`、`registry.mjs`、`components.mjs`、`index.html`
- Test: `examples/plain-html/e2e/ai-slot.spec.ts`

**Interfaces:**
- Consumes：四个包的全部公开 API（这是对接口可用性的最终验收）。
- Produces: e2e 验收三条路径——①开发者提示词路径（GET，AI 内容替换兜底）；②用户实时修改路径（editable + POST）；③AI 失败降级路径（mock LLM 抛错，兜底内容不动）。命令：`pnpm --filter example-plain-html test:e2e`。

- [ ] **Step 1: 创建示例项目文件**

`examples/plain-html/package.json`：

```json
{
  "name": "example-plain-html",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "echo 无需构建",
    "typecheck": "echo 无需类型检查",
    "test": "echo 单元测试见各包；e2e 请用 test:e2e",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@ai-slot/adapter-dom": "workspace:*",
    "@ai-slot/proxy": "workspace:*",
    "@ai-slot/registry": "workspace:*",
    "@ai-slot/runtime": "workspace:*"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0"
  }
}
```

`examples/plain-html/registry.mjs`（服务端与客户端共用同一份注册表）：

```js
import { defineRegistry } from "@ai-slot/registry";

export const registry = defineRegistry({
  components: {
    "hero-banner": {
      description: "页面顶部主视觉区",
      props: {
        title: { type: "string", maxLength: 60 },
        subtitle: { type: "string", maxLength: 120 },
      },
      required: ["title"],
    },
    "markdown-block": {
      description: "纯内容组件",
      props: { content: "string" },
      required: ["content"],
    },
  },
});
```

`examples/plain-html/components.mjs`（客户端 DOM 组件定义）：

```js
export const domComponents = {
  "hero-banner": {
    tag: "section",
    class: "hero",
    applyProps: (el, props) => {
      const h1 = document.createElement("h1");
      h1.className = "hero-title";
      h1.textContent = String(props.title ?? "");
      const p = document.createElement("p");
      p.className = "hero-subtitle";
      p.textContent = String(props.subtitle ?? "");
      el.append(h1, p);
    },
  },
  "markdown-block": {
    tag: "div",
    class: "markdown",
    applyProps: (el, props) => {
      el.textContent = String(props.content ?? "");
    },
  },
};
```

`examples/plain-html/index.html`（模拟一个「老站」：原有内容原样包进 `<ai-slot>`）：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>老站接入 ai-slot 示例</title>
    <script type="importmap">
      {
        "imports": {
          "@ai-slot/registry": "/vendor/registry/index.js",
          "@ai-slot/runtime": "/vendor/runtime/index.js",
          "@ai-slot/adapter-dom": "/vendor/adapter-dom/index.js"
        }
      }
    </script>
    <script type="module">
      import { configureAiSlot } from "@ai-slot/runtime";
      import { registerRenderer } from "@ai-slot/runtime";
      import { createDomRenderer } from "@ai-slot/adapter-dom";
      import { registry } from "/registry-client.mjs";
      import { domComponents } from "/components.mjs";

      registerRenderer("dom", createDomRenderer(domComponents));
      configureAiSlot({ registry });
    </script>
  </head>
  <body>
    <!-- 老站原有内容，一个字不改，直接包进 ai-slot -->
    <ai-slot name="hero" src="/ai-render/hero" editable>
      <h1>我们的产品</h1>
      <p>一个普通的产品介绍</p>
    </ai-slot>

    <ai-slot name="broken" src="/ai-render/broken">
      <h2>兜底：静态内容</h2>
    </ai-slot>
  </body>
</html>
```

`examples/plain-html/registry-client.mjs`（浏览器侧注册表，从服务端同构文件 re-export，避免 importmap 多映射）：

```js
export { registry } from "/registry.mjs";
```

注意：`/registry.mjs` 里 `import { defineRegistry } from "@ai-slot/registry"` 会被 importmap 解析，无需额外处理。

`examples/plain-html/server.mjs`（Node 静态服务器 + 代理挂载 + Mock LLM，无需真实 API key）：

```js
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createAiRenderHandler } from "@ai-slot/proxy";
import { registry } from "./registry.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const pkgRoot = (name) => fileURLToPath(new URL(`../../packages/${name}/dist`, import.meta.url));

/** Mock LLM：确定性输出，slotId=broken 时模拟失败。 */
const mockLLM = {
  async complete(req) {
    if (req.user.includes("槽位：broken")) throw new Error("mock LLM failure");
    const isUser = req.user.includes("按用户要求调整");
    return {
      text: JSON.stringify({
        version: 1,
        slot: "hero",
        tree: {
          component: "hero-banner",
          props: {
            title: isUser ? "用户定制标题" : "AI 增强后的标题",
            subtitle: "由 mock LLM 生成",
          },
        },
      }),
    };
  },
};

const handler = createAiRenderHandler({
  registry,
  llm: mockLLM,
  resolveSlot: (slotId) => {
    const slots = {
      hero: {
        slotId: "hero",
        originalContent: "<h1>我们的产品</h1><p>一个普通的产品介绍</p>",
        developerPrompt: "面向开发者受众，突出接入简单",
        contentVersion: "v1",
      },
      broken: { slotId: "broken", originalContent: "<h2>兜底：静态内容</h2>", contentVersion: "v1" },
    };
    return slots[slotId] ?? null;
  },
});

const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".map": "application/json" };

async function toWebRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  return new Request(new URL(req.url, "http://localhost"), {
    method: req.method,
    headers: req.headers,
    body: body.length > 0 ? body : undefined,
  });
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/ai-render/")) {
    const webRes = await handler(await toWebRequest(req));
    res.writeHead(webRes.status, { "content-type": "application/json; charset=utf-8" });
    res.end(await webRes.text());
    return;
  }
  let filePath;
  if (url.pathname.startsWith("/vendor/")) {
    const [, , pkg, ...rest] = url.pathname.split("/");
    filePath = join(pkgRoot(pkg), ...rest);
  } else {
    filePath = join(root, normalize(url.pathname === "/" ? "index.html" : url.pathname));
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[extname(filePath)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404).end("not found");
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  server.listen(4173, () => console.log("示例站: http://localhost:4173"));
}
```

`examples/plain-html/playwright.config.ts`：

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "node server.mjs",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: 写 e2e 测试**

`examples/plain-html/e2e/ai-slot.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

test("开发者提示词路径：AI 增强内容替换兜底", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("AI 增强后的标题");
  await expect(slot.locator("h1:has-text('我们的产品')")).toHaveCount(0);
});

test("用户提示词路径：editable 提交后实时更新该槽位", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="hero"]');
  await expect(slot.locator(".hero-title")).toHaveText("AI 增强后的标题");
  await slot.locator("input[name=prompt]").fill("换成更短的标题");
  await slot.locator("button[type=submit]").click();
  await expect(slot.locator(".hero-title")).toHaveText("用户定制标题");
  // 恢复默认回到原始兜底内容
  await slot.locator("button", { hasText: "恢复默认" }).click();
  await expect(slot.locator("h1")).toHaveText("我们的产品");
});

test("AI 失败路径：保持兜底内容，页面不坏", async ({ page }) => {
  await page.goto("/");
  const slot = page.locator('ai-slot[name="broken"]');
  await expect(slot.locator("h2")).toHaveText("兜底：静态内容");
  // 等待一个加载周期后依然保持兜底
  await page.waitForTimeout(500);
  await expect(slot.locator("h2")).toHaveText("兜底：静态内容");
});
```

- [ ] **Step 3: 构建依赖包并跑通 e2e**

```bash
pnpm install
pnpm build
pnpm --filter example-plain-html exec playwright install chromium
pnpm --filter example-plain-html test:e2e
```

Expected: 3 个 e2e 测试 PASS。

- [ ] **Step 4: 全仓回归**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add examples
git commit -m "feat(examples): 纯 HTML 老站接入示例与 Playwright 端到端验收（三条路径）"
```

---

## 验收清单

- [ ] `pnpm typecheck && pnpm test && pnpm build` 全绿
- [ ] `pnpm --filter example-plain-html test:e2e` 三条路径全绿
- [ ] OutputValidator 对抗性用例（伪造组件名 / 越界 props / 嵌套炸弹 / 节点炸弹 / 注入文本）全覆盖
- [ ] 客户端包中无任何 API 密钥相关代码
- [ ] 校验失败路径不白屏、不渲染未校验输出（e2e 第三条验证）
