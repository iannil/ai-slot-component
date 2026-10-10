# AI-SLOT 组件开发实施计划

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 未获得明确授权时不派生子代理。

**Goal:** 用低接入成本完成一次“数据/AI 创作 → 预览 → 生效 → 后续管理”的局部任务，并可核对总人工劳动。
**Architecture:** 保留七包与 v1 线协议；扩展 proxy 的内容供给；新增独立 operations 领域层与薄 MCP 适配包。浏览器渲染与管理服务分离。
**Tech Stack:** TypeScript、pnpm workspace、Vitest、现有 Web Components/适配器；参考管理服务采用 Node 与本地文件持久化，仅限单进程试点。
**Spec:** [产品演进设计](../specs/2026-10-10-ai-slot-product-evolution-design.md)

## Global Constraints

以下新 API 和文件是拟议实现，不是当前导出。保留 createAiRenderHandler 兼容；不强迫老用户接管理服务。AI 从不直接输出 HTML；新组件代码仍走审查与部署。不增加多租户/计费、通用存储抽象或整套 CMS。持久化参考实现不宣称适配多副本或无状态 Edge。

## 接口契约草案

- `ContentProvider.produce(context)` 返回 `tree` 和 `sourceVersion`；context 包含 slotId、受控数据与可选用户输入。provider 输出视为不可信，所有路径经过相同校验。
- `createRenderHandler({ registry, resolveSlot, provider, ... })` 为新通用入口；现有 `createAiRenderHandler` 用 AI provider 包装，保持原调用和协议。
- `SlotPolicy`：slotId、允许组件、registryVersion、允许来源、人工锁定字段、授权动作；不会由浏览器或 AI 自行扩权。
- `Draft`：id、slotId、tree、sourceVersion、registryVersion、baseRevision、摘要差异与校验结果。
- `Artifact`：不可变 id/tree/hash/sourceVersion/registryVersion；`PublishedPointer` 保存 revision 和 artifactId。
- `publish(draftId, expectedRevision, idempotencyKey, principal)` 返回 publishedRevision/artifactId；来源变更、权限不足或版本冲突均拒绝。
- `rollback(targetArtifactId, expectedRevision, ...)` 创建新的发布记录并指向历史产物；不删除历史，不跳过当前有效性校验。
- `getStatus(slotId)` 分别返回期望发布版本、交付端可读版本、可用的浏览器观测；没有观测不能推断所有访客生效。

所有时间、版本及字段归属由领域层决定。MCP、CLI 或未来 UI 只是调用方。

## P0：数据与 AI 共用交付入口

**修改：** `packages/proxy/src/handler.ts`、`index.ts`、`prewarm.ts`、`cache.ts`、`packages/proxy/README.md`。
**新增：** `packages/proxy/src/provider.ts`、`provider.test.ts`；`examples/plain-html/data-source.mjs`。
**测试：** 原 handler/cache/prewarm/SSE 测试及新增 provider 测试。

- [ ] 先为旧 API 记录 GET/POST、缓存、SSE、限流的兼容测试；不改变现有成功响应结构。
- [ ] 提取通用校验/响应逻辑，AI provider 保留 PromptCompiler 与预算、超时、限流链。
- [ ] 确定性 provider 由服务端映射数据到 ComponentNode；不接受客户端任意 URL，不把服务端凭据写入 props。
- [ ] 缓存隔离包含 provider 标识、sourceVersion、registryVersion、promptVersion；用户路径必须考虑来源更新和内容可见性，不能跨权限复用。
- [ ] 数据 provider 未声明交互支持时拒绝用户 prompt，不静默切换到模型。
- [ ] 预生成工具复用 provider；保存 JSON 产物，不声称输出 SSR HTML。
- [ ] 验证数据模式下 llm spy 调用为零；非法树、源失败、版本变更、缓存命中与旧 API 都有行为测试。
- [ ] 示例接本地模拟 CMS 数据接口，更新同一字段并触发失效；演示没有模型密钥也能更新。

**放行：** `pnpm --filter @ai-slot/proxy test`、`pnpm build`、`pnpm typecheck`；现有示例 e2e 无回归。

## P0b：可靠接入与组合的最小边界

**修改：** `packages/adapter-dom/src/dom-renderer.ts` 与测试；`packages/runtime/src/ai-slot.ts`、`live.ts` 与现有测试；示例注册与 README。

- [ ] DOM adapter 增加明确的命名槽位挂载映射；不支持的命名槽位报受控失败，不能静默丢内容后宣称成功。
- [ ] 新模板强制传入 registry；旧客户端缺 registry 的行为保持兼容并明确限制，变更默认行为需独立版本迁移说明。
- [ ] 测试同页多槽位、重复挂载/卸载、重复脚本与 React/Vue 边界。发现版本冲突先输出明确诊断，不先重构全局注册系统。
- [ ] 在进入长期管理试点前补 live 重连：指数退避加抖动、卸载取消、重连后主动核对当前版本；不依赖通知永不丢失。
- [ ] 防止旧请求晚返回覆盖新版本；失败时保持可用内容且对开发者提供可观察状态。
- [ ] 验证异常组件、恶意 URL props 和卸载中的异步响应；组件作者仍承担自身不可信属性处理责任。

**放行：** runtime/adapter-dom 单测，必要的 React/Vue 集成测试，`pnpm --filter example-plain-html test:e2e`。live 重连原为推迟项，本计划仅在管理闭环需要时纳入。

## P1：受控版本与发布（有真实试点后启动）

**新增包：** `packages/operations/`，按现有包增加 package.json、tsconfig.json、vitest.config.ts、README.md。
**新增源码：** `src/types.ts`、`draft.ts`、`publish.ts`、`policy.ts`、`file-store.ts`、`index.ts` 及对应 `.test.ts`。
**参考服务：** `examples/managed-slot/server.mjs`、`package.json`、`README.md`、`index.html`。

- [ ] 实现 Draft/Artifact/PublishedPointer 契约；draft 不能被公开读取端点当作线上内容返回。
- [ ] policy 校验来源版本、允许组件、锁定字段、URL 和过期事实；结构校验只是其中一步。
- [ ] 预览复用生产 registry/renderer，在独立预览入口与实际宿主尺寸下呈现；发布精确绑定预览过的产物 hash。
- [ ] 参考 file-store 使用原子写入与单进程操作队列；以不可变产物加原子 pointer 为提交边界。审计记录作为同一提交记录的一部分，测试崩溃恢复；明确不支持并行进程写入。
- [ ] 发布检查 expectedRevision 与 idempotencyKey；同请求重试返回原结果，不重复发布；并发修改返回 conflict。
- [ ] 先持久化提交，再通知失效。通知失败不撤销已提交版本；重连/读取可恢复到实际版本。
- [ ] 回滚也检查组件契约、源事实有效期与权限；若历史活动已过期则拒绝恢复，使用中性兜底。
- [ ] 示例提供最小差异页和人工确认入口，不建立完整运营 CMS；公开只读交付与私有管理路由隔离。
- [ ] 测试：重启保留版本、预览与发布一致、冲突、重复请求、源变化、人工锁定、过期回滚、提交后通知失败。

**放行：** `pnpm --filter @ai-slot/operations test`；新增 managed-slot e2e 脚本证明创建草稿→预览→发布→读取版本→回滚。此脚本应在该阶段创建，不能当作当前已存在。

## P2：外部 AI 管理 MCP

**新增包：** `packages/mcp/`，配置参照同仓包；`src/server.ts`、`tools.ts`、`auth.ts`、`index.ts` 及测试。
**修改：** managed-slot 示例、`docs/agent-access.md`；新增 `docs/managed-slot-mcp.md`。

拟议工具：`list_slots`、`read_slot`、`create_draft`、`preview_draft`、`publish_draft`、`get_status`、`rollback_slot`。工具名在接口评审后固定；官网目前的 search_docs/read_doc 不变。

- [ ] MCP 使用官方 SDK，实施时核实兼容版本；不从官网公共 Functions 导入写入权限。
- [ ] 首期本地 stdio 或单站点受控部署，凭据映射 principal 的槽位/动作权限。远程开放前另行完成符合 MCP 要求的认证与会话设计；静态示例 token 不包装成公共 SaaS 鉴权。
- [ ] 工具只调用 operations；返回结构化结果、revision、冲突/拒绝原因，不仅返回自然语言“成功”。
- [ ] 预览不会隐式发布；允许用户预先授权低风险发布，未授权动作受明确限制。AI 不能修改自身 policy。
- [ ] 将 CMS 文本/提示词视为数据；其中要求越权发布的文字不成为权限依据。
- [ ] 用官方 MCP 客户端测试工具发现、正常闭环、跨槽位越权、失效凭据、发布重试与冲突。
- [ ] 一个实际外部 AI 客户端完成授权任务并核对公开版本；协议测试与真实 Agent 操作分别记录。

**放行：** MCP/operations 单测 + managed-slot e2e；只在通过后更新官网“管理 MCP 可用”状态。

## V1：降低接入劳动的任务包

**新增：** `examples/cms-campaign-slot/`（README、最少组件注册、服务端映射、宿主嵌入示例）、`docs/integrations/cms-campaign.md`、`docs/validation/slot-task-log.csv`。

- [ ] 打包标准介绍区组件、设计 token、字段映射与发布策略；一次安装可供后续任务复用。
- [ ] 不另建商品/文章数据库；源字段只读。配置明确安装、首次发布、卸载和撤权行为。
- [ ] 在一个真实宿主测试 CSP、样式、编辑器/预览/线上差异、响应式、键盘、加载失败；记录实际版本和套餐条件。
- [ ] 记录安装、每次生成、审阅、纠错、发布、维护分钟及失败原因；与同任务原流程比较。
- [ ] 只有第一宿主证明增量后，选择第二宿主测试复用；优先薄封装，不复制核心引擎。

## 后续候选及触发条件

- 可复用组件配方：多个任务实际重复相同组合后再抽象；配方也要版本与校验。
- 计划生效/到期：真实任务需要后增加幂等调度与时区/失败恢复测试，MCP 自身不是调度器。
- 新组件代码生成助手：注册组件不足成为反复阻碍时，通过 skill/PR 流程增加；不进入浏览器热执行。
- 宿主原生草稿回写：客户明确需要原生编辑或 SSR 时，针对一个平台实现，不推广通用双向同步。
- 多实例存储、跨实例限流与分发：明确部署需求后另立设计；单进程参考服务不得直接横向扩容。

## 总体验收与停止条件

各阶段完成相关测试后只做一次全仓 `pnpm build`、`pnpm test`、`pnpm typecheck` 和相关 e2e；新失败或后续修改才重复。不要为只改官网文案运行无关全套 SDK 测试。

交付清单包括 API/迁移说明、能力状态、已知限制、可复现示例、测量记录和回退方案。仍无真实试点时停在 P0；试点显示原平台已有能力足够、总劳动不降或支持成本不可承受时停止扩展，修正任务假设。

本计划不包含修改代码、部署、联系客户或收费操作的执行结果；上述均未在本轮执行。

## 首阶段执行细化

首阶段按[细化执行计划](2026-10-10-ai-slot-data-provider-p0a-execution.md)实施；具体缩小范围与兼容策略见[首阶段设计](../specs/2026-10-10-ai-slot-phase-one-design.md)。本文件保留为完整路线图，后续阶段不因细化而自动进入施工。
