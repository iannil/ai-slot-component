# Claude Code 连接公开 MCP 包验收（2026-10-21）

## 本轮范围与环境

使用本机 Claude Code 2.1.292，从公共 npm 独立安装 `@ai-slot/mcp@0.1.3`（禁用安装脚本），通过真实 stdio 连接仓库参考管理服务。服务绑定 `127.0.0.1:4194`，使用独立临时 Store 和来源快照；未使用默认用户数据目录。客户端仅获得 Agent 令牌，Owner 令牌未传入客户端。客户端输出报告模型标识为 `group/smart-split[1m]`；本记录验证 Claude Code 客户端接入，不将模型标识解释为特定 Claude 模型。

本轮已完成真实客户端生成草稿、预览、未审批拒发、用户人工批准后 Agent 发布、幂等重试、公开 HTTP 和浏览器显示核验。用户在会话中确认已批准，随后服务端接受了相同草稿的发布。回滚流程尚未使用真实客户端和人工审批重跑；本记录不代表客户试点或生产环境验收。

## 实际结果

- 首轮 `list_slots` 返回 hero，`read_slot` 返回空指针与空草稿，`get_status` 返回 desiredRevision=0。工具未提供来源版本，模型停止并报告缺少 sourceVersion，没有猜测。
- 操作者明确提供测试快照 `sourceId=cms`、`sourceVersion=s1`、`price=¥99` 后，模型生成标题“限时优惠，仅需¥99”。
- 首次建稿误用 `type: card`，返回 `invalid_tree`；模型改用 `component: card` 后成功。
- 草稿 ID：`1ddaf42f-a182-406c-a10e-5d0aae76e969`。
- 产物 hash：`36ef39fefb16b42ec1ecaf9c0d9b2763fe3cfde45e0faad2cdf394fa323220eb`。
- 基线修订：0；链接为 `https://example.com/product`。
- `preview_draft` 返回相同草稿、hash、来源版本与组件树。
- `publish_draft` 在未审批时返回 `approval_required`，符合预期。
- 用户确认在 Owner 页面完成批准后，真实客户端使用相同草稿和 hash、expectedRevision=0、幂等键 `client-validation-approved` 发布成功，返回 revision=1。
- 完全相同参数再次提交返回相同 revision/hash，没有产生第二个修订。
- `get_status` 返回 desiredRevision=1、readableRevision=1；browserObservation 仍为 null，另用 Playwright 独立核验浏览器。
- 公开 HTTP 返回 200、revision=1、相同 hash/sourceVersion；浏览器可见“限时优惠，仅需¥99”“¥99”“查看商品”，链接为 `https://example.com/product`。
- 首次浏览器文本等待在 15 秒后超时；后经当日受控实验定位为接入页模块时序竞争（见下节），与本轮 MCP 管理链路、交付服务和校验均无关。
- 审批前公开 `/ai-render/hero` 返回 HTTP 503；本轮未据此声称已观察到浏览器兜底 DOM。

## 首次加载超时根因（当日定位并复现）

示例页 `public/registry.mjs` 顶层 `await fetch('/registry.json')` 会挂起整个内联脚本依赖图（`components.mjs` 也依赖它），`configureAiSlot`/`registerRenderer` 因此晚于元素首帧执行。runtime 模块求值时 `customElements.define` 同步升级文档中的 `<ai-slot>`，`connectedCallback` 的首帧 load 只推迟一个 microtask（`packages/runtime/src/ai-slot.ts:72-77`），该 microtask 在 registry 挂起期间即执行，此时 renderer 未注册而提前返回（`ai-slot.ts:102-105`）；此后 `registerRenderer` 只写入 Map（`packages/runtime/src/renderer.ts:19`），没有任何重触发路径。

受控实验（Playwright + 独立临时服务，revision 1 已发布，可复现）：

- 实验 A（`/registry.json` 持有至 SSE 响应后 300ms）：8 秒内零次 `/ai-render/hero` 请求，页面保持兜底；手动调用 `slot.load()` 立即渲染（约 8045ms 请求、8055ms 渲染）。
- 实验 A2（`/ai-invalidate` 完全不可用、`/registry.json` 延迟 1 秒）：同样零请求并保持兜底，手动 load 立即渲染——证明缺陷是「缺重触发」，与 SSE 是否可用无关。
- 实验 B（自然冷启动 ×3）：全部在 41–51ms 发起交付请求、63–73ms 渲染。自然路径实际依赖 `live` 订阅的 `onConnect` 补偿 load（`packages/runtime/src/live.ts:75`）恰好晚于 registerRenderer 完成才成功；warm 缓存让 `/registry.json` 更快，因此重开页面通常正常。
- 服务端心跳 25 秒（`packages/proxy/src/invalidate.ts:27`）会不断重置客户端 60 秒空闲计时（`live.ts:81-83`），SSE 健康时卡死状态不会被断线重连救回。

影响面：任何 registerRenderer/configureAiSlot 晚于首个 microtask 完成的接入（动态 import、顶层 await、异步 fetch 配置）都会静默丢失首帧；无 `live` 属性的页面没有补偿路径。这属于 runtime 对「同步注册」契约缺少容错的行为缺陷，修复决策另行记录。

## 首次使用需要明确的上下文

空槽位的读取接口当前不提供来源版本或组件定义。应向 Agent 明确提供可信来源版本、允许的组件树格式和受约束属性。来源版本应来自实际服务配置或来源系统，不能直接沿用此记录的测试值。

## 人工环节与剩余范围

本轮由用户在 `/admin.html` 操作并确认批准；Agent 没有获得 Owner 令牌或调用审批端点。批准后由 Agent 提交发布，公开页面内容由独立浏览器核验。

回滚仍需准备不同的后续版本、再次人工批准并发布，再准备回滚草稿及重新审批；本轮尚未执行。批准具有有效期；测试来源也会过期，超期需重新准备有效来源及草稿。

原始客户端结果与逐工具调用日志保留在本次本机临时验收目录，未提交令牌或原始完整会话日志。
