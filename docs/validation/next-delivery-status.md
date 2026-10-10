# 后续交付状态

截至 2026-10-11，本表区分已部署的 Q/R、仅在隔离分支完成的 L/V/G/M/I 参考实现，以及仍需外部条件的验收。本记录基于已提交代码与验收文档、各子计划实施报告和 Git 历史汇总；本次文档整理没有重跑完整测试。最终跨计划广审及其定向修复已在隔离分支完成；整合、推送和新版 SDK 发布仍待控制器实际执行与补记，不能将分支 HEAD 视为已上线。

状态含义：`verified` 表示该行限定范围有实际验收证据；`blocked_external` 表示剩余动作需要外部账号、客户端或真实客户条件。SHA 是本仓提交；部署 ID 只代表官网 Pages。

| 项目 | 状态与范围 | 提交/部署/版本 | 验收证据 | 外部条件或未完成项 |
| --- | --- | --- | --- | --- |
| Q 官网质量 | verified；已进 master 并随官网部署 | `874b458`、`2fa58ab`；Pages 部署见 R | 官网 lint 从 8 项降至 0；`test:agent` 5/5、build、390px 英中首屏与演示浏览器检查通过 | 无 |
| R1 数据交付包准备 | verified；仅本地制品 | `95c5f1b`；`@ai-slot/proxy@0.2.0` 待发布 | build/test/typecheck；真实 tgz 独立 npm 安装并无模型密钥返回 200；完整性见下 | npm 账号认证 |
| R2 Git 与官网 | verified；已上线官网 | `origin/master=92f3229`（其中生产源码 `95c5f1b`）；生产 `e4d622fe-2405-4a4e-9abe-48f0a54d0975` | [发布记录](../releases/2026-10-10-data-provider.md)；预览和生产读通道、官方 MCP 读取、390px 浏览器检查 | 本轮没有生产签名健康正向探测 |
| R3 npm 公开发布 | blocked_external；尚未发布 | 待发布 `@ai-slot/proxy@0.2.0` tgz | 2026-10-11 01:41 `npm whoami` 最新重试仍 E401（退出 1，控制器证据）；未执行 publish 或公网安装回读 | 本机 npm 登录及可能的 2FA |
| L 可靠交付 | verified；仅本地分支 | `f7b85e6..ff1bb61` | 重连/补偿读取、卸载隔离、命名槽位、可选 `fresh-only` 到期兜底；单测与真实浏览器故障路径，四任务复审通过 | 未整合推送/发 SDK |
| V 持久版本存储 | verified；仅本地私有包 | `81393ef..326ede4` | 单写者锁、状态校验、原子写与坏库拒绝的定向测试，两个任务复审通过 | 崩溃后旧锁需管理员确认原进程退出 |
| G 治理与交付 | verified；仅本地私有包 | `70eaf15..2fe90a4`（含 `a7b9333`、`f943439`） | 来源身份绑定、不可变草稿、人工批准、幂等发布/回滚与公开只读交付；单测/build/typecheck及四任务复审 | 未部署管理服务 |
| M 本地管理 MCP | verified（协议）；外部 Agent 未验证 | `bca1d82..a9e1fc4`；`protocol_verified / agent_unverified` | [stdio/HTTP/浏览器验收](managed-slot-acceptance.md)：官方 SDK 真子进程、7 工具无 approve、回滚修订 3；全仓检查与 managed e2e 2/2 | 外部 AI 客户端真实连接、实际运营人员批准尚未发生 |
| I 参考接入与试点准备 | verified（自有 WordPress 与准备）；仅本地 | `04790d3..5ea95fa` | [CMS 宿主证据](assets/cms-campaign/outside-dom-before-after.json)、[试点准备](pilot-readiness.md)、分析器合成测试；I1–I3 复审 | 未验证任意客户站或所有 WordPress 主题 |
| I 真实客户试点 | blocked_external | 无客户部署或真实 CSV 数据 | [授权模板](pilot-consent-template.md)、[空数据表](slot-task-log.csv) | 客户站点、负责人授权、至少三项真实配对任务与访谈均未落实 |

## 可复核的发布与验收边界

R1 的唯一待发布制品原路径为 `/tmp/ai-slot-release-pack.EmY239/ai-slot-proxy-0.2.0.tgz`，基于 `95c5f1b`，SHA512 integrity 为 `sha512-t6Uzyq72XbV+eNPfWf7+xCpb+4dv+kUFWqS6qkq5O+4wAFTYrw9q1J+5C0DzPdbp9tBrpxecf2o3T2IsyDe56A==`。原路径属于临时目录，持久证据是上述 hash、提交和[发布记录](../releases/2026-10-10-data-provider.md)。包内只有 dist、package.json、README、LICENSE；依赖转为已在 npm 的 `@ai-slot/registry@0.1.0`。这个制品不含之后的 L/M 等 SDK 改动；operations/mcp 始终 private。npm 的 `latest` 在准备时为 `0.1.0`，未核实认证前不能说 `0.2.0` 可从公网安装。后续 SDK 需要重新选版本、打包、验证与发布。

R2 将 Q/R 准备代码正常快进推送到 master，官网 Pages 的预览 ID 为 `8f41b6c9-d395-46af-a05e-7aa2a48ca23d`，生产 ID 为 `e4d622fe-2405-4a4e-9abe-48f0a54d0975`，此前成功的生产恢复点为 `1f5fcca6-1709-4c40-8ae8-4f2da143b35d`。生产 `https://aislot.dev` 与 `https://aislot.pages.dev` 首页、公开文档/MCP 读通道经实际回读；匿名 health 返回 403，生产 Secret 存在，但本轮没有签名凭据，不能把这两项当正向签名健康通过。历史签名与心跳记录见[遥测接线记录](../operations/ai-slot-telemetry-rollout.md)。

L/V/G/M/I 的测试结果来自相应实施报告，不是本次状态整理重新运行。M 的[验收记录](managed-slot-acceptance.md)保存首次成功 stdio 测试的草稿 ID/hash、修订、公开 HTTP 和浏览器文本；Owner 点击由 Playwright 脚本模拟，只能证明协议和权限链。I 的[DOM 脱敏证据](assets/cms-campaign/outside-dom-before-after.json)在同一 WordPress 7.1.3 / Twenty Twenty-Five 1.5 页面显示槽位外 body 的 SHA-256 前后同为 `2f47c525af330b398a618c8f8ecd25bfe1ab237022842ef7e61d5c87bea3d5d5`，161/161 原始 Node 仍在原路径；head、完整 60 秒轮询周期和其他主题未覆盖。I1 曾留下一段仅 59 位的来源哈希摘录，不能补作完整 SHA-256。WordPress 环境、TLS/令牌/Store 和专用 Docker 资源在验收后清理。真实 CSV 只有表头，[分析器](analyze-pilot.mjs)的通过结果全部是合成测试，不代表节省劳动或试点成效。

## 独立裁决与代价

以下记录执行中新增的裁决。历史设计与实施计划保留当时基线；裁决在此作为实际执行口径。L 的 `fresh-only` 同时出现在总控与 L 计划，只记一次并标明两处。

| 范围 | 裁决及原因 | 代价与边界 |
| --- | --- | --- |
| 总控 | 采用原生隔离工作区，只提交本轮九份计划；主目录未跟踪研究资料保留 | 如再调整需分支迁移；主目录备份位于 `/private/tmp/ai-slot-next-premerge-20261010` 与 `/private/tmp/ai-slot-premerge-20261010` |
| 总控 | 用户本轮已授权推送、官网部署、npm 发布；R 不重复请求同一许可 | 认证挑战与保护分支规则仍须实际满足 |
| R | R2 前将已审分支快进合并到本地 master 再推送；后续开发继续隔离分支 | Q/R 提前进入 master；保护分支若拒绝须走普通 PR |
| R | 查询 npm 历史时只以当前 major 的稳定版本选下一版本，并核对 `latest` 不高于当前 major | 多一次 dist-tag 核对；避免旧 major 历史永久阻断或主版本回退 |
| L | SSE 单帧缓冲 64KiB 限制在 JSON 解析前；截断/坏帧受控重连 | 超大但合法的 SSE 批次也可能重连；正常通知很小 |
| L | 首次 load 与连接补偿读取可竞争，由 `loadSeq` 只采纳最新结果 | 首次可能多一次读取，换取不漏连接前更新 |
| 总控/L | 可选 `fresh-only` 到期恢复原始兜底；G 提供 `meta.expiresAt`，M/I 显式启用 | 增加 API、metadata、计时测试；本机时钟与后台节流限制撤回精度 |
| L | 示例 SSE 用 `flushHeaders` 立即发握手头；既有 25 秒首心跳与 8 秒握手超时冲突 | 改动示例服务并以浏览器复验，客户端超时未放宽 |
| L | 断线恢复检查 hero 的 subtitle 变化 | 既有 publish 只轮换 subtitle、title 固定；字段不同于计划，但验证真实业务更新 |
| V | FileStore 加载和事务落盘前都校验；先限容量再解析；rename 后故障进入 `commit_unknown` 并拒绝继续写 | 必须重启并核对幂等结果，不自动恢复可写 |
| V | 启动失败只清理本实例创建且 nonce 匹配的锁，不抢占旧锁 | 崩溃恢复需管理员确认原进程退出 |
| G | G2 只暴露当前已实现的 Operations 子集，G3/G4 再补齐 | 中间私有 API 暂不完整，最终统一契约 |
| G | `validateArtifact` 强制 `source.id===policy.sourceId` | 配置不一致会拒绝，CMS 适配须设置匹配 ID |
| G | Artifact 将必填 `sourceId` 纳入 hash；批准/发布/交付比较历史产物、当前 policy 与实际来源身份 | 私有未发布试验快照须重建；fixtures 与完整性检查同步，无生产迁移承诺 |
| G | `readSource` reject 归 `source_unavailable`，合法返回形状错误归 `source_invalid`；M 将 `revision_conflict` 映射 409 | 私有错误码细化并更新测试，区分暂时故障 503 与输入错误 400 |
| M | proxy 失效通道加可选订阅/队列限制，默认旧行为不变；参考服务 64 订阅、每流 1 待消费帧，满队列关闭后靠重连补偿 | SDK 能力和测试增加；慢客户可能更频繁重连，首轮已验 tgz 不重打 |
| I | 公开 registry 保留既有非敏感 `allowedOrigins`，响应为 registry、registryVersion、rendererVersion、allowedOrigins | 多一个公开字段；不暴露 grants、令牌或完整 policy，也不另写一份域名限制 |
| I | 重建独立临时 WordPress 环境，比较槽位外可见宿主 DOM 与节点身份，排除必需插件脚本 | 多一次本地环境搭建；只证明参考主题和所测更新，不外推所有插件/主题 |
| I | I3 示例行缺少必填字段时以完整校验为准；API/CLI 共用 `pilot_id`、`attempt`、`wait_min` 等校验 | 内部调用者也须提供完整记录，避免统计口径分歧 |
| 最终广审 F1 | 元数据字段及标识符继续非空、最长 200；注册表允许的 JSON props 内容可为空或超过 200，CMS link 合同保留 2048 上限 | 保留 JSON 原型/完整性检查、树 64KiB、状态 64MiB、release 1000 限制；见[最终广审](../../.superpowers/sdd/2026-10-10-ai-slot-next-delivery/final-review.md)与[修复报告](../../.superpowers/sdd/2026-10-10-ai-slot-next-delivery/final-fix-report.md) |
| 最终广审 F2 | 发布及回滚在异步来源校验返回后，再次检查批准期限；成功幂等收据仍优先返回 | 来源延迟不能延长审批效力；已提交结果不会因事后到期被否认 |

## 剩余审查点与事件

最终广审在 `f455f1f` 上发现 F1（持久层误拒合法 props）和 F2（来源读取跨越审批到期仍提交）；两项均已在隔离分支修复。定向红测曾分别得到 `corrupt_state` 和 publish/rollback 误成功，修复后 operations 64/64、CMS 来源 7/7、单项 stdio Playwright 1/1 均通过；operations build 与 typecheck 通过。V 写侧合法超 64MiB 拒写、旧快照及重开可读已补测试。M1 清理链、M2 各阶段实际 DOM `browserText`、M3 英文 README 同波完成；新 stdio 日志只代表本次观测，不覆盖历史日志。具体文件及命令见[最终修复报告](../../.superpowers/sdd/2026-10-10-ai-slot-next-delivery/final-fix-report.md)。

其余 minor 裁决：R1 预期 stderr 噪声、M 固定 4194 端口碰撞、I `NO_COLOR`/`FORCE_COLOR` 提示可后续处理；G 幂等重试重复通知接受当前契约；M3 redirect 与批准后回滚已有补证，I1 来源注释已修。首次 WordPress raw 日志不补写假观测，已有 body 隔离证据仍只限所测主题，不覆盖 head 或完整 60 秒周期。

R1 有一次已向用户披露的误操作：在 `/private/tmp` 执行了 `npm init -y`，输出称写入 `/private/tmp/package.json`，当时显示 `main=ifnil-task2-service-working.js`。该路径可能原已有内容；原始值和实际覆盖范围未知，未猜测恢复，也未删除文件。随后独立消费测试改在专用临时目录执行。此事不能记作已完全恢复。

下一状态更新须以真实证据为准：隔离分支整合及推送；npm 认证后对精确包重新核对并公网回读；外部 AI 客户端和真实 Owner 运营验收；取得客户授权后才做客户站点试点与总人工劳动评估。
