# AI-SLOT 首阶段交付报告

日期：2026-10-10。范围：[首阶段设计](../specs/2026-10-10-ai-slot-phase-one-design.md)中的官网 W0 与数据交付 P0a。上位[产品演进设计](../specs/2026-10-10-ai-slot-product-evolution-design.md)的后续阶段仍是路线图。

## 实施范围与提交

- 官网 W0：调整双语首屏、行动入口、宿主/CMS/AI-SLOT 职责、能力状态、演示说明及公开 Agent 资料；分享卡片使用现有品牌图标。实施提交为 `2d92d73` 至 `abda469`，本次收尾提交补充图像引用与文档状态。
- 数据交付 P0a：新增公开 GET 的 `createRenderHandler` 与 `ContentProvider`，复用组件树校验及响应编码；新增本地版本化 JSON 示例，保留旧 AI 入口行为。实施提交为 `1fb08f1` 至 `7f26f28`。
- 两份已执行计划：[官网 W0](../plans/2026-10-10-ai-slot-website-w0-execution.md)、[数据交付 P0a](../plans/2026-10-10-ai-slot-data-provider-p0a-execution.md)。本报告汇总实施、审查与验证证据；执行时的 `.superpowers/sdd/` scratch 记录仅供临时核对，可在交付后清理，不作为长期引用。

## 验证与边界

- P0a 完成时：`pnpm build`、`pnpm typecheck`、240 条单元测试及 13 条 Playwright E2E 通过；同一服务实例中修改本地数据文件后，槽位读取到新版内容，文件随后恢复。
- 官网完成时：`npm run test:agent` 5/5、`npm run build`、Functions 构建与本机 HTTP 四通道检查通过；中英文、桌面及 390px 页面和局部更新演示已人工验收。本次收尾重新运行 `npm run test:agent` 与 `npm run build`。
- 官网 `npm run lint` 的既有 8 项 UI 错误为基线，未在本轮修复；修改文件单独检查未新增问题。
- 本轮未部署站点、发布 npm 包或对接商业 CMS。示例仅为本地公开数据；未实现持久版本发布、生产审批/回滚、管理型 MCP、P0b、真实宿主试点或多平台插件。

## 范围裁定

- 使用隔离工作区保留主目录；若需回迁，只涉及分支迁移。
- 不修复无关的 8 项 lint 基线；代价是全站 lint 仍不能作为全绿验收。
- 保留旧 AI 缓存语义，数据入口仅共用响应编码；未来统一入口需要另行迁移。
- 数据 provider 输出先序列化为 JSON 快照再校验与缓存，避免循环对象及 `toJSON` 改写污染缓存；代价是一次序列化开销。
- provider 生产失败时重新检查并仅使用仍在有效窗口的同版本 stale 内容；`resolveSlot` 数据源读取失败直接返回 503。代价是 stale 到期边界更严格，可能较早返回 503。
- prewarm 恢复测试断言成功结果和交付树，避免只核对调用次数而遗漏 503；代价是测试断言需随交付契约维护。
- 端到端验收使用独立临时端口，避免占用既有服务；代价是需核对与默认端口配置的等价性，测试配置未纳入产品代码。
- 旧 OG 图含无条件“zero runtime LLM cost”承诺，分享元信息改指向现有 512px 品牌图标并使用 `summary` 卡片；卡片视觉比专门的横图简单。
