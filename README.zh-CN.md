<div align="center">

<img src="./assets/logo.svg" alt="ai-slot logo" width="72" />

# ai-slot-component

**存量页面的 AI 内容交付层。**

[English](./README.md) | 简体中文

[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![runtime deps](https://img.shields.io/badge/%3Cai--slot%3E-zero%20dependencies-blue)](./packages/runtime)
[![React](https://img.shields.io/badge/React-%E2%89%A518-61DAFB?logo=react&logoColor=black)](./packages/adapter-react)
[![Vue](https://img.shields.io/badge/Vue-%E2%89%A53.4-4FC08D?logo=vuedotjs&logoColor=white)](./packages/adapter-vue)
[![npm](https://img.shields.io/npm/v/@ai-slot/runtime)](https://www.npmjs.com/package/@ai-slot/runtime)

</div>

存量页面已经有内容、爬虫和用户，缺的是一个安全**接收** AI 生成内容的途径。ai-slot 就是这一层：把页面中的一块区域包起来，把初始 HTML 作为兜底内容。运行时替换可见内容时，会保留一份兜底副本用于恢复：

```html
<ai-slot name="hero" src="/ai-render/hero">
  <section class="hero">
    <h1>我们的产品</h1>
    <p>一个普通的产品介绍。</p>
  </section>
</ai-slot>
```

这个元素背后是一条交付流水线：无状态服务端代理把模型输出变成**经过校验的组件树**（绝不返回 HTML），由适配器渲染成你真实的组件——经双层缓存交付、可骨架帧流式、数据源变更时重新推送。一旦模型超时、编造组件名或违反 props Schema，上面的原始标记会静默保留。初始 HTML 的兜底内容不依赖模型；收录、无障碍与页面可用性仍取决于宿主应用。

内容进入槽位有三种交付方式——访客个性化只是其中之一：

| 交付方式 | 触发 | 路径 |
|---|---|---|
| **预生成** | 构建期（`prewarm.mjs`） | 烘焙进 `ai-cache.json`，长 TTL 缓存，缓存命中时无需运行时 LLM 调用 |
| **实时更新** | 数据源变更 | 失效推送让所有打开的页面自动重渲染——无需发版 |
| **个性化** | 访客提示词（`editable`） | 清洗、限流、短 TTL——只作用于该槽位 |

## 快速开始

前置要求：Node ≥ 18、[pnpm](https://pnpm.io)（`corepack enable`）。无需 API 密钥——示例默认使用确定性 mock LLM。

```bash
git clone https://github.com/iannil/ai-slot-component
cd ai-slot-component
pnpm install && pnpm build
node examples/plain-html/server.mjs
# → 打开 http://localhost:4173
```

示例站打开后是行业选择页：电商、酒店、新闻、理财四个贴近真实业务的存量页面。hero 槽位带 `stream` + `live`，推荐槽位的 AI 永远故障以演示静默兜底。页面上没有输入框——调整者是运营/开发者：`admin.html` 运营控制台（或 `POST /admin/prompt?slot=<槽位名>&prompt=<新提示词>`）改卖点方向，`POST /admin/publish?slot=<槽位名>` 模拟数据源变更，两者都通过失效推送让打开的页面原地更新；`node examples/plain-html/prewarm.mjs` 烘焙 `ai-cache.json` 走预生成路径。[项目官网](https://aislot.dev)内嵌了同一套页面的交互演示——浏览器里跑真实运行时，按高亮引导逐步手动操作；示例站本身也已[部署在 Cloudflare Workers 上](https://demo.aislot.dev)可直接体验。

切换到真实模型：

```bash
OPENAI_API_KEY=sk-... node examples/plain-html/server.mjs
# 可选：AI_BASE_URL（任意 OpenAI 兼容端点）
# 可选：AI_MODEL_DEVELOPER（默认 gpt-4o）/ AI_MODEL_USER（默认 gpt-4o-mini）
```

跑起来了？点个 GitHub Star 能帮更多人看到这个项目。

<p align="center">
  <img src="assets/demo.gif" alt="一段录屏看三种交付方式：加载时 AI 内容流式上屏，数据源变更免发版原地更新标题，最后运营控制台改卖点方向推送生效" width="720">
</p>
<p align="center">
  <img src="assets/screenshot-hero.png" alt="AI 增强后的 hero：由校验过的组件树渲染" width="49%">
  <img src="assets/screenshot-rewritten.png" alt="运营发布新提示词后：同一槽位按新卖点方向重新渲染" width="49%">
</p>

## 特性

- **老站即插即用** —— 把现有标记包进 `<ai-slot>` 即可；纯 HTML、React、Vue 都能接，无需重写。
- **AI 内容当静态资源发** —— `prewarm.mjs` 在构建期把开发者提示词烘焙进 `ai-cache.json`，生产环境缓存命中时无需运行时 LLM 调用。
- **内容更新不发版** —— `live` 订阅失效推送；数据源一变，所有打开的页面自动重渲染。
- **骨架帧优先的流式** —— `stream` 走 SSE：先渲染骨架帧，终树到达后替换。
- **协议中立** —— 今天说原生 JSON，明天经 `@ai-slot/a2ui` 说 [A2UI](https://github.com/a2ui-project/a2ui)；端点换了，页面不用改。
- **访客个性化按槽位选配** —— `editable` 给该槽位加一行提示词输入框：清洗、限流、短 TTL。
- **开箱即离线** —— 默认确定性 mock LLM；单元测试用 fixture 回放，绝不真实调 API。

## 为什么安全

- **模型永远不写标记。** 它只返回组件树 JSON，组件名必须存在于你声明的注册表，并在渲染前通过 props Schema、slots 规则、嵌套深度与节点数上限校验。这限制了模型输出范围；应用组件仍需安全处理不可信 props。
- **交付失败时回退。** 已处理的失败——网络、超时、限流、非法输出——都静默回退到 `<ai-slot>` 内的原始内容。不白屏，也不向访客报错。
- **密钥只留在服务端。** LLM 密钥只存在于代理；访客提示词经清洗、限长后作为受限上下文注入，并配有 token 预算、8s 超时、每分钟限流与用量日志。
- **初始 HTML 包含作者提供的兜底内容。** 成功渲染后，运行时替换槽位的可见子节点，并保留兜底副本用于恢复；执行 JavaScript 的爬虫可能看到增强内容，不保证收录。

## 协议中立的设计

ai-slot 分为三层：

1. **槽位协议** —— AI 端点与页面之间的线格式。原生 JSON 之外，[A2UI](https://github.com/a2ui-project/a2ui)（Google 开源的 agent 驱动 UI 协议）经 [`@ai-slot/a2ui`](./packages/a2ui) 同样可用。
2. **交付运行时** —— `<ai-slot>`、客户端二次校验、已处理失败的回退恢复。
3. **生命周期基础设施** —— 双层缓存、构建期预热、失效推送、限流。

使用 `@ai-slot/a2ui` 已支持版本与消息子集的端点可以接入存量页面：

```ts
import { defineRegistry } from "@ai-slot/registry";
import { createDomRenderer } from "@ai-slot/adapter-dom";
import { configureAiSlot, registerRenderer, registerWireFormat } from "@ai-slot/runtime";
import { a2uiWireFormat, basicCatalogComponentDefs, basicCatalogDomDefs } from "@ai-slot/a2ui";

const registry = defineRegistry({
  components: { ...basicCatalogComponentDefs /* , your brand components */ },
});
registerWireFormat("a2ui", a2uiWireFormat);
registerRenderer("dom", createDomRenderer(basicCatalogDomDefs));
configureAiSlot({ registry, onFailure: (f) => console.debug(f) });
```

| | A2UI / AG-UI | ai-slot |
|---|---|---|
| 层级 | agent ↔ 应用内 UI 的线格式（Google / CopilotKit） | 公开网页内容槽位的交付层——经 `@ai-slot/a2ui` 说 A2UI |
| 存量页面 | 由宿主应用决定接入方式 | 包裹既有 HTML，并提供明确的兜底内容 |
| SEO 与爬虫 | 取决于宿主渲染方式、访问条件和爬虫能力 | 初始 HTML 包含作者提供的兜底内容；生成内容在客户端渲染 |
| 生命周期 | 协议不决定宿主应用的缓存和交付生命周期 | 双层 TTL、构建期预热、失效推送、限流 |

## 渲染与收录边界

`prewarm.mjs` 生成的是 `ai-cache.json`，不是 HTML。命中预热缓存时无需调用模型；缓存失效或未命中时仍可能调用。生成的组件树由浏览器获取并渲染。如需把生成正文写进初始 HTML，宿主必须另外实现静态或服务端渲染集成，当前示例不提供该能力。

Google 可以渲染 JavaScript，其他爬虫的能力可能不同。初始响应应包含有用的兜底内容，并检查部署后的实际页面。参见 [Google JavaScript SEO 指南](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)与[交付边界说明](./docs/delivery-boundaries.md)。

## 用法

> 各包已发布到 npm（`@ai-slot/*`）：客户端 `npm install @ai-slot/runtime @ai-slot/adapter-dom`（A2UI 端点另装 `@ai-slot/a2ui`）；服务端 `npm install @ai-slot/proxy @ai-slot/registry`。若要参与 monorepo 开发，克隆后 `pnpm install && pnpm build`。

**1. 声明 AI 可用的积木**（代理、运行时、构建工具三方共用）：

```ts
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
  },
});
```

**2. 接上代理** —— Web 标准 `(Request) => Promise<Response>`，可直接部署到 Node、Edge 或任意 Serverless 运行时：

```ts
import { createAiRenderHandler, createOpenAIClient } from "@ai-slot/proxy";
import { registry } from "./registry.js";

export const handler = createAiRenderHandler({
  registry,
  llm: createOpenAIClient({ apiKey: process.env.OPENAI_API_KEY! }), // baseUrl：任意 OpenAI 兼容端点
  resolveSlot: (slotId) => slots[slotId] ?? null,
});
// 暴露 GET/POST /ai-render/:slotId —— GET 走 CI 预生成，POST 走实时交付（含访客提示词）。
```

**3. 渲染** —— 按你的技术栈选：

```html
<!-- 纯 HTML -->
<script type="module">
  import { configureAiSlot, registerRenderer } from "@ai-slot/runtime";
  import { createDomRenderer } from "@ai-slot/adapter-dom";
  import { registry } from "./registry.js";
  import { domComponents } from "./components.js";

  registerRenderer("dom", createDomRenderer(domComponents));
  configureAiSlot({ registry });
</script>
```

```tsx
// React ≥ 18 —— 任何失败保留 fallback，语义与 Web Component 一致
<AiSlot src="/ai-render/hero" components={{ "hero-banner": HeroBanner }} fallback={<HeroStatic />} editable />
```

```vue
<!-- Vue ≥ 3.4 —— 默认 slot 即兜底内容 -->
<AiSlot src="/ai-render/hero" :components="vueComponents">
  <HeroStatic />
</AiSlot>
```

### `<ai-slot>` 属性

| 属性 | 作用 |
|---|---|
| `src` | 该槽位的代理端点（`/ai-render/:slotId`） |
| `name` | 发送给代理的槽位 id |
| `renderer` | 使用的已注册渲染器（默认 `dom`） |
| `stream` | 走 SSE：先骨架帧，后终树 |
| `live` | 订阅失效推送，内容变更时自动重渲染（`live-src` 可覆盖端点） |
| `refresh-interval` | 每 N 秒重新拉取 |
| `editable` | 加一行提示词输入框，实时改写该槽位 |

## 交付流水线

```mermaid
graph TD
    A["页面中的 ai-slot 元素"] -->|"GET / POST /ai-render/:slotId"| B["无状态代理（Edge / Serverless）"]
    B --> C["PromptCompiler"]
    C --> D["LLM（OpenAI 兼容）"]
    D --> E["OutputValidator"]
    E -->|"合法组件树"| F["缓存：L1 开发者 / L2 访客"]
    F -->|"JSON，或 SSE 骨架 + 终树"| G["适配器渲染你的真实组件"]
    E -->|"非法 / 超时 / 限流"| H["静默兜底：原始内容保留"]
```

## 包一览

| 包 | 职责 |
|---|---|
| [`@ai-slot/registry`](./packages/registry) | 协议核心：`defineRegistry`、组件树类型，以及代理、运行时、工具三方共用的 `OutputValidator` |
| [`@ai-slot/proxy`](./packages/proxy) | 无状态渲染代理：提示词编译、LLM 调用、校验、双层缓存、限流、SSE、失效推送、预生成 |
| [`@ai-slot/runtime`](./packages/runtime) | 零依赖 `<ai-slot>` Web Component + `registerRenderer` 注册表 |
| [`@ai-slot/adapter-dom`](./packages/adapter-dom) | 把组件树映射为纯 DOM（`tag` / `class` / `applyProps`），无需框架 |
| [`@ai-slot/adapter-react`](./packages/adapter-react) | `treeToReact` + `<AiSlot>` 组件 |
| [`@ai-slot/adapter-vue`](./packages/adapter-vue) | `treeToVue` + `AiSlot` 组件 |

## 开发

```bash
pnpm build                 # 构建全部包（ESM → dist/）
pnpm test                  # 全部单元测试（Vitest）
pnpm typecheck             # 依赖 dist 类型产物：干净 checkout 后先跑 pnpm build

pnpm --filter @ai-slot/runtime test            # 单包测试
cd packages/proxy && npx vitest run src/cache.test.ts   # 单个测试文件

# 端到端（Playwright，共 7 条）
pnpm --filter example-plain-html exec playwright install chromium
pnpm --filter example-plain-html test:e2e

# CI 预生成（生成 ai-cache.json，服务启动时自动水合）
node examples/plain-html/prewarm.mjs
```

类型检查是唯一的静态门禁——仓库没有 ESLint/Prettier 配置。

## 面向 AI 编程代理

- 仓库指南：[CLAUDE.md](CLAUDE.md) 与 [AGENTS.md](AGENTS.md)。实现工作的最终依据是 `docs/superpowers/specs/` 下的设计文档。
- 示例默认跑确定性 mock LLM，无需联网、无需密钥，`pnpm build && node examples/plain-html/server.mjs` 是代理可以安全执行的冒烟验证。
- `OutputValidator` 是纯函数，对抗性样例在 `packages/registry`——安全边界在这里，而不是提示词里。

## 项目状态

v1 与 v1.1 已全部合入 master：props 全局护栏、缓存序列化 + CI 预生成、SSE 流式、失效推送、React/Vue 适配器。

刻意推迟：token 级 LLM 增量流式、`live` 自动重连、多实例限流/缓存存储抽象。明确不做（YAGNI）：AI 生成任意 HTML/CSS、客户端 DOM 补丁协议、浏览器本地推理、多租户/计费后台。

## 参与

欢迎提 Issue 与 PR——架构、命令与约定见 [AGENTS.md](AGENTS.md)（Conventional Commits，中文提交信息）。

缺陷与功能请求：[GitHub Issues](https://github.com/iannil/ai-slot-component/issues)。

## 许可证

基于 [MIT 许可证](./LICENSE) 发布。
