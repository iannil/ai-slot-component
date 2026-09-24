# AGENTS.md

本文件面向 AI 编程代理。假设读者对本项目一无所知。

## 项目概况

**ai-slot-component**：一个「AI Native 渲染 SDK」项目 —— 让任意前端项目的页面在正式展示前，先经由 AI 进行内容补充与改写；终端用户还可以通过提示词快速修改指定页面的展示。

**当前阶段：v1 已实现并合入 master。** 四个包（registry / proxy / runtime / adapter-dom）+ 纯 HTML 端到端示例均已落地，86 个单元测试 + 3 个 Playwright e2e 全绿。设计文档：

- `docs/superpowers/specs/2026-09-24-ai-native-rendering-sdk-design.md` —— 总体设计（含技术选型与接入方式）
- `docs/superpowers/plans/2026-09-24-ai-native-rendering-sdk.md` —— v1 实现计划（已执行完毕）

任何实现工作都应以该设计文档为准。文档中明确列出的「暂不包含（YAGNI）」事项（AI 生成任意 HTML/CSS、客户端 DOM 补丁协议、浏览器本地小模型推理、多租户/计费后台）不要主动实现。v1 刻意推迟、后续可立项的事项：SSE 流式渲染、WebSocket 失效推送、CI 构建时预生成工具、React/Vue 渲染适配器（`registerRenderer` 接口已预留）。

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

规划中的主要模块：

| 模块 | 职责 |
|---|---|
| 组件注册表（registry） | 开发者声明 AI 可用组件清单（JSON Schema 集合），被代理、客户端运行时、构建工具三方消费 |
| 渲染代理（Edge/Serverless） | 无状态函数，暴露 `GET/POST /ai-render/:slotId` 两个端点，含双层缓存、限流、降级链 |
| 客户端运行时 | 无依赖 Web Components 库，核心是 `<ai-slot>` 自定义元素，目标体积几 KB |
| 渲染适配器 | `registerRenderer("react" | "vue" | "dom", ...)`，把组件树映射到各框架真实组件 |

## 构建与测试命令

- 安装依赖：`pnpm install`
- 构建全部包：`pnpm build`（tsup，ESM 输出到各包 `dist/`）
- 运行全部测试：`pnpm test`（Vitest；runtime/adapter-dom 用 jsdom 环境）
- 类型检查：`pnpm typecheck`
- 单包命令：`pnpm --filter @ai-slot/<包名> test|build|typecheck`
- 端到端示例：`pnpm --filter example-plain-html test:e2e`（Playwright，首次需 `pnpm --filter example-plain-html exec playwright install chromium`）

注意：`pnpm typecheck` 依赖各 workspace 包的 dist 类型产物，干净 checkout 后请先 `pnpm build`。

## 测试策略（既定方针，v1 已按此落地）

实现时应按此策略建立测试，优先级从高到低：

1. **OutputValidator** 是最重要的测试资产：纯函数，单测覆盖各校验规则 + 对抗性样例（伪造组件名、越界 props、嵌套炸弹、注入文本）。
2. **PromptCompiler**：快照测试，验证分层提示词组装顺序与内容。
3. **缓存层**：单测 key 生成、TTL、stale 回退。
4. **LLM Client**：接口抽象，测试用录制 fixture 回放，不依赖真实 API。
5. **客户端运行时**：针对 `dom` 适配器的集成测试（jsdom/Playwright），覆盖挂载→加载→渲染→降级全生命周期。
6. **端到端**：示例项目（纯 HTML + dom 适配器）跑通「开发者提示词预生成 + 用户实时修改」两条路径。

## 安全注意事项

- **绝不渲染未经校验的 AI 输出**；校验失败必须静默回退到兜底内容，不白屏、不报错给用户。
- 用户提示词不直接发给 LLM，作为受限上下文注入，提交前做长度限制与内容过滤（防注入），最终由 OutputValidator 兜底。
- LLM API 密钥只能存在于服务端代理，禁止出现在客户端代码中。
- 所有 LLM 调用需有 token 预算上限、超时（设计定为 8s）与限流，并记录用量日志。
