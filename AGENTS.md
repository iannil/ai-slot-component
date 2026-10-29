# AGENTS.md

本文件面向 AI 编程代理。假设读者对本项目一无所知。

## 项目概况

**ai-slot-component**：一个「存量页面的 AI 内容交付层」项目 —— 把任意存量页面的指定区域变成 AI 内容的安全上线通道：AI 返回**结构化组件树 JSON**（绝不返回 HTML），经校验后渲染为开发者的真实组件，失败/超时/校验不过一律静默回退原始内容。主场景是内容交付：构建期预生成（零运行时 LLM 成本）、失效推送让内容更新免重新部署、可接 A2UI/agent 端点；访客经提示词修改指定槽位（`editable`）是特性之一，不是主叙事。

**已发布基线：v1 + v1.1 已实现并合入 master。** 七个包（registry / proxy / runtime / adapter-dom / adapter-react / adapter-vue / a2ui）+ 纯 HTML 端到端示例均已落地，单元测试与 Playwright e2e 全绿。v1.1 在 v1 之上新增：props 全局护栏、缓存序列化与 CI 预生成、SSE 流式（`stream` 属性，骨架→终树双帧）、失效推送（`live` 属性）、React/Vue 渲染适配器。设计文档：

- `docs/superpowers/specs/2026-09-24-ai-native-rendering-sdk-design.md` —— 总体设计（含技术选型与接入方式）
- `docs/superpowers/plans/2026-09-24-ai-native-rendering-sdk.md` —— v1 实现计划（已执行完毕）

v1/v1.1 的历史设计以该文档为准；后续交付另见[设计](docs/superpowers/specs/2026-10-10-ai-slot-next-delivery-design.md)与[当前验收状态](docs/validation/next-delivery-status.md)。官网质量与首轮数据交付准备已在 master；可靠重连、私有版本治理与本地管理 MCP、WordPress 参考接入已合入并推送 master，后续九包已发布 npm；Operations/MCP 为 Node >=22 的实验性公开包。最新公开版本见[全包发布记录](docs/releases/2026-10-11-all-packages.md)，九包公网安装及完整性已验证；外部 Agent 和客户试点尚未验证。文档中明确列出的「暂不包含（YAGNI）」事项（AI 生成任意 HTML/CSS、客户端 DOM 补丁协议、浏览器本地小模型推理、多租户/计费后台）不要主动实现。v1 刻意推迟的 SSE 流式渲染（骨架→终树双帧）、失效推送（SSE 通道）、CI 构建时预生成工具和 React/Vue 渲染适配器已在 v1.1 完成；断线自动重连已随 runtime 0.2.0 发布。剩余推迟项：token 级 LLM 增量流式、多实例限流/缓存存储抽象。

## 语言约定

项目文档与注释使用**中文**。提交信息、代码注释、文档应与现有中文文档风格保持一致。

## 架构要点（来自设计文档）

实现时请遵循以下已确认的核心约束：

1. **框架无关的通用 SDK**：基于 Web 标准（Custom Elements + 协议层），React/Vue/纯 HTML 均可接入。
2. **AI 从不输出 HTML**：AI 只输出结构化组件树 JSON（组件名 + props + 嵌套关系），组件名必须存在于开发者声明的组件注册表中。这是安全边界。
3. **渐进增强**：`<ai-slot>` 自定义元素内部永远保留原始兜底内容，AI 失败/超时/校验失败时页面退化为普通网页（保证 SEO 与无障碍）。
4. **双层提示词**：开发者默认增强（可预生成 + 长缓存）+ 终端用户叠加提示词（实时调用 + 短 TTL + 限流）。用户提示词只能作用于单个槽位。
5. **AI 调用收敛在服务端代理**（Edge/Serverless）：流水线为 `PromptCompiler → LLM Client → OutputValidator → Cache`，负责密钥安全、缓存、限流、降级。
6. **AI 输出永远被视为不可信输入**：OutputValidator 依次校验组件名、props Schema、slots 嵌套合法性、嵌套深度与节点总数上限；任何一项失败即丢弃结果并回退兜底内容。

主要模块（均已落地）：

| 模块 | 职责 |
|---|---|
| 组件注册表（registry） | 开发者声明 AI 可用组件清单（JSON Schema 集合），被代理、客户端运行时、构建工具三方消费 |
| 渲染代理（Edge/Serverless） | 无状态函数，暴露 `GET/POST /ai-render/:slotId` 两个端点，含双层缓存、限流、降级链 |
| 客户端运行时 | 无依赖 Web Components 库，核心是 `<ai-slot>` 自定义元素，目标体积几 KB |
| 渲染适配器 | `registerRenderer("react" | "vue" | "dom", ...)`，把组件树映射到各框架真实组件 |
| 建站程序集成（integrations/） | 面向存量站点的适配层：`embed/` 通用嵌入包（起步组件集 + 一行接入代码）、`wordpress/plugin/` 通用 WordPress 插件（简码 + Gutenberg 区块 + Elementor 小组件）、各平台 `AGENT-INTEGRATION.md` recipe（六段式，同时面向人类与 AI 助手执行）。编写规范见 `integrations/AGENT-INTEGRATION.schema.md`，平台全景见 `docs/research/2026-10-29-site-builder-coverage-research.md` |

## 构建与测试命令

- 安装依赖：`pnpm install`
- 构建全部包：`pnpm build`（tsup，ESM 输出到各包 `dist/`）
- 运行全部测试：`pnpm test`（Vitest；runtime/adapter-dom 用 jsdom 环境）
- 类型检查：`pnpm typecheck`
- 单包命令：`pnpm --filter @ai-slot/<包名> test|build|typecheck`
- 端到端示例：`pnpm --filter example-plain-html test:e2e`（Playwright；首次需 `pnpm --filter example-plain-html exec playwright install chromium`）
- 示例站结构：`examples/plain-html` 的 `index.html` 是演示中心（行业选择），`shop/hotel/news/fin.html` 为四个行业的高保真页面（电商/酒店/新闻/理财），另有英文电商页 `shop-en.html` 供录制；槽位命名为 `<行业>-hero`（stream+live）与 `<行业>-rec`（mock 永远失败，演示兜底）。页面上没有输入框——卖点方向调整由 `admin.html` 运营控制台（`POST /admin/prompt`）完成并推送
- CI 预生成（AI 静态化）：`examples/plain-html` 下 `node prewarm.mjs` 生成 `ai-cache.json`，`node server.mjs` 启动时自动水合
- 真实 LLM：示例默认走确定性 mock；设置 `OPENAI_API_KEY` 后切换为 OpenAI 兼容端点（可选 `AI_BASE_URL`、`AI_MODEL_DEVELOPER` 默认 gpt-4o、`AI_MODEL_USER` 默认 gpt-4o-mini）

注意：`pnpm typecheck` 依赖各 workspace 包的 dist 类型产物，干净 checkout 后请先 `pnpm build`。

## 测试策略（既定方针，v1/v1.1 已按此落地）

实现时应按此策略建立测试，优先级从高到低：

1. **OutputValidator** 是最重要的测试资产：纯函数，单测覆盖各校验规则 + 对抗性样例（伪造组件名、越界 props、嵌套炸弹、注入文本）。
2. **PromptCompiler**：快照测试，验证分层提示词组装顺序与内容。
3. **缓存层**：单测 key 生成、TTL、stale 回退。
4. **LLM Client**：接口抽象，测试用录制 fixture 回放，不依赖真实 API。
5. **客户端运行时**：针对 `dom` 适配器的集成测试（jsdom/Playwright），覆盖挂载→加载→渲染→降级全生命周期。
6. **端到端**：示例项目（纯 HTML + dom 适配器）跑通「开发者提示词预生成 + 运营实时调整（/admin/prompt 推送）」两条路径。

## 安全注意事项

- **绝不渲染未经校验的 AI 输出**；校验失败必须静默回退到兜底内容，不白屏、不报错给用户。
- 用户提示词不直接发给 LLM，作为受限上下文注入，提交前做长度限制与内容过滤（防注入），最终由 OutputValidator 兜底。
- LLM API 密钥只能存在于服务端代理，禁止出现在客户端代码中。
- 所有 LLM 调用需有 token 预算上限、超时（设计定为 8s）与限流，并记录用量日志。
