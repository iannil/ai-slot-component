# AI-SLOT 官网 W0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让官网准确说明 AI-SLOT 如何增强已有网站，并引导访客完成一个真实运行时的局部更新演示。

**Architecture:** 沿用 Home.tsx 的双语词典与现有组件布局。新增一个职责与状态区块，不重构演示网络层或站点路由；同步 README、元信息和公开 Skill。

**Tech Stack:** React 19、TypeScript、Tailwind、Vite；website 是独立 npm 工程。

**Spec:** [首阶段设计：官网子项目](../specs/2026-10-10-ai-slot-phase-one-design.md)

## Global Constraints

- 项目文档与注释使用中文。
- AI 从不输出 HTML；组件树必须通过注册表校验后渲染。
- 保留原始兜底内容，不能把失败结果渲染为页面空白。
- Node >= 18；核心包不新增运行时依赖。
- 官网继续使用 aislot.dev；本次不迁移域名、不部署、不发布 npm。
- 仅修改任务列明文件；不暂存既有研究报告与其他无关未跟踪文件。
- 既有公开 MCP 只读文档，管理型 MCP 仍为规划能力。

执行方式由用户选择，尚未选择前不派生子代理。提交使用精确路径；首次执行先看 git status，已有同文件变更须保留。

---

## 文件职责与执行前检查

| 文件 | 职责 |
|---|---|
| website/src/pages/Home.tsx | 首屏词典、CTA、元标题、区块顺序 |
| website/src/components/SlotResponsibilities.tsx | 宿主/CMS/SLOT 职责和 AI 能力状态 |
| website/src/demo/DemoSection.tsx | 演示步骤说明；保留现有状态机 |
| website/index.html | 静态 title/description/OG |
| README.md、README.zh-CN.md | 被 Agent 索引的公开定位 |
| website/public/agent/skills/ai-slot-guide/SKILL.md | Agent 行为与能力边界 |
| docs/delivery-boundaries.md、website/README.md | 接入和模拟演示边界 |

基线命令在 website 运行 `npm run lint`、`npm run test:agent`、`npm run build`；先记录现存失败。缺依赖时使用现有 package-lock 执行 npm ci。不要把文案修改包装成需要全仓 SDK 测试的行为变更。下面纯展示任务采用构建与明确人工验收，不编写匹配文案的脆弱单测。

### Task 1: 首屏定位与任务入口

**Files:**
- Modify: `website/src/pages/Home.tsx`（dict、useLang、Hero、Demo）
- Test: 本地浏览器人工验收

**Interfaces:**
- Consumes: 现有 `Lang = 'en' | 'zh'`、`Dict`、`Hero({t})`、`Demo({t,lang})`。
- Produces: `#demo` 与已有 `#quickstart`；不改变 props 接口。

- [ ] **Step 1: 记录基线**。启动 `npm run dev -- --host 127.0.0.1`，查看中英文首屏；记录目前主按钮跳转 GitHub，演示区没有 #demo。
- [ ] **Step 2: 更新词典首屏字段**。下列对象字段分别合入现有 en/zh，其他词典字段保留。

```tsx
// en
heroTitle: 'Bring AI-generated content and component layouts to your existing site.',
heroSubBefore: 'Keep your CMS and site builder. Add',
heroSubMid: 'to a region of your page. AI returns validated component-tree JSON — ',
heroSubNever: 'never HTML',
heroSubRendered: ' — using ',
heroSubReal: 'your registered components',
heroSubAfter: '. After initial integration, supported content updates can ship without rebuilding the host site.',
getStarted: 'Try a local update',
codeComment1: '<!-- integrate this region once -->',
codeComment2: '<!-- keep original fallback content -->',
qsTitle: 'Run the example without an API key.',
ctaTitle: 'Start with one region of the site you already maintain.',
// zh
heroTitle: '为已有网站接入 AI 内容与组件布局更新。',
heroSubBefore: '保留你的 CMS 与建站工具，为页面局部接入',
heroSubMid: '。AI 返回经过校验的组件树 JSON——',
heroSubNever: '绝不输出 HTML',
heroSubRendered: '——使用',
heroSubReal: '已注册的真实组件',
heroSubAfter: '。首次接入后，支持范围内的内容更新无需重新构建宿主网站。',
getStarted: '体验一次局部更新',
codeComment1: '<!-- 首次接入这个区域 -->',
codeComment2: '<!-- 保留原始兜底内容 -->',
qsTitle: '无需 API Key，运行完整示例。',
ctaTitle: '从你正在维护的网站中，选择一个区域开始。',
```

- [ ] **Step 3: 修改 Hero 行动区域**。替换现有 CopyCommand 与 GitHub 按钮所在 div；主按钮使用现有 t.getStarted，第二按钮复用 t.nav.quickstart。

```tsx
<div className="mt-8 flex flex-wrap items-center gap-4">
  <a href="#demo" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
    {t.getStarted}
  </a>
  <a href="#quickstart" className="rounded-lg border border-border px-5 py-2.5 text-sm">
    {t.nav.quickstart}
  </a>
</div>
```

若 ArrowRight 在整文件没有其他用途，移除其 import。把 Demo 的 section 改为 `<section id="demo" className="scroll-mt-20 border-t border-border/60">`。

- [ ] **Step 4: 替换 useLang 的 document.title 赋值**。

```tsx
document.title = lang === 'zh'
  ? 'AI-SLOT — 为已有网站接入 AI 局部更新'
  : 'AI-SLOT — AI updates for your existing site'
```

- [ ] **Step 5: 验收与构建**。运行 `npm run build`，预期成功。中英文分别点击主/次按钮，预期滚动到演示/上手；刷新保持语言；Tab 可聚焦两个入口；390px 不横向溢出。
- [ ] **Step 6: 提交**。

```sh
git add website/src/pages/Home.tsx
git commit -m "docs: 调整官网首屏定位与任务入口"
```

### Task 2: 展示共存职责与三种 AI 能力

**Files:**
- Create: `website/src/components/SlotResponsibilities.tsx`
- Modify: `website/src/pages/Home.tsx`（Home 渲染顺序）
- Test: 本地浏览器人工验收

**Interfaces:**
- Consumes: `lang: 'en' | 'zh'`。
- Produces: `SlotResponsibilities({lang}: {lang:'en'|'zh'})` React 组件；无远程请求。

- [ ] **Step 1: 创建组件**。

```tsx
const copy = {
  zh: {
    title: '加强你已经在用的产品',
    owners: ['CMS：维护源事实与原始内容。', '宿主页面：控制区域位置和外部布局。', 'AI-SLOT：交付被授权区域的组件树。'],
    roles: [
      ['内容生成 · 已提供基础能力', 'AI 按提示词生成组件属性中的文案。'],
      ['组件组合 · 已提供基础能力', 'AI 组合已注册组件；新组件代码仍需审查与部署。'],
      ['授权管理 · 规划中', '计划让外部 AI 经 MCP 创建草稿、预览、发布与回滚。'],
    ],
    note: '也可接入符合组件树协议的数据端点。数据更新不必每次调用 AI。当前官网 MCP 只读文档。',
    setup: '首次接入需要注册组件、配置渲染器与端点；框架无关不代表所有平台和套餐均可直接安装。',
  },
  en: {
    title: 'Extend the tools you already use',
    owners: ['CMS: owns source facts and original content.', 'Host page: owns placement and outer layout.', 'AI-SLOT: delivers component trees to the authorized region.'],
    roles: [
      ['Content generation · Foundation available', 'AI generates copy in component properties.'],
      ['Component composition · Foundation available', 'AI combines registered components. New component code still needs review and deployment.'],
      ['Authorized management · Planned', 'External AI agents will be able to draft, preview, publish and roll back through MCP.'],
    ],
    note: 'You can also connect an endpoint that returns the component-tree protocol. Data updates need not call AI. The current website MCP reads documentation only.',
    setup: 'Initial integration requires a registry, renderer and endpoint. Framework-agnostic does not mean every platform or plan permits installation.',
  },
} as const

export default function SlotResponsibilities({ lang }: { lang: 'en' | 'zh' }) {
  const t = copy[lang]
  return (
    <section aria-labelledby="responsibilities-title" className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 id="responsibilities-title" className="text-3xl font-bold">{t.title}</h2>
        <ul className="mt-6 space-y-2 text-muted-foreground">
          {t.owners.map(text => <li key={text}>{text}</li>)}
        </ul>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {t.roles.map(([title, body]) => (
            <article key={title} className="rounded-xl border border-border p-6">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{t.note}</p>
        <p className="mt-3 text-sm text-muted-foreground">{t.setup}</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: 挂载区块**。Home.tsx 增加 import，在 `<Demo t={t} lang={lang} />` 后添加组件。

```tsx
import SlotResponsibilities from '../components/SlotResponsibilities'
// Home 的 JSX 内，紧接 Demo：
<SlotResponsibilities lang={lang} />
```

- [ ] **Step 3: 验收**。运行 `npm run build`；切换语言，预期三张卡片与职责同时切换，管理卡始终标为规划中；390px 卡片竖排。页面不出现不存在的管理按钮。
- [ ] **Step 4: 提交**。

```sh
git add website/src/components/SlotResponsibilities.tsx website/src/pages/Home.tsx
git commit -m "docs: 说明宿主共存职责与 AI 能力状态"
```

### Task 3: 修正交付模式、安全承诺与演示说明

**Files:**
- Modify: `website/src/pages/Home.tsx`（dict.modes、safety、demo 字段）
- Modify: `website/src/demo/DemoSection.tsx`（ui 词典）
- Test: 现有四步演示人工回归

**Interfaces:**
- Consumes: 当前 modes 的 name/trigger/body/tag；safety 的 title/body；demo ui.steps 的 title/hint。
- Produces: 相同数组长度和字段；不改变 backendFor、状态机、订阅、DOM 更新行为。

- [ ] **Step 1: 替换 Home 双语说明**。使用下表精确替换对应 body/说明字段，不更改组件结构。

| 字段 | 中文 | 英文 |
|---|---|---|
| demoTitle | 在已有页面完成一次局部更新。 | Complete a local update on an existing page. |
| demoSub | 选择一个行业，体验内容更新、方向调整和失败兜底。示例数据与后端为模拟，组件运行时与渲染真实执行。 | Choose an industry to try content updates, a new message and failure fallback. Data and backend behavior are simulated; the component runtime and rendering are real. |
| modesSub | 可预生成，也可按需更新。访客提示词是按槽位开启的可选能力。 | Pregenerate or update on demand. Visitor prompts are optional and enabled per slot. |
| modes[0].body | 预生成组件树保存为 JSON 缓存。命中缓存时无需模型调用，仍有托管与交付成本。 | Pregenerated component trees are stored as JSON cache. Cache hits avoid model calls; hosting and delivery still have costs. |
| modes[1].body | 数据变更可触发失效通知，让连接正常的页面重新加载槽位。首次安装或新增组件代码仍可能需要宿主发布。 | Data changes can trigger invalidation so connected pages reload the slot. Initial installation and new component code may still require a host release. |
| safetySub | 服务端校验组件树；客户端配置注册表后再次校验。组件作者仍需安全处理属性。 | The server validates component trees; clients validate again when a registry is configured. Component authors must still handle properties safely. |
| safety[1].title | 已处理的错误保留兜底 | Fallback for handled failures |
| safety[1].body | 获取或校验失败时保留原始内容。初始 HTML 应由作者提供可用内容；这不保证收录、排名或整个页面无障碍合规。 | Fetch or validation failures preserve original content. Authors should provide useful initial HTML; this does not guarantee indexing, rankings or page-wide accessibility compliance. |
| safety[3].body | 原生组件树协议与 A2UI 适配包均已提供。具体消息版本和兼容范围以包文档与测试为准。 | Native component-tree delivery and an A2UI adapter are available. Supported message versions and coverage are documented in the package. |

- [ ] **Step 2: 修正 DemoSection 词典**。保留步骤 title 和控制按钮文本；按顺序替换四个 hint 以及 doneHint。

```tsx
// zh 的四个 hint
'先显示作者提供的原始内容，再展示校验后的组件树。本演示使用模拟后端。'
'模拟数据源更新，发送失效通知，再重新加载当前槽位。'
'运营调整提示词后展示预置示例结果；此演示不调用真实模型。'
'模拟请求失败，检查原始兜底内容仍可见。'
// zh doneHint
'预生成 JSON 缓存可在示例仓库通过 node prewarm.mjs 体验；缓存命中时无需模型调用。'
// en 的四个 hint
'Original content appears first, followed by the validated component tree. This demo uses a simulated backend.'
'Simulate a data change, send invalidation and reload the current slot.'
'Changing the prompt displays a preset example result; this demo does not call a real model.'
'Simulate a failed request and check that original fallback content remains visible.'
// en doneHint
'Try JSON cache pregeneration with node prewarm.mjs in the example repository. Cache hits avoid model calls.'
```

把 zh doneTitle 改为“局部更新演示完成”，en doneTitle 改为“Local update demo complete”，消除三种/四种方式混用。

- [ ] **Step 3: 人工回归**。每种语言至少完整运行一个行业；其他行业分别加载一次。检查原内容、发布更新、预设方向、故障兜底；切语言/换行业后旧状态不泄漏。运行 `npm run lint` 与 `npm run build`。
- [ ] **Step 4: 提交**。

```sh
git add website/src/pages/Home.tsx website/src/demo/DemoSection.tsx
git commit -m "docs: 校准交付成本与演示能力说明"
```

### Task 4: 同步公开文档和元信息并完成验收

**Files:**
- Modify: `website/index.html`、`README.md`、`README.zh-CN.md`
- Modify: `website/public/agent/skills/ai-slot-guide/SKILL.md`
- Modify: `website/README.md`、`docs/delivery-boundaries.md`
- Test: `website/tests/agent.test.mjs`、`website/tests/agent-http.mjs`（运行现有测试，不改断言）

**Interfaces:**
- Consumes: build-agent.mjs 从两份 README 和七个包 README 构建现有索引。
- Produces: 不变的文档 ID、只读工具名、静态元信息；不创建新的公开管理 API。

- [ ] **Step 1: 更新 index.html 的 title、description、og:title、og:description**。两个 description 都用下列内容；保留图像 URL、favicon 和域名。

```html
<title>AI-SLOT — AI updates for your existing site</title>
<meta name="description" content="Keep your CMS and site builder. Generate content and layouts with registered components, deliver local updates, and preserve original fallback content." />
<meta property="og:title" content="AI-SLOT — AI updates for your existing site" />
<meta property="og:description" content="Keep your CMS and site builder. Generate content and layouts with registered components, deliver local updates, and preserve original fallback content." />
```

- [ ] **Step 2: 用下列段落替换两份 README 的产品简介**。保留安装、示例与 API 正文。

中文：“AI-SLOT 为已有网站、CMS 与建站工具增加局部 AI 内容和组件组合能力。AI 输出经过校验的组件树 JSON，使用开发者注册的真实组件。也可接入返回同一协议的数据端点；数据更新不必每次调用 AI。首次接入后，支持范围内的内容更新无需重新部署宿主。版本化发布和管理型 MCP 属于后续规划，当前官网 MCP 只读文档。”

英文：“AI-SLOT adds local AI content and component composition to existing sites, CMSs and site builders. AI produces validated component-tree JSON using developer-registered components. Endpoints can also supply the same protocol without calling AI for every update. After initial integration, supported content updates do not require a host redeploy. Versioned publishing and management MCP are planned; the current website MCP reads documentation only.”

- [ ] **Step 3: 更新 Skill 第 5 条之后的说明**。加入：“优先保留用户现有 CMS 与宿主工作流。先确认脚本接入权限、注册组件与数据端点。不要把当前公开 MCP 当成槽位发布工具，也不要把新组件代码生成当成免部署内容更新。”
- [ ] **Step 4: 更新边界文档**。website/README.md 演示章节加入“首屏以局部任务为入口；运营、数据源与生成结果为模拟，不能用它证明生产发布治理能力”。docs/delivery-boundaries.md 加入“首次安装槽位、修改宿主模板或新增组件代码仍可能需要发布；只有已部署能力内的内容更新可独立交付”。
- [ ] **Step 5: 提交源文档**。build-agent 使用 Git 最近提交时间，先提交源内容，再生成并验收；不手改 generated 文件。

```sh
git add website/index.html README.md README.zh-CN.md website/public/agent/skills/ai-slot-guide/SKILL.md website/README.md docs/delivery-boundaries.md
git commit -m "docs: 同步官网与 Agent 产品能力边界"
```

- [ ] **Step 6: 自动验收**。在 website 执行 `npm run test:agent`、`npm run build`、`npx wrangler pages functions build --outdir /tmp/ai-slot-w0-functions`；预期全部成功。查看 git status；若构建产生已跟踪产物，核对差异后只提交与本任务对应的生成物。
- [ ] **Step 7: 本机 HTTP 验收**。在 website 启动 `npx wrangler pages dev dist --port 8791 --compatibility-date 2026-10-01`，另一终端执行 `node tests/agent-http.mjs`。预期四通道正常、未知路由 404、RSS 304、MCP 仍只有 search_docs/read_doc。
- [ ] **Step 8: 最终人工验收**。390px 和桌面各检查中英文；检查 title、CTA、演示、页脚、Agent 页面。打开现有 OG 图确认没有与新定位冲突的绝对承诺；若有，记录为独立素材修订，不生成虚构成效图。执行 `git diff --check`，输出变更与验证记录，不部署。

## 自审覆盖

首屏/共存/状态 → Task 1–2；成本与安全/模拟边界 → Task 3；公开资料/元信息/四通道 → Task 4。本计划不包含完整演示重构、管理界面或新增 provider 的发布宣传。所有组件 props 沿用现有定义，新增组件只接收 lang。
