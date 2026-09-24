# AI Native 渲染 SDK — 设计文档

日期：2026-09-24
状态：已确认设计，待实现

## 1. 背景与目标

设计一个通用框架/SDK，让任意前端项目的页面在正式展示前，先经由 AI 进行内容补充与改写；用户还可以通过提示词快速修改指定页面的展示。

已确认的约束：

- **通用 SDK，框架无关**：基于 Web 标准（Custom Elements + 协议层），React/Vue/纯 HTML 均可接入。
- **AI 能力范围**：内容改写 + 结构化组件生成。AI 只能在开发者注册的组件槽位内组装组件树，不输出任意 HTML/代码。
- **双层提示词**：开发者定义默认增强（可预生成 + 长缓存）；终端用户可叠加提示词对单个槽位做二次修改（实时调用）。
- **AI 调用收敛在服务端代理**（Edge/Serverless）：密钥安全、缓存、限流、降级。

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────┐
│ 开发者项目（任意栈：React/Vue/静态 HTML/Next…）            │
│                                                         │
│  <ai-slot name="hero" prompt="面向开发者重写这段文案">      │
│    <h1>原始兜底内容</h1>   ← 无 AI/失败时的 fallback       │
│  </ai-slot>                                              │
│  + registry.ts（组件注册表）                              │
└──────────────┬──────────────────────────────────────────┘
               │ ① 页面请求 / ② 用户提示词请求
               ▼
┌─────────────────────────────────────────────────────────┐
│ AI 渲染代理（Edge/Serverless，框架自带）                    │
│  PromptCompiler → LLM Client → OutputValidator → Cache  │
│  （开发者提示词页面：构建时/首请求预生成 + 长缓存）           │
│  （用户提示词：实时调用 + 短 TTL + 限流）                   │
└──────────────┬──────────────────────────────────────────┘
               │ 结构化组件树 JSON（经 Schema 校验）
               ▼
┌─────────────────────────────────────────────────────────┐
│ 浏览器：ai-slot 自定义元素运行时                            │
│  请求 → 流式接收 → 渲染组件树 → 失败时显示 fallback 内容    │
└─────────────────────────────────────────────────────────┘
```

核心原则：

1. **AI 从不输出 HTML**。它只输出组件树 JSON（组件名 + props + 嵌套关系），组件名必须存在于注册表中。这是安全边界，也保证任何前端框架都能渲染同一份输出。
2. **渐进增强**。`<ai-slot>` 内部永远保留一份原始兜底内容：禁用 JS、AI 超时、校验失败时，页面就是普通网页。SEO 与无障碍天然有保障。
3. **提示词分层**：`系统提示（框架内置）→ 注册表约束 → 页面/槽位的开发者提示词 → 用户提示词`，越往下权限越窄；用户提示词只能影响单个槽位，不能改全局。

## 3. 组件注册表与输出协议

### 3.1 组件注册表

开发者用代码声明"AI 可用的积木清单"，本质是一份 JSON Schema 集合：

```ts
// registry.ts —— 开发者项目中
export default defineRegistry({
  components: {
    "hero-banner": {
      description: "页面顶部主视觉区",
      props: {
        title:    { type: "string", maxLength: 60 },
        subtitle: { type: "string", maxLength: 120 },
        cta:      { type: "object", props: { label: "string", href: "string" } },
      },
      slots: ["media"],             // 允许嵌套哪些槽位
      dataSources: ["latestPosts"], // 声明需要的数据，代理解析后注入上下文
    },
    "post-card": { /* ... */ },
    "markdown-block": { /* 纯内容组件，AI 改写文案的主战场 */ },
  },
});
```

注册表的三个消费者：

- **代理**：编译进系统提示词 + 用作输出校验的 Schema；
- **客户端运行时**：把组件名映射到真实渲染函数；
- **构建工具**：预生成时遍历。

### 3.2 AI 输出协议

LLM 以结构化输出（JSON mode / function calling）返回：

```json
{
  "version": 1,
  "slot": "hero",
  "tree": {
    "component": "hero-banner",
    "props": {
      "title": "10 分钟接入 AI 渲染",
      "subtitle": "...",
      "cta": { "label": "开始", "href": "/docs" }
    },
    "children": [
      { "component": "markdown-block", "props": { "content": "..." } }
    ]
  },
  "meta": { "cacheHint": "1h", "reason": "developer-prompt" }
}
```

### 3.3 输出校验（OutputValidator）

依次执行，任何一项失败即丢弃结果、回退兜底内容并记日志：

1. 组件名必须在注册表内；
2. props 必须符合 Schema（类型、长度、枚举）；
3. children 必须在组件声明的 slots 内；
4. 嵌套深度与节点总数有上限（防嵌套炸弹）。

**AI 输出永远被视为不可信输入。**

### 3.4 用户提示词叠加

用户输入不直接发给 LLM，而是作为受限上下文注入：
`"在保持上述组件约束的前提下，按用户要求调整：<用户输入>"`。

- 用户提示词只能作用于它所在的单个槽位；
- 提交前做长度限制与内容过滤（防注入）；
- 最终安全仍由 OutputValidator 兜底。

## 4. 渲染代理流水线

代理是无状态 Edge/Serverless 函数，暴露两个端点：

```
GET  /ai-render/:slotId   → 开发者提示词路径（可缓存）
POST /ai-render/:slotId   → 用户提示词路径（实时，body: { prompt }）
```

单次请求流水线：

```
请求 → ① 解析槽位（取原始内容 + 开发者提示词 + 数据源的实时数据）
     → ② PromptCompiler：组装分层提示词 + 注册表 Schema
     → ③ Cache 查找（命中则直接返回）
     → ④ LLM Client：结构化输出调用，超时 8s，失败重试 1 次
     → ⑤ OutputValidator：Schema 校验
     → ⑥ 写缓存 → 响应（支持 SSE 流式：先发骨架，再发组件树）
```

### 4.1 双层缓存

| 层级 | 触发方 | Key | TTL | 备注 |
|---|---|---|---|---|
| L1 预生成 | 开发者提示词 | `hash(slotId + 内容版本 + 提示词版本)` | 长（小时/天，或构建时永久） | 可在 CI 构建时批量预生成，等同"AI 静态化" |
| L2 实时 | 用户提示词 | `hash(slotId + 规范化用户提示词)` | 短（5–15 min） | 规范化（小写、去空白、同义归一）提高命中率 |

### 4.2 成本与限流

- 用户路径默认每 IP/会话限频（如 10 次/分钟），可配置；
- LLM 调用带 token 预算上限，超长页面内容自动截断或先摘要；
- 多模型档位：开发者预生成可用大模型（一次性成本），用户实时路径默认小模型（延迟优先）；
- 全部调用记录用量日志，供计费与调优。

### 4.3 降级链

缓存过期 + LLM 失败 → 返回 stale 缓存（若有）→ 返回错误码，客户端显示兜底内容。
任何一环失败，用户看到的页面都不坏，只是"不智能"。

## 5. 客户端运行时

无依赖 Web Components 库（`<script>` 引入即可，目标体积几 KB），核心是 `<ai-slot>` 自定义元素。

```html
<ai-slot name="hero" src="/ai-render/hero">
  <!-- 兜底内容：原始渲染结果，SEO/降级都靠它 -->
  <h1>我们的产品</h1>
</ai-slot>
```

### 5.1 生命周期

1. **挂载**：读取兜底 HTML 作为原始内容摘要，向代理请求组件树；
2. **加载态**：默认保留兜底内容直到 AI 结果就绪（避免闪动），可选骨架屏；
3. **渲染**：通过渲染适配器把组件树变成真实 DOM；
4. **用户交互**：槽位可选 `editable` 属性，渲染提示词输入框（UI 可完全自定义）；提交后走 POST 路径，流式更新该槽位，附带"恢复默认"按钮。

### 5.2 渲染适配器（框架无关的关键）

```ts
registerRenderer("react", (tree) => reactElement);
registerRenderer("vue",   (tree) => vnode);
registerRenderer("dom",   (tree) => HTMLElement); // 内置默认：按注册表 tag 映射直接建 DOM
```

注册表里的 `hero-banner` 在 React 项目映射到 React 组件，在 Vue 项目映射到 Vue 组件，在纯 HTML 项目映射到内置 DOM 模板。同一份 AI 输出，三种渲染。

### 5.3 流式渲染与更新

- SSE 先返回组件骨架（结构确定、文本占位），文本内容随后逐块到达、边到边渲染；
- 数据源变化时，代理可通过 WebSocket/SSE 推送失效信号，相关槽位静默重新获取；也支持 `refresh-interval` 轮询属性。

## 6. 错误处理

原则：任何失败都退化为普通网页，永远不白屏、不显示未校验的 AI 输出。

| 失败点 | 行为 |
|---|---|
| LLM 超时/报错 | 代理返回 stale 缓存或 503；客户端保持兜底内容 |
| 输出校验失败 | 丢弃结果，记录原始输出到日志（供调优提示词），行为同上 |
| 用户提示词注入尝试 | 输入过滤 + 输出校验双保险；校验不过即丢弃，不影响其他槽位 |
| 代理整体不可用 | `<ai-slot>` 不发起渲染，页面就是静态兜底内容 |
| 组件未在客户端注册 | 运行时跳过该组件并警告，渲染其余部分 |

## 7. 测试策略

- **OutputValidator**：核心纯函数，单测覆盖各校验规则 + 对抗性样例（伪造组件名、越界 props、嵌套炸弹、注入文本）。这是系统最重要的测试资产；
- **PromptCompiler**：快照测试，验证分层提示词组装顺序与内容；
- **缓存层**：单测 key 生成、TTL、stale 回退；
- **LLM Client**：接口抽象，测试用录制 fixture 回放，不依赖真实 API；
- **客户端运行时**：针对 `dom` 适配器的集成测试（jsdom/Playwright），覆盖挂载→加载→渲染→降级全生命周期；
- **端到端**：示例项目（纯 HTML + dom 适配器）跑通"开发者提示词预生成 + 用户实时修改"两条路径。

## 8. 技术选型（2026-09-24 已确认）

- **语言/结构**：TypeScript + pnpm monorepo，包划分：`@ai-slot/registry`（协议与 Schema 类型）、`@ai-slot/proxy`（服务端代理）、`@ai-slot/runtime`（客户端 Web Component）、`@ai-slot/adapter-dom`（内置 DOM 渲染器）+ `examples/` 示例。
- **代理层**：标准 Fetch API handler（`Request → Response`），零框架依赖；Cloudflare Workers / Vercel Edge / Next.js / Node 各自包一层胶水接入。
- **LLM 层**：最小 `LLMClient` 接口（输入分层提示词 + Schema，输出 JSON），内置基于 fetch 的 OpenAI 兼容适配器（JSON mode / structured outputs），零 SDK 依赖；支持双模型档位（预生成大模型 / 实时小模型）。
- **校验层**：手写零依赖 OutputValidator + 简化 Schema DSL（type/maxLength/enum/props），服务端与客户端共用同一份校验逻辑。
- **工具链**：Vitest（jsdom 环境测客户端运行时）、tsup 输出 ESM、pnpm。

## 9. 接入方式（验收视角）

- **全新项目**：装包 → `defineRegistry` 声明组件清单 → 页面用 `<ai-slot>` 包裹内容（内部写原始兜底 HTML）→ 部署一个 Serverless 函数包装代理 handler。获得：开发者提示词预生成增强（长缓存，访问时零 LLM 延迟）+ `editable` 槽位的用户实时修改。
- **历史项目**：不改构建与业务代码。纯 HTML 站只加一个 `<script>` 标签、把现有 HTML 原样包进 `<ai-slot>`（自动成为兜底）；React/Vue 项目额外 `registerRenderer` 映射到已有组件。任何 AI 失败路径下页面与原站完全一致。
- **端到端验收示例**：一个纯 HTML 老站 + dom 适配器，跑通「开发者提示词预生成 + 用户实时修改」两条路径。

## 10. 暂不包含（YAGNI）

- AI 直接生成任意 HTML/CSS（方案 A 的能力，与安全边界冲突）；
- 客户端 DOM 补丁协议（可作为后续用户二次修改的增量更新优化）；
- 浏览器本地小模型推理（WebLLM 等，后续可作为用户路径的降级选项）；
- 多租户/计费后台（用量日志先行，后台另立项）。
