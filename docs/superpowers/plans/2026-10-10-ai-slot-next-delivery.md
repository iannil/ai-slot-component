# AI-SLOT 后续交付总控 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按独立验收关卡完成用户列出的发布、后续开发与质量修复。

**Architecture:** 分为七份实施计划。先发布现有成果，再迭代参考管理闭环；客户未落实不阻塞参考实现，也不伪造客户验证。

**Tech Stack:** 现有pnpm/TypeScript/Vitest/Playwright、Cloudflare Pages、npm、Node参考服务。

**Spec:** [后续交付设计](../specs/2026-10-10-ai-slot-next-delivery-design.md)

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

---


## 文件职责与执行顺序

| 序号 | 计划 | 独立交付 | 验收关卡 |
|---|---|---|---|
| Q | [官网lint](2026-10-10-ai-slot-website-quality.md) | 官网质量基线 | lint/build/agent |
| R | [发布](2026-10-10-ai-slot-release.md) | 当前官网与proxy公开版本 | Git SHA/Pages部署ID/npm完整性/外部安装 |
| L | [可靠交付](2026-10-10-ai-slot-reliable-delivery.md) | 重连、卸载隔离、命名槽位 | runtime/DOM测试、故障e2e |
| V | [持久版本](2026-10-10-ai-slot-version-store.md) | 独立operations存储 | 崩溃、重启、并发、损坏 |
| G | [审批回滚](2026-10-10-ai-slot-governance.md) | 完整领域发布闭环 | policy/CAS/审批/幂等/来源 |
| M | [参考服务与MCP](2026-10-10-ai-slot-management-mcp.md) | 可操作本地闭环 | 真实runtime+官方MCP客户端 |
| I | [CMS接入与试点](2026-10-10-ai-slot-cms-pilot.md) | 一宿主任务包与试点准备 | 本地集成/工时计算/授权关卡 |

这些文件是执行分工，不表示七个方案已实施。V与G采用同一operations包；M不得自行复制G业务逻辑。

### Task 1: 执行与记录独立交付

**Files:** Create `docs/validation/next-delivery-status.md`；执行各子计划列出的文件。
**Interfaces:** Consumes 各子计划验收结果；Produces 状态 `not_started|in_progress|verified|blocked_external`。

- [ ] 创建以下记录表；只有实际验收后填写SHA与结果，不预填成功。

```markdown
# 后续交付状态
| 项目 | 状态 | 提交/部署/版本 | 验收证据 | 外部条件 |
| Q | not_started | 无 | 无 | 无 |
| R | not_started | 无 | 无 | 发布账号与2FA |
| L | not_started | 无 | 无 | 无 |
| V | not_started | 无 | 无 | 无 |
| G | not_started | 无 | 无 | 无 |
| M | not_started | 无 | 无 | 外部Agent客户端验收 |
| I参考接入 | not_started | 无 | 无 | 本地WordPress环境 |
| I真实试点 | blocked_external | 无 | 无 | 客户站点/任务/授权尚未落实 |
```

- [ ] 按Q→R→L→V→G→M→I执行，每份计划独立提交与审查。用户本次明确要求包含推送/部署/npm，执行选择后按R操作，不再为同一发布动作重复请求许可；真实认证输入仍需用户完成。
- [ ] R遇到缺凭据/2FA时保存待发布tarball/预览/SHA与具体阻塞，继续L/V等本地工作；不得把缺凭据写成发布完成。
- [ ] 最终只运行受影响的验收一次，汇总已上线、仅本地、外部阻塞三种结果。
- [ ] `git add docs/validation/next-delivery-status.md && git commit -m "docs: 记录后续交付验收状态"`。

## 自审结果

用户三类需求均映射至Q/R/L/V/G/M/I。真实客户试点的运行步骤在I，完成依赖客户条件；未把它从范围里删掉。版本/权限契约固定于设计与V/G；其余计划只能消费。核心版本发布与新private管理包发布分开。所有实际执行均尚未开始。

## 自审覆盖与接口核对

| 设计要求 | 实施位置 | 核对结果 |
|---|---|---|
| 源码lint与生成物 | Q Task1–2 | 7项导出+1项纯度；.wrangler单独排除 |
| 推送/部署/npm与恢复 | R Task1–3 | SHA、真实tarball、Pages main、npm完整性分别核对 |
| 断线补偿/卸载/命名槽位 | L Task1–3 | onConnect、mountSeq、slotTargets有明确生产/消费点 |
| 持久数据/原子提交/坏库 | V Task1–2 | State/Store/Artifact契约由G复用 |
| 事实锁/草稿/批准/发布/回滚 | G Task1–4 | sourceVersion/hash/baseRevision一致，approve与publish分离 |
| 人工预览/私有服务/stdio | M Task1–4 | MCP仅API客户端，不开第二文件锁；7工具无approve |
| CMS只读/宿主插槽/卸载 | I Task1–2 | 归一化Source→G；WordPress只读事实，不渲染CMS HTML |
| 总劳动/失败成本/真实试点 | I Task3–4 | 当前只准备；外部授权与客户任务未落实，不能打勾 |

2026-10-10已检查计划头、复选步骤、代码围栏、文件链接与跨计划类型名称；扫描未发现TBD/TODO等占位。自检修正了defineRegistry的components外层、发布tarball动态路径、Node18不支持的Promise辅助API和越权请求测试的400/403区别。本轮仅新增规划文档，未执行其中发布与开发步骤。
