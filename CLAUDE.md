# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指导。

## 语言约定

项目文档、代码注释、提交信息均使用**中文**，提交信息用 Conventional Commits（如 `fix(runtime): ...`）。本文件与 `AGENTS.md`、`docs/superpowers/specs/2026-09-24-ai-native-rendering-sdk-design.md`（总体设计，实现工作的最终依据）保持一致；设计文档明确列为「暂不包含（YAGNI）」的事项（AI 生成任意 HTML、客户端 DOM 补丁协议、浏览器本地推理、多租户/计费后台等）不要主动实现。

## 项目概况

**ai-slot-component**：AI Native 渲染 SDK。让任意前端页面在展示前先经 AI 补充/改写内容：页面作者把原有 HTML 包进 `<ai-slot>` 自定义元素，AI 返回**结构化组件树 JSON**（绝不返回 HTML），经校验后由各框架适配器渲染为真实组件；失败/超时/校验不过则静默回退到元素内的原始兜底内容。当前 v1 + v1.1 已全部合入 master。

## 常用命令

pnpm monorepo（Node >=18，纯 ESM，tsup 构建，无 ESLint/Prettier——类型检查是唯一静态门禁）。

```bash
pnpm install                # 安装依赖
pnpm build                  # 构建全部包（ESM 输出到各包 dist/）
pnpm test                   # 全部单元测试（Vitest）
pnpm typecheck              # 全部类型检查（依赖各包 dist 类型产物：干净 checkout 后必须先 pnpm build）
pnpm --filter @ai-slot/<包名> build|test|typecheck   # 单包命令

# 单个测试文件 / 单个用例（在对应包目录下）
cd packages/proxy && npx vitest run src/cache.test.ts
cd packages/proxy && npx vitest run src/cache.test.ts -t "用例名"

# 端到端（Playwright，7 条）
pnpm --filter example-plain-html exec playwright install chromium   # 首次
pnpm --filter example-plain-html test:e2e

# 示例站（examples/plain-html）
node prewarm.mjs            # CI 预生成 ai-cache.json
node server.mjs             # http://localhost:4173，启动时自动水合 ai-cache.json
# 真实 LLM：默认确定性 mock；设 OPENAI_API_KEY 切 OpenAI 兼容端点，
# 可选 AI_BASE_URL、AI_MODEL_DEVELOPER（默认 gpt-4o）、AI_MODEL_USER（默认 gpt-4o-mini）
```

## 架构

七个包 + 一个纯 HTML 端到端示例，依赖方向自上而下：

```
registry（协议核心，无依赖）
  ↑ 被下面所有包消费
proxy（服务端）        runtime（客户端 Web Components）
                          ↑
              adapter-dom / adapter-react / adapter-vue
                          ↑
        a2ui（可选兼容层，不反向依赖；接入点见下）
```

- **`packages/registry`** —— AI 输出协议与安全边界的所在：`types.ts` 定义 `ComponentNode` / `Registry` / `AiRenderResponse`；`define-registry.ts` 声明组件清单（props Schema、slots、dataSources，支持 `"string"` 简写并规范化）；`validator.ts` 是 OutputValidator（校验组件名、props Schema、slots 合法性、深度/节点数上限）；`skeleton.ts` 的 `deriveSkeleton` 从终树生成骨架帧。**注意 validator 在 registry 而非 proxy**，三方（代理、客户端运行时、构建工具）共用同一份校验。
- **`packages/proxy`** —— 无状态服务端代理，核心是 `handler.ts` 的 `createAiRenderHandler(): (Request) => Promise<Response>`（Web 标准接口，可直接部署到 Edge/Serverless；示例用 node `server.mjs` 包一层）。路由 `GET/POST /ai-render/:slotId`：GET 是开发者路径（长 TTL L1 缓存，可 CI 预生成）；POST 是用户路径（先限流 → `sanitize.ts` 过滤提示词 → 短 TTL L2 缓存）。流水线 `PromptCompiler → LLM Client（withRetry）→ OutputValidator → Cache`，缓存失败时按 stale 窗口回退。`openai-client.ts` 为 OpenAI 兼容实现；`prewarm.ts` 生成 `ai-cache.json`；`invalidate.ts` 暴露 `/ai-invalidate` 失效推送；SSE 场景返回双帧（先 `event: skeleton` 再 `event: tree`）。
- **`packages/runtime`** —— 零依赖客户端运行时：`ai-slot.ts` 定义 `<ai-slot>` 元素与 `configureAiSlot({ registry })`。属性：`src`（代理地址）、`name`、`renderer`（默认 dom）、`editable`（用户改写编辑器）、`stream`（SSE 骨架→终树双帧）、`live` + `live-src`（订阅失效推送，静默重载）、`refresh-interval`。`renderer.ts` 维护 `registerRenderer(name, fn)` 全局注册表并递归渲染组件树（先渲染 children 与命名 slots 再组装父节点）。**custom elements upgrade 是同步的**——引入方的 `registerRenderer`/`configureAiSlot` 必须与导入 runtime 的代码在同一 module graph 中同步执行（首帧加载只推迟一个 microtask）。
- **`packages/adapter-*`** —— 渲染适配器：`adapter-dom` 的 `createDomRenderer`（组件名 → `DomComponentDef`：`tag`/`class`/`applyProps`/`childrenTarget`；未注册组件跳过并警告，文本必须用 `textContent` 写入、禁止塞进 `innerHTML`）、`adapter-react` 的 `tree-to-react` + `<AiSlot>`、`adapter-vue` 的 `tree-to-vue` + `ai-slot` 组件。适配器把校验过的组件树映射到开发者真实组件。
- **`packages/a2ui`** —— 可选兼容层（A2UI wire format ⇄ 组件树，全仓唯一持有 A2UI 知识的包）：消费侧 `createA2uiWireFormat({ mappings })` / `a2uiWireFormat` 经 runtime 的 `registerWireFormat` 接入（信封解析、邻接表→嵌套树、mappings 改名、`{path}` 绑定与 `action` 降级、`deleteSurface` → 兜底）；生产侧 `withA2uiOutput(handler)` 包住 proxy handler 重写 JSON/SSE 响应（proxy 零改动）。Basic Catalog 双侧静态表：`basicCatalogDomDefs`（渲染，零内置 CSS）+ `basicCatalogComponentDefs`（校验，全部可选、容器声明 default 槽位）。官方 fixtures 回放测试，`tree → A2UI → parse → tree` 往返等价锁定。

**跨包测试别名**：各包 `vitest.config.ts` 把 `@ai-slot/registry` 等别名指向**源码** `../registry/src/index.ts`（不走 dist）。新增 workspace 依赖时需同步在该包 `vitest.config.ts` 加 alias，否则测试解析失败。

**示例（examples/plain-html）**：模拟老站零侵入接入——原 HTML 原样包进 `<ai-slot>`；`server.mjs` 同时挂载代理 handler、`/ai-invalidate` 与 `POST /admin/publish`（模拟数据源变更 → bump 内容版本 → 推送失效）；`hero` 槽位演示 editable/stream/live 全特性，`broken` 槽位演示静默兜底。根 README 用的截图与演示 GIF（`assets/`）由 `node capture-assets.mjs` 重新生成（需 server 运行中，ffmpeg 转 GIF）。

## 关键不变量（每个改动都要守住）

1. **AI 从不输出 HTML**：只输出组件树 JSON，组件名必须存在于注册表；这是安全边界。
2. **AI 输出永远视为不可信输入**：任何校验失败一律静默回退到 `<ai-slot>` 内的兜底内容——不白屏、不向终端用户报错。
3. **渐进增强**：`<ai-slot>` 内部永远保留原始内容，保证 SEO 与无障碍。
4. **密钥只在服务端代理**；用户提示词不直接进 LLM（sanitize 后作受限上下文注入）；所有 LLM 调用有 token 预算、8s 超时、限流与用量日志。

## 测试策略

OutputValidator（对抗性样例）> PromptCompiler（快照测试，快照在 `packages/proxy/src/__snapshots__/`）> 缓存（key/TTL/stale）> LLM Client（fixture 回放，绝不真实调 API）> runtime 对 dom 适配器的 jsdom 集成测试 > Playwright e2e。新增功能按此优先级补测试。
