# AI-SLOT 后续交付最终广审

审查日期：2026-10-11。范围：`9a5c4b1..f455f1f`；读取时 HEAD 确认为 `f455f1f`。唯一最终广审席位，未派子代理。源码、Git 和已有证据只读；唯一写入为本报告。

依据：后续交付 spec、总控及相关子计划、`docs/validation/next-delivery-status.md`、`review-followups.md`。使用已有约 560KB diff 的文件清单与分段内容，再核对当前完整源码和相关测试；没有重复生成 diff。重点覆盖 L→V→G→M→I 的调用契约，另检查 Q 的导出调整、R 的发布边界及包配置。未重跑全套测试或浏览器验收；已通过的全套结果仍归属于原实施记录。本次仅对两个具体疑点运行无磁盘写入的 Node 定向复现。

## Strengths

- 治理逻辑集中在 Operations：MCP 是固定本机 HTTP 的薄客户端，没有第二个文件写者，也没有 approve 工具。身份来自服务端令牌映射；私有请求不接受请求体身份、任意路径或跨源 Origin。
- artifact 的 hash 包含 sourceId/sourceVersion/registryVersion/rendererVersion/期限；批准、发布、回滚、公开读取复用来源和契约检查。回滚重新建稿、批准并产生新 revision；幂等命中仍先查当前授权，通知失败不撤销已持久的发布。
- FileStore 把产物、草稿、批准、release、pointer、幂等索引作为一个原子快照提交，排队事务读取最新状态。旧锁不自动抢占、nonce 匹配才解锁，rename 后异常使句柄拒绝后续写，避免把未知提交当作未提交重做。
- L 的 mountSeq/loadSeq 防止卸载和重新挂载被旧结果污染；live 握手/空闲超时、退避和连接补偿读取与 M 的有界 SSE 队列能衔接。fresh-only 在服务失败、缺少可信期限、实际到期及重新挂载时保留或恢复原始兜底。
- CMS 只读批准过的公开纯文本事实，版本由整个事实快照摘要产生；组件渲染使用注册表及 textContent，不消费 CMS rendered HTML。WordPress 插件不会将 Owner/Agent 令牌放进公开页面。
- 当前证据正确区分官网已部署、本地实现、外部验收：R3 npm 未发布；M 为 protocol_verified / agent_unverified；I 没有真实客户。WordPress 结论限定为已测自有主题的 body 隔离，不外推 head 或所有主题。

## Issues

### Critical (Must Fix)

未发现有证据支持的 Critical 缺陷。

### Important (Should Fix)

#### F1 · P2：持久层把元数据字符串限制应用到组件内容，拒绝 CMS 合法链接

- 位置：`packages/operations/src/state.ts:23`（`validString` 定义在第 9 行）；交界：`examples/cms-campaign-slot/source.mjs:48`。
- 问题：`assertState` 的通用 JSON 遍历要求所有字符串非空且不超过 200 字符，连 `artifact.tree.props` 的内容也受此限制。I 的来源契约明确允许 link 至 2048 字符，G 的注册表/链接校验也接受这些 URL；合法草稿到落盘阶段才报 `corrupt_state`。注册表允许的空文本或较长文本也存在同类不一致。
- 影响：带常见查询参数的合法商品 URL 可被 CMS 和策略接受，但不能进入草稿、批准和发布流程。这个错误还把有效输入误报为坏库，运营难以诊断。它是 V 子计划“所有字符串 <=200”与 I 子计划“link <=2048”的计划层冲突，V 实现确实遵守了原文，仍需在整合时修正契约。
- 定向证据：使用当前 dist 的 `createOperations`、`assertState`、`validateArtifact` 与参考 `createEnvironment`，内存 Store 在事务末尾执行真实 `assertState`。tree.props.link 为 `https://example.com/` 加 201 个 `a`，总长 221。输出为 `validatorAccepted true`，随后 `createDraft corrupt_state`。未写磁盘或修改实现。
- 最小修复：分开元数据/标识符校验与通用 JSON 内容校验；元数据维持非空及长度上限，props 依据注册表和树大小约束接受合法 JSON 字符串。保留总状态 64MiB、发布记录 1000、树 64KiB、hash/引用完整性和原型安全。同步记录这项跨计划裁决，避免仅把 CMS 上限削成 200 来掩盖冲突。
- 必要回归：真实 FileStore 的 201–2048 字符允许域链接建稿→重启读取→批准/发布成功；超过 CMS 2048 上限仍拒绝。补允许空文本的注册表样例，同时继续拒绝空/超长元数据。此次将修改状态字符串防线，原 deferred 的“合法 >64MiB 状态写入被拒绝、旧文件及重开仍可读”测试应一并补齐。

#### F2 · P2：异步来源读取期间批准到期，仍可提交发布或回滚

- 位置：`packages/operations/src/publishing.ts:18–19`，实际写 release 在第 44–49 行。
- 问题：只在 `await assertCurrentArtifact(...)` 之前验证 `approval.expiresAt`。来源读取可能持续数秒，返回时批准已经过期，代码直接生成新 revision。artifact 到期有读取后的复核，批准到期没有。
- 影响：Owner 给定的批准有效窗口被来源延迟延长；publish 与 rollback commit 共用此路径，都会受影响。这是审批边界的真实时间竞争，而非单纯时间精度问题。
- 定向证据：内存事务中用真实 Operations 创建/批准草稿；now=1000、批准期限=1500、来源期限=20000。发布时 `env.readSource` 将 now 推进到 1600 再返回完全相同的合法来源。结果成功返回 revision=1，存储中批准仍为 expiresAt=1500，发布时刻已为1600。
- 最小修复：来源检查完成后、修改 release/pointer/idempotency 前再检查批准期限（可保留前置快速拒绝）。成功幂等重试必须继续直接返回旧收据，不因现在期限已过而否认已经完成的提交。
- 必要回归：用可控来源 Promise 和时钟，让读取开始时批准有效、结束时到期；publish 与 rollback commit 均返回 approval_expired，旧指针、release 和幂等索引保持不变；成功收据到期后重试仍返回原结果。

### Minor (Nice to Have)

#### M1 · MCP 用例的清理链被第一个 close 错误截断

- 位置：`examples/managed-slot/e2e/mcp-stdio.spec.ts:122–125`。
- `client.close()` 或 `publicPage.close()` 抛错会跳过服务/store 和临时目录清理；固定端口使后续用例容易被污染。成功验收路径仍有效，不能据此称原成功记录造假。
- 建议在同一修复波次用逐项 try/finally 或收集清理错误的方式，保证所有清理都会尝试；删除目录须在服务/store 关闭后进行，并保留原失败信息。此项本身不是合并阻断，但值得顺手完成。

#### M2 · browserText 证据字段来自 expected 常量

- 位置：`examples/managed-slot/e2e/mcp-stdio.spec.ts:116,119`。
- 真实 DOM 的 `toHaveText` 已经在首次发布及回滚时执行，所以浏览器行为有实际断言；但输出名为 browserText 的字段却是硬编码期望，后续复制日志时不能独立表明观测来源。
- 建议在每个阶段断言后立即读取 `innerText()` 或 `textContent()`，保存实际值再输出；不要在最后统一读取，误把首版记录写成当前版。历史日志保留其原始性质，不伪造替换历史观测。

#### M3 · 英文 README 混入中文新增句

- 位置：`README.md:79`。
- live 新增说明末句为中文，破坏该文件英文读者体验；改成英文并与中文 README 对齐即可，不影响功能。

## Recommendations

### 全部 deferred minor 的最终裁决

| 项目 | 裁决 | 理由及后续动作 |
| --- | --- | --- |
| R1 预期错误 stderr 噪声 | 可后续 | 不改变错误路径或发布真实性；需要时降低测试噪声，保留断言。 |
| V 合法 >64MiB 写侧测试 | 本波补齐，纳入 F1 验证 | 当前实现确有 Buffer 字节数检查，现有测试只覆盖记录数及启动读向；不是已发现容量绕过，但 F1 会调整通用状态检查，应固定写向及旧快照恢复契约。 |
| G 幂等 publish 重复通知 | 接受当前行为 | release/receipt 幂等已保障，通知只是读取提示；SDK 支持重读，契约没有 exactly-once 通知承诺。此轮不用加入额外通知持久状态。 |
| M 固定 4194 端口碰撞 | 可后续 | 参考服务和 MCP 固定地址是已选边界。顺序运行测试、EADDRINUSE 清晰失败即可，不能停止无关进程。改成动态端口需同时修改 Host/client 契约，本波不必扩大范围。 |
| M3 redirect 断言及批准后回滚正向路径 | 已有后续补证，无新阻断 | client 有 redirect:error，M4 实际 stdio/Owner/HTTP 链执行成功回滚；不再机械重复要求同一项。 |
| M4 browserText 硬编码 | Minor M2，建议本波 | 现有真实 DOM 断言有效；改善独立证据字段。 |
| M4 client.close 失败跳过清理 | Minor M1，建议本波 | 故障时可能污染后续验收；保证清理尝试完整即可。 |
| I1 手动/CMS 来源注释 | 已修，无新动作 | createEnvironment 注释现已区分手动版本/期限与 CMS 批准事实。 |
| I NO_COLOR/FORCE_COLOR 提示 | 可后续 | 仅命令输出噪声。 |
| I 首次 WordPress 无完整 raw 日志 | 接受已披露限制 | 不补写假日志；新 body DOM 摘要支持限定结论，head、60秒完整周期、其他主题仍不得称已测。未来实际新增验收再记录。 |

### 一次统一修复波次

本次必须修 F1/F2，并完成上述定向回归及 V 写侧容量测试；M1/M2/M3 可在同一波次小范围修正。建议只运行受影响的 operations/CMS 测试和改动的 stdio 用例，不因已有全套证据重复启动整仓与浏览器全套，也避免固定端口套件并行。修复复核只核对这些 finding 的 diff/证据，不再另开一轮广审。

保留已有裁决：本地单写者、来源身份参与 hash、fresh-only 的可选性及本机时钟限制、M 的有界失效订阅、registry 公开非敏感 allowedOrigins、I 的严格工时字段。未发现需要以多租户、远程 MCP、生成 HTML/JS 或全平台插件来解决的问题。

劳动分析器会累计各任务全部记录的尝试与支持分钟、区分 wait、扣除接入/维护，要求质量和安全条件；当前空 CSV 与合成测试仍只支持 ready_for_pilot。来源和权限文本仅作为数据，未将其升级为 Agent 指令。

### 证据与发布限制

- R3 仍 blocked_external：控制器补充最新 `npm whoami` 于 01:41 仍 E401，本审未自行重查账号。旧 R1 tgz 仅代表 `95c5f1b`，不可作为新 L/M SDK 改动的发版制品；后续须重新打包、选版本、验证和真实公网安装回读。
- M 仍 protocol_verified / agent_unverified；脚本点击 Owner 按钮不等于真实运营人员批准，官方 Client 子进程不等于外部 AI 客户端验收。
- I 仍只有自有参考站，161/161 原始 Node 的 body 隔离证据不包含 head、60秒完整轮询周期或客户站点。
- 临时目录 `/private/tmp/package.json` 的历史误操作及未知覆盖范围未被本审验证恢复，不得在最终状态中改写成已恢复。

## Assessment

**Ready to merge? With fixes.**

架构与安全边界总体符合本轮范围，但 F1 阻断合法 CMS 输入交付，F2 允许已到期批准跨异步来源读取后生效，应在整合/后续 SDK 发布前修复。修复不需要改变既定架构；外部 npm、真实 Agent/Owner 和客户试点仍应分别保持其未完成状态。
