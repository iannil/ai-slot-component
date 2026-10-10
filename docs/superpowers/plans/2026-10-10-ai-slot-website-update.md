# AI-SLOT 官网更新实施计划

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 未获得明确授权时不派生子代理。

**Goal:** 让维护已有网站的开发者理解 AI-SLOT 的增量价值，完成一个可复现的局部更新，并准确理解已实现与规划中的能力。
**Architecture:** 保留现有 React/Vite 双语首页、真实 runtime + 虚拟后端演示、独立 Pages Agent Functions；先改信息层和演示任务，再随组件发布扩充管理功能。
**Tech Stack:** React、TypeScript、Tailwind、Vite、Cloudflare Pages，网站独立 npm 工程。
**Spec:** [产品演进设计](../specs/2026-10-10-ai-slot-product-evolution-design.md)

## Global Constraints

沿用 aislot.dev 与现有四通道地址。新域名迁移另行确认。首轮不部署、不重构统计服务、不把演示模拟当生产后台。保持双语与移动端。站点公开 MCP 仍只读文档；私有管理 MCP 尚未实现。

## 首页信息与文案

| 顺序 | 区块 | 内容与行动 |
|---|---|---|
| 1 | 首屏 | 为现有网站接入 AI 驱动的局部内容与组件更新。英文：Bring AI-generated content and component layouts to your existing site. |
| 2 | 副标题 | 保留你的 CMS 与建站工具。AI 使用已注册组件生成局部内容和布局；首次接入后，支持范围内的内容更新无需重新部署宿主。 |
| 3 | 主行动 | “体验一次局部更新”跳转演示；“接入已有页面”进入快速上手。GitHub Star 保留为次级入口。 |
| 4 | 单一任务演示 | 默认活动/产品介绍区，不先要求访客理解四个行业；行业切换作为次级入口。 |
| 5 | 三种输入路径 | AI 生成、已生成组件树、CMS/API 确定性数据；分别标注已有接入方式与待发布 provider。 |
| 6 | AI 的三种职责 | 内容创作、已注册组件组合、授权管理；管理卡标记规划中，后续按发布门槛升级。 |
| 7 | 与原产品共存 | CMS 管事实、宿主管页面、SLOT 管授权局部；初次接入与后续更新的边界。 |
| 8 | 快速上手 | 先运行无密钥示例，再接入自有槽位；把注册表、renderer、端点列为实际依赖。 |
| 9 | 可靠性与边界 | 校验、兜底、缓存；不保证事实正确、SEO 收录、所有故障恢复。 |
| 10 | 路线图与 FAQ | 已实现/开发计划；公开文档 MCP 与管理 MCP 区分；保留 Agent 接入页入口。 |

不把组件代码生成写成内容热更新。官网首屏先表达可使用的生成与交付，完整“创作到管理”作为清晰标注的演进方向。

## W1：修正文案与能力状态（可独立交付）

**修改：** `website/src/pages/Home.tsx`、`website/index.html`、`README.md`、`README.zh-CN.md`、`docs/delivery-boundaries.md`。
**创建：** `website/src/content/home.ts`（双语内容）、`website/src/content/capabilities.ts`（能力状态及文档链接）。
**输入：** 现有源码与设计事实表。**产出：** 双语可用的首页与一致元信息。

- [ ] 把首页词典迁至 home.ts，保持语言存储与当前切换行为；能力表用 stable/planned 状态，不加未经测试的兼容 logo。
- [ ] 按上表重排现有区块，保留现有设计语言，避免无关视觉重做。
- [ ] 删除“零边际成本”“任何失败永远兜底”“SEO 与无障碍安全”“所有打开页面必然更新”等绝对表达。
- [ ] 改成“命中预生成缓存时无需模型调用；仍有托管和交付成本”“已处理的错误保留原始内容”“初始 HTML 保留作者内容”“连接正常时接收失效通知”。
- [ ] title、description、OG 与双语运行时标题同步。现有 OG 图片若含旧文案则替换；不为纯装饰必然重做素材。
- [ ] 浏览器检查英文/中文、390px/桌面、键盘导航、锚点、复制命令。纯文案不增加镜像实现的单元测试。

## W2：把技术演示改为任务演示

**修改：** `website/src/demo/DemoSection.tsx`、`industries.ts`、`pages.ts`、`virtual-backend.ts`、`demo.css`、`website/README.md`。
**输入：** 当前真实 runtime 与 mock 后端。**产出：** 能说明局部价值的确定性演示。

- [ ] 默认打开一个产品介绍区，保留原内容与“仅此区域受影响”的视觉边界。
- [ ] 首轮流程：查看原页 → 修改数据/生成方向 → 查看局部变化 → 模拟故障观察兜底。
- [ ] 明示“示例数据与后端为模拟，渲染运行时真实”；把模拟数据更新与真实 CMS 集成分开。
- [ ] 可切换“数据更新”和“AI 文案/布局生成”示例，演示预置结果，不伪装成实时模型推理。
- [ ] P1/P2 尚未通过前，不展示可点击的生产审批/回滚/MCP 管理按钮；若需概念预览，独立标记且不放在主成功路径。
- [ ] P1/P2 通过后另交付第二版演示：草稿差异 → 发布 → 线上版本核对 → 回滚。增加 `website/tests/demo.spec.ts` 与独立 `test:demo` 脚本，使用 Playwright 覆盖该行为；网站不在根 pnpm workspace，显式安装所需开发依赖。

验收：改一个槽位不改变其他内容；语言/行业切换清理旧订阅；故障演示仍显示兜底；mock 不拦截官网其他 API。首轮手动验收，进入版本闭环演示时增加自动行为回归。

## W3：同步人和 Agent 读取的资料

**修改：** `website/public/agent/skills/ai-slot-guide/SKILL.md`、`website/server/agent-page.mjs`、`docs/agent-access.md`；如需扩展索引再改 `website/scripts/build-agent.mjs` 与相关测试。
**验证：** `website/tests/agent.test.mjs`、`website/tests/agent-http.mjs`。

- [ ] 明确公开 MCP 用于学习接入；管理 MCP 将部署在用户授权的服务中，不能在公共端点开放写入。
- [ ] README 与包 README 是索引源；先改源文件，不手写 generated-content、ZIP、checksums 或 RSS 产物。
- [ ] 新增文档索引必须保持已有 ID/分页契约；RSS 构建依赖源文件 Git 提交时间，新文件需进入正常提交流程后验收。
- [ ] 新接口实际发布前不给 Agent 提供可直接调用的虚构工具名；路线图清晰标记为提案。
- [ ] 不更改现有中央统计密钥或部署身份。

## W4：验证、转化观察与发布准备

- [ ] 在 website 下执行 `npm run lint`、`npm run test:agent`、`npm run build`，如存在基线失败则记录并区分本次回归。
- [ ] 执行 `npx wrangler pages functions build --outdir /tmp/ai-slot-website-functions`；使用 `npm run dev:agent` 与现有 HTTP 脚本验证四通道。
- [ ] 检查生成后的 title/description、首页导航、Agent 页面、移动端及所有 CTA 链接。
- [ ] 演示新增闭环后执行 `npm run test:demo`；本命令首轮尚不存在，不提前声称已通过。
- [ ] 观察漏斗：访问 → 演示完成 → 打开接入指南 → 首次真实槽位成功。网站只能直接观察前几步；真实激活由自愿试点反馈取证，不通过点击冒充激活。
- [ ] 需要埋点时先明确事件 schema、隐私边界及中央注册，复用既有机制；不顺手建立第二套分析系统。
- [ ] 准备变更说明、构建校验和旧部署恢复点。上线作为另一个动作执行；本次规划不授予部署授权。

## 官网承诺的发布门槛

| 对外表达 | 门槛 |
|---|---|
| 内容与注册组件组合 | 当前能力，明确受注册表约束 |
| 一套正式 provider 接 CMS/API | P0 通过，提供真实可运行示例 |
| 可预览、发布、回滚 | P1 持久化、并发与重启验收通过 |
| 让你的 AI 管理槽位 | P2 权限及完整 MCP 任务验收通过 |
| 支持某 CMS/建站产品 | 该平台实际编辑/预览/发布/卸载验收通过，公布条件 |
| 减少审阅和维护时间 | 有对应任务样本和测量口径；此前只能表达产品目标 |

## 首阶段执行细化

首阶段按[细化执行计划](2026-10-10-ai-slot-website-w0-execution.md)实施；具体缩小范围与兼容策略见[首阶段设计](../specs/2026-10-10-ai-slot-phase-one-design.md)。本文件保留为完整路线图，后续阶段不因细化而自动进入施工。
