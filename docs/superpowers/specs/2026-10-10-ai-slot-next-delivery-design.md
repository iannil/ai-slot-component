# AI-SLOT 后续交付设计

日期：2026-10-10。状态：待执行。基线：master / 9a5c4b1；首阶段已本地合并，尚未推送、部署或发布。本文件补充上位演进设计，覆盖本次用户列出的全部剩余工作。用户已确认没有落实的客户，先做参考闭环与试点准备；因此解除“没有试点就不开发参考管理闭环”的旧路线图限制，但不授权把参考实现宣传成生产 SaaS。

## 交付拆分与依赖

| 子项目 | 产物 | 依赖 | 完成定义 |
|---|---|---|---|
| Q 官网质量 | 消除 8 项源码 lint 和临时产物误扫 | 当前基线 | lint 0 error/0 warning，构建与 Agent 测试通过 |
| R 首轮发布 | Git 远端、现有官网、proxy 新 npm 版本 | Q | 可查询的提交/部署/包版本及外部安装烟测 |
| L 可靠交付 | SSE 重连补偿、卸载隔离、DOM 命名槽位 | 当前基线 | 断线期间漏通知可恢复，旧响应不能覆盖新挂载 |
| V 持久版本 | operations 数据模型、单写者文件库 | 当前基线 | 重启保留完整状态，失败不会出现半条发布记录 |
| G 发布治理 | 草稿、预览、人工批准、发布、回滚 | V、L | hash 绑定，权限/来源/冲突校验，公开端点只读发布内容 |
| M 本地管理 MCP | 7 个薄工具及本地参考服务 | G | 官方客户端与外部 Agent 均完成有权限的闭环 |
| I 接入与试点 | 一个通用 CMS JSON 契约+WordPress 示例适配、宿主模板、劳动记录 | G；Agent试用依赖M | 自有站验证与真实试点分开；没有客户时交付准备材料 |

Q/R 先做，不必等待后续功能；L 与 V 无代码依赖，执行时仍按选定工作流避免同工作区并发编辑。顺序建议 Q→R→L→V→G→M→I。R 只发布已完成的七包体系中的变更包；L/G/M 不搭车首轮发版。后续 SDK 发版沿用 R 的流程、重新选版本。新 operations/mcp 包先不公开发布。

## 本轮已核对的事实

- live.ts 当前断流即退出；ai-slot.ts 有 loadSeq，但 disconnectedCallback 未使在途加载失效。
- adapter-dom 当前忽略命名 slots，不能据此声称与真实预览一致。
- npm 包当前仓库版本不统一：proxy 0.1.0、runtime 0.1.2；公网占用版本在发布执行时再查，不把计划日期的版本当永久事实。
- 全站 lint 在主目录显示 17 项：8 项源码错误，9 项来自 .wrangler 生成物。Q 必须同时修复扫描范围与源码，不删除临时目录来伪造全绿。
- Pages production branch 是 main（官网 README 已明确）；Git push 仍为 origin master。
- operations、管理 MCP、管理参考服务和平台连接包均尚不存在。

## 领域契约

新增 operations 为 Node 包；公开投递保持 version:1 线协议。治理全程使用同一个服务端注册表与 rendererVersion。每槽位配置 {slotId, registryVersion, rendererVersion, allowedComponents, sourceId, lockedProps, urlProps, allowedOrigins}。锁定规则采用 component+prop+sourceField，首期只支持顶层 prop 与源顶层字段，拒绝不支持的复杂路径。

Source = {id,version,expiresAt,data}；version 必须代表整个不可变事实快照，不能只依赖低精度时间戳。草稿绑定 sourceVersion、registryVersion、rendererVersion、baseRevision、artifactHash。产物与草稿不允许就地修改；改动产生新草稿。批准绑定同一组字段且有到期时间；preview 返回 hash 是可核对的预览材料，不是假装人已审阅的证据。

管理动作 read/draft/approve/publish/rollback 对每个 principal 单独授予槽位权限；principal 来自服务端能力令牌映射，禁止请求体指定身份。Agent 默认可 read/draft，publish/rollback 必须配置授权；MCP 不暴露 approve。人工批准由单独的本地 owner UI 调用，令牌不传给 Agent。已批准并获授权的 Agent 可发布；没有授权不反复弹“确认”替代权限控制。后续低风险自动审批策略不包含在此轮。

发布校验顺序：身份→动作/槽位权限→幂等结果查询→输入/审批hash→当前revision→当前注册表/renderer→重读来源并比对→锁定字段/链接/有效期→持久事务→尽力通知。幂等键按 principal+slot+action+key 分隔，同键异参拒绝；重试已成功发布不再次要求旧revision匹配，但当前权限仍必须通过。read/getStatus 不产生草稿或发布。

回滚复用正常管线：先把历史产物作为新的候选草稿检查当前来源与契约，再人工批准，用 rollback 动作发布到新revision。源版本不匹配或过期则拒绝，不用旧优惠冒充当前事实。当前过期或源校验失败的公开读取返回503，浏览器使用中性原始兜底。status区分 desiredRevision、readableRevision、browserObservation:null；不能声称所有访客已生效。

## 持久化边界

采用单 JSON 状态快照+同目录 temp/fsync/rename+目录fsync，状态包含草稿、产物、审批、发布记录、指针与幂等索引；它们是一个提交单元。事务队列每次读取最新状态，clone后执行变换，只有落盘成功才返回。启动独占 writer.lock；同一目录第二进程拒绝。崩溃残留锁需管理员确认原进程已退出后人工恢复，不能按超时自动抢锁。只承诺本地支持原子rename的文件系统；NFS/云同步目录与多实例不支持。rename后fsync失败属于提交结果未知，服务停止写入并重启核对幂等结果，不盲目重做。

应用语义不可变不等于抵抗管理员修改磁盘；启动校验结构、产物hash与引用完整性，损坏时拒绝启动而非静默清空。限制状态64MiB/1000条发布记录，达到上限拒绝写并报告需要备份迁移，不静默删历史。

## 预览和接入

本地参考服务器127.0.0.1:4194，公开示例树路径与私有管理路径隔离；允许的业务URL默认https://example.com，生产配置替换为明确宿主域名。私有请求仅 Authorization Bearer；owner UI手动输入owner令牌、只存内存、不写URL/localStorage；拒绝跨源Origin，不打开管理CORS。预览页在当前用户会话中取私有draft JSON，用既有runtime+DOM组件渲染，经同一registry验证；独立320/768/1280px预览窗口，周边真实宿主验收在I进行。

CMS首期为管理员配置的固定HTTPS JSON端点，Node服务读取，浏览器不拿凭据；只接受归一化纯文本字段，不消费 rendered HTML。WordPress示例提供专用只读REST路由，输出站长显式批准的campaign事实，路由参数不能任意读取草稿或私有文章；不能把generic content.rendered直接变innerHTML。新组件源码仍走仓库审查/部署，MCP只组合注册组件。

## 商业验证与状态门槛

当前可完成：参考站、接入说明、候选筛选标准、访谈/邀请草稿、记录表、计时分析脚本、预演。不能代为假定客户允许接入或主动发送邀请。真实试点需要一个站点负责人明确授权、3–5次可重复更新、可比较的原流程记录及撤回方案；未落实则状态 ready_for_pilot，不能写 validated。

试验阈值（内部决策规则，非市场事实）：至少3个同类配对任务；新流程人工时间中位数下降>=30%；累计节省扣除初次接入与额外维护后>0；无越权发布、事实篡改或严重页面故障。保留所有失败尝试和支持分钟。达不到则缩小场景或停止扩展；第二平台与收费系统不自动启动。

## Global Constraints

- 文档与新增注释使用中文；既有英文用户文案按双语约定维护。
- 核心 SDK 保持 Node >= 18，不增加运行时依赖；新管理参考服务使用 Node >= 22，仅单进程、本地磁盘。
- AI 只提交结构化组件树 JSON；所有新交付路径校验注册表；不执行 AI 生成的 HTML/CSS/JS。
- CMS 是事实源，宿主拥有页面，AI-SLOT 仅管理授权槽位；首期只读数据源，不做双向同步。
- 保留原始兜底与 createAiRenderHandler 兼容；新管理服务为可选包，不替换现有公开 GET 数据入口。
- 正式站点沿用 aislot.dev；Git 主分支是 master，Cloudflare Pages 项目 aislot 的生产标识是 main。
- 不引入多租户、计费、通用调度、多实例存储或全平台插件矩阵；新包先 private，不随首轮 npm 发布。
- 官网公开文档 MCP 不增加写权限；管理 MCP 首期仅本地 stdio，远程 MCP 认证另立设计。
- 客户尚未落实；模拟数据、协议测试和自有测试站不能记作真实客户、付费或节省劳动证据。

## 参考文档（执行时再核实账号状态）

- [Cloudflare Pages 命令](https://developers.cloudflare.com/workers/wrangler/commands/pages/)：沿用现有Pages项目，先预览后生产。
- [Cloudflare 回滚](https://developers.cloudflare.com/pages/configuration/rollbacks/)：记录上一成功生产部署，可恢复。
- [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/) 与 [2FA](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)：不能覆盖已发布版本；外部认证挑战是执行条件。
- [MCP 授权规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)：stdio与远程HTTP鉴权不可混淆。
- [WordPress Posts REST](https://developer.wordpress.org/rest-api/reference/posts/)：区分公开数据、时间字段与渲染HTML，本计划使用单独的事实路由。
