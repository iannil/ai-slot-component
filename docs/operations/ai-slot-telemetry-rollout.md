# AI Slot 中央统计接线记录

## 原因（修复前）

四通道公开能力已发布，但中央 `registry.ts` 的 AI Slot 仍为 telemetrySites=[]、通道 unconfigured；AI Slot 原部署没有 TELEMETRY_* 生产配置。这会使私有看板持续显示“未配置”，不能通过公开接口成功推断中央已经采集。

## 已授权并执行的中央变更

具体补丁：[iannil-ai-slot-telemetry.patch](iannil-ai-slot-telemetry.patch)。用户确认后已应用到中央仓库并发布，补丁记录最终 verified 状态，应用前仍须取得对应环境的真实验收证据。

1. 将 AI Slot main 纳入采集，四通道及 discovery 初始为 pending。
2. 在原 TELEMETRY_KEYS 与 TELEMETRY_EXTERNAL_KEYS 之外，增加独立 TELEMETRY_AI_SLOT_KEYS，避免覆盖无法读取明文的既有生产 Secret。
3. 增加 TELEMETRY_AI_SLOT_HEALTH_TARGETS，与原健康目标合并，仅包含 aislot.dev 的 main。
4. 新建独立测试/生产签名密钥，通过 Secret 配置；只把 AI Slot 自己的生产 secret 配到 aislot Pages。
5. 增加签名兼容、跨产品拒绝、重复 keyId 拒绝和健康探测回归；执行中央 npm run verify。
6. 发布中央统计 Worker，启用产品 production 配置并重新部署 aislot；preview 保持关闭。
7. 以真实四通道请求核对 Queue → D1 原始事件和日汇总，等待中央定时器真实签名心跳。只有证据齐全才标记 verified 并发布注册表更新。

不更新数据库结构，不修改历史数据，不覆盖其他产品密钥、健康目标或中央读取令牌。中央工作树有大量已有改动，不将其整体提交或发布；只发布审阅范围内的统计 Worker 变更。

## 产品配置

`website/wrangler.toml` 明确 production/preview 分离，仅 production 的 TELEMETRY_ENABLED=true。独立测试与生产密钥通过 Secret 配置，值不进入源码或日志。产品部署为 `1f5fcca6.aislot.pages.dev`。

## 验收进度

- 自动审批曾要求明确跨仓库授权；用户随后确认，阻塞已解除。
- 中央完整 verify：591 passed / 2 existing skipped；产品 5 组测试及构建通过。
- 中央 pending 阶段代码版本：b16d8059-fa36-4055-bb31-1b00652fb0c7；原恢复点：bd683474-55ab-4beb-ba6b-aeabf8beaf25。追加健康 Secret 后平台还会产生配置版本。
- 北京时间 12:32，真实 API/MCP/RSS/Skill/discovery 访问成功；签名健康 POST 返回 ready=true。
- test 环境独立收到 1 条 API 请求和 1 条操作；production 原始事件与日汇总逐组一致：API 2 请求/2 操作、MCP 7 请求/6 操作、RSS 3 请求、Skill 2 请求、discovery 4 请求。请求与操作不能相加为访问人数。
- 中央定时器首次真实心跳：2026-10-10T04:36:07.342Z（北京时间 12:36:07）；同期其他四产品和 IANNIL 心跳正常。四通道及 discovery 已据此完成验收，发布最终 verified 状态。

## 最终发布

中央 verified Worker：`d304dfa9-7cee-4328-98ec-f94a5813e64b`。最终注册表变更后的 45 项相关测试与类型检查通过。四通道和 discovery 均已验证，main 有真实定时心跳；web_agent 保持未配置。看板应选择 production 与北京时间 2026-10-10。

中央源文件与文档已更新，但该仓库存在大量其他未提交工作，未整体提交；本仓库保留精确中央补丁和脱敏证据。
