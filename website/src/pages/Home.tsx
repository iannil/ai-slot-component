import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Github,
  Languages,
  Layers,
  Radio,
  ShieldCheck,
  UserPen,
  Zap,
  KeyRound,
  FileCode2,
  Undo2,
} from 'lucide-react'
import DemoSection from '../demo/DemoSection'
import SlotResponsibilities from '../components/SlotResponsibilities'

const GITHUB = 'https://github.com/iannil/ai-slot-component'
const NPM = 'https://www.npmjs.com/package/@ai-slot/runtime'

type Lang = 'en' | 'zh'

const dict = {
  en: {
    badge: 'Open source · MIT · framework-agnostic',
    nav: { delivery: 'Delivery', safety: 'Safety', quickstart: 'Quick start', star: 'Star' },
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
    codeH1: 'X100 Noise-Canceling Headphones',
    codeFooter: 'validated → rendered as your components',
    demoKicker: 'demo',
    demoTitle: 'Complete a local update on an existing page.',
    demoSub:
      'Choose an industry to try content updates, a new message and failure fallback. Data and backend behavior are simulated; the component runtime and rendering are real.',
    modesKicker: 'delivery',
    modesTitle: 'Content reaches a slot three ways.',
    modesSub:
      'Pregenerate or update on demand. Visitor prompts are optional and enabled per slot.',
    modes: [
      {
        name: 'Pregenerated',
        trigger: 'your build',
        body: 'Pregenerated component trees are stored as JSON cache. Cache hits avoid model calls; hosting and delivery still have costs.',
        tag: 'ship AI content like a static asset',
      },
      {
        name: 'Live',
        trigger: 'a data-source change',
        body: 'Data changes can trigger invalidation so connected pages reload the slot. Initial installation and new component code may still require a host release.',
        tag: 'update content, not code',
      },
      {
        name: 'Personalized',
        trigger: 'a visitor prompt',
        body: 'Opt-in per slot via the editable attribute. Sanitized, length-capped, rate-limited, short TTL — and scoped to that one slot only.',
        tag: 'per-slot, off by default',
      },
    ],
    safetyKicker: 'safety',
    safetyTitle: 'Bounded generation is the kind that gets signed off.',
    safetySub:
      'The server validates component trees; clients validate again when a registry is configured. Component authors must still handle properties safely.',
    safety: [
      {
        title: 'The model never writes markup',
        body: 'It returns component-tree JSON whose names must exist in the registry you declared — validated against prop schemas, slot rules, depth and node-count limits before anything renders.',
      },
      {
        title: 'Fallback for handled failures',
        body: 'Fetch or validation failures preserve original content. Authors should provide useful initial HTML; this does not guarantee indexing, rankings or page-wide accessibility compliance.',
      },
      {
        title: 'Secrets stay on the server',
        body: 'LLM keys live only in the proxy. Visitor prompts are sanitized and injected as bounded context, with token budgets, an 8s timeout, per-minute rate limiting and usage logs.',
      },
      {
        title: 'Protocol-neutral by design',
        body: 'Native component-tree delivery and an A2UI adapter are available. Supported message versions and coverage are documented in the package.',
      },
    ],
    qsKicker: 'quick start',
    qsTitle: 'Run the example without an API key.',
    qsSubBefore: 'The demo ships with a deterministic mock LLM. Set',
    qsSubAfter: 'to switch to any OpenAI-compatible endpoint.',
    qsComment: '# Node ≥ 18, pnpm (corepack enable)',
    qsOpen: '# → open https://demo.aislot.dev (hosted) or http://localhost:4173 (local)',
    stats: [
      ['7 packages', 'registry · proxy · runtime · dom/react/vue adapters · a2ui'],
      ['Zero deps', '<ai-slot> runtime is a dependency-free Web Component'],
      ['Tested', 'unit + Playwright e2e, adversarial validator fixtures'],
    ] as const,
    ctaTitle: 'Start with one region of the site you already maintain.',
    ctaStar: 'Star on GitHub',
    footer: { docs: 'Docs', license: 'MIT License', links: 'More from the author' },
    cloneCmd: 'git clone https://github.com/iannil/ai-slot-component',
  },
  zh: {
    badge: '开源 · MIT · 框架无关',
    nav: { delivery: '交付模式', safety: '安全性', quickstart: '快速上手', star: 'Star' },
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
    codeH1: '降噪耳机 X100',
    codeFooter: '校验通过 → 渲染为你的组件',
    demoKicker: '演示',
    demoTitle: '在已有页面完成一次局部更新。',
    demoSub:
      '选择一个行业，体验内容更新、方向调整和失败兜底。示例数据与后端为模拟，组件运行时与渲染真实执行。',
    modesKicker: '交付',
    modesTitle: '内容通过三种方式到达槽位。',
    modesSub: '可预生成，也可按需更新。访客提示词是按槽位开启的可选能力。',
    modes: [
      {
        name: '预生成',
        trigger: '你的构建流程',
        body: '预生成组件树保存为 JSON 缓存。命中缓存时无需模型调用，仍有托管与交付成本。',
        tag: '像静态资源一样交付 AI 内容',
      },
      {
        name: '实时推送',
        trigger: '数据源变更',
        body: '数据变更可触发失效通知，让连接正常的页面重新加载槽位。首次安装或新增组件代码仍可能需要宿主发布。',
        tag: '更新内容，而不是代码',
      },
      {
        name: '访客个性化',
        trigger: '访客提示词',
        body: '通过 editable 属性按槽位开启。提示词经过滤、限长、限流，短 TTL——且只作用于这一个槽位。',
        tag: '按槽位开启，默认关闭',
      },
    ],
    safetyKicker: '安全',
    safetyTitle: '有边界的生成，才是能被签字放行的那种。',
    safetySub: '服务端校验组件树；客户端配置注册表后再次校验。组件作者仍需安全处理属性。',
    safety: [
      {
        title: '模型从不输出标记',
        body: '它返回组件树 JSON，组件名必须存在于你声明的注册表中——渲染前依次校验 props Schema、slots 嵌套规则、深度与节点数上限。',
      },
      {
        title: '已处理的错误保留兜底',
        body: '获取或校验失败时保留原始内容。初始 HTML 应由作者提供可用内容；这不保证收录、排名或整个页面无障碍合规。',
      },
      {
        title: '密钥只留在服务端',
        body: 'LLM 密钥仅存在于代理层。访客提示词经清洗后作为受限上下文注入，带 token 预算、8 秒超时、每分钟限流与用量日志。',
      },
      {
        title: '协议中立',
        body: '原生组件树协议与 A2UI 适配包均已提供。具体消息版本和兼容范围以包文档与测试为准。',
      },
    ],
    qsKicker: '快速上手',
    qsTitle: '无需 API Key，运行完整示例。',
    qsSubBefore: '示例内置确定性 mock LLM。设置',
    qsSubAfter: '即可切换到任意 OpenAI 兼容端点。',
    qsComment: '# Node ≥ 18，pnpm（corepack enable）',
    qsOpen: '# → 打开 https://demo.aislot.dev（在线）或 http://localhost:4173（本地）',
    stats: [
      ['7 个包', 'registry · proxy · runtime · dom/react/vue 适配器 · a2ui'],
      ['零依赖', '<ai-slot> 运行时是无依赖 Web Component'],
      ['全测试', '单测 + Playwright e2e，含对抗性校验样例'],
    ] as const,
    ctaTitle: '从你正在维护的网站中，选择一个区域开始。',
    ctaStar: '在 GitHub 上 Star',
    footer: { docs: '文档', license: 'MIT 许可证', links: '更多来自作者' },
    cloneCmd: 'git clone https://github.com/iannil/ai-slot-component',
  },
} as const

type Dict = (typeof dict)['en']

function useLang(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('aislot-lang')
    if (saved === 'en' || saved === 'zh') return saved
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  })
  useEffect(() => {
    localStorage.setItem('aislot-lang', lang)
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.title = lang === 'zh'
      ? 'AI-SLOT — 为已有网站接入 AI 局部更新'
      : 'AI-SLOT — AI updates for your existing site'
  }, [lang])
  return [lang, () => setLang((l) => (l === 'en' ? 'zh' : 'en'))]
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(command)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
      className="group flex items-center gap-3 rounded-lg border border-border bg-secondary/60 px-4 py-2.5 font-mono text-sm text-foreground transition-colors hover:border-primary/50"
    >
      <span className="text-muted-foreground">$</span>
      {command}
      {copied ? (
        <Check className="h-4 w-4 text-primary" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
      )}
    </button>
  )
}

function Nav({ t, lang, toggle }: { t: Dict; lang: Lang; toggle: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2 font-mono text-base font-bold tracking-tight">
          <img src="/logo.svg" alt="" className="h-5 w-5" />
          <span className="text-primary">&lt;ai-slot&gt;</span>
        </a>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#modes" className="hidden transition-colors hover:text-foreground sm:block">
            {t.nav.delivery}
          </a>
          <a href="#safety" className="hidden transition-colors hover:text-foreground sm:block">
            {t.nav.safety}
          </a>
          <a href="#quickstart" className="hidden transition-colors hover:text-foreground sm:block">
            {t.nav.quickstart}
          </a>
          <a
            href={NPM}
            target="_blank"
            rel="noreferrer"
            className="hidden transition-colors hover:text-foreground sm:block"
          >
            npm
          </a>
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-primary/60"
            aria-label="Switch language"
          >
            <Languages className="h-4 w-4" />
            {lang === 'en' ? '中文' : 'EN'}
          </button>
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-primary/60"
          >
            <Github className="h-4 w-4" />
            {t.nav.star}
          </a>
        </nav>
      </div>
    </header>
  )
}

function Hero({ t }: { t: Dict }) {
  return (
    <section className="bg-grid relative overflow-hidden pt-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,hsl(80_84%_56%/0.12),transparent)]" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-24 pt-24 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-32">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 font-mono text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t.badge}
          </p>
          <h1 className="text-gradient text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t.heroSubBefore}{' '}
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-base text-primary">
              &lt;ai-slot&gt;
            </code>
            {t.heroSubMid}
            <span className="text-foreground">{t.heroSubNever}</span>
            {t.heroSubRendered}
            <span className="text-foreground">{t.heroSubReal}</span>
            {t.heroSubAfter}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="#demo" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
              {t.getStarted}
            </a>
            <a href="#quickstart" className="rounded-lg border border-border px-5 py-2.5 text-sm">
              {t.nav.quickstart}
            </a>
          </div>
        </div>

        <div className="glow-accent overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="ml-3 font-mono text-xs text-muted-foreground">index.html</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
            <code>
              <span className="text-zinc-500">{t.codeComment1}</span>
              {'\n'}
              <span className="text-primary">&lt;ai-slot</span>{' '}
              <span className="text-sky-300">name</span>
              <span className="text-zinc-400">=</span>
              <span className="text-amber-200">"hero"</span>{' '}
              <span className="text-sky-300">src</span>
              <span className="text-zinc-400">=</span>
              <span className="text-amber-200">"/ai-render/hero"</span>
              <span className="text-primary">&gt;</span>
              {'\n  '}
              <span className="text-zinc-500">{t.codeComment2}</span>
              {'\n  '}
              <span className="text-zinc-300">&lt;section</span>{' '}
              <span className="text-sky-300">class</span>
              <span className="text-zinc-400">=</span>
              <span className="text-amber-200">"hero"</span>
              <span className="text-zinc-300">&gt;</span>
              {'\n    '}
              <span className="text-zinc-300">&lt;h1&gt;</span>
              <span className="text-zinc-100">{t.codeH1}</span>
              <span className="text-zinc-300">&lt;/h1&gt;</span>
              {'\n  '}
              <span className="text-zinc-300">&lt;/section&gt;</span>
              {'\n'}
              <span className="text-primary">&lt;/ai-slot&gt;</span>
            </code>
          </pre>
          <div className="border-t border-border px-5 py-3 font-mono text-xs text-muted-foreground">
            AI → <span className="text-primary">component-tree JSON</span> → {t.codeFooter}
          </div>
        </div>
      </div>
    </section>
  )
}

function Demo({ t, lang }: { t: Dict; lang: Lang }) {
  return (
    <section id="demo" className="scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-sm text-primary">{t.demoKicker}</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          {t.demoTitle}
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">{t.demoSub}</p>
        <div className="mt-10">
          <DemoSection lang={lang} />
        </div>
      </div>
    </section>
  )
}

const modeIcons = [Zap, Radio, UserPen]

function Modes({ t }: { t: Dict }) {
  return (
    <section id="modes" className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-sm text-primary">{t.modesKicker}</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          {t.modesTitle}
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">{t.modesSub}</p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {t.modes.map((m, i) => {
            const Icon = modeIcons[i]
            return (
              <div
                key={m.name}
                className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
              >
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{m.name}</h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  trigger: <span className="text-foreground">{m.trigger}</span>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
                <p className="mt-4 border-t border-border pt-3 font-mono text-xs text-primary">
                  {m.tag}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const safetyIcons = [FileCode2, Undo2, KeyRound, ShieldCheck]

function Safety({ t }: { t: Dict }) {
  return (
    <section id="safety" className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-sm text-primary">{t.safetyKicker}</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          {t.safetyTitle}
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">{t.safetySub}</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {t.safety.map((s, i) => {
            const Icon = safetyIcons[i]
            return (
              <div key={s.title} className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-primary" />
                  <h3 className="font-semibold">{s.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function QuickStart({ t }: { t: Dict }) {
  return (
    <section id="quickstart" className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-sm text-primary">{t.qsKicker}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t.qsTitle}</h2>
            <p className="mt-4 text-muted-foreground">
              {t.qsSubBefore}{' '}
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-primary">
                OPENAI_API_KEY
              </code>{' '}
              {t.qsSubAfter}
            </p>
            <div className="mt-8">
              <CopyCommand command={t.cloneCmd} />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="ml-3 font-mono text-xs text-muted-foreground">terminal</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-loose">
              <code>
                <span className="text-zinc-500">{t.qsComment}</span>
                {'\n'}
                <span className="text-zinc-400">$</span>{' '}
                <span className="text-zinc-100">pnpm install && pnpm build</span>
                {'\n'}
                <span className="text-zinc-400">$</span>{' '}
                <span className="text-zinc-100">node examples/plain-html/server.mjs</span>
                {'\n'}
                <span className="text-zinc-500">{t.qsOpen}</span>
              </code>
            </pre>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {t.stats.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-card px-6 py-5">
              <p className="font-mono text-lg font-bold text-primary">{k}</p>
              <p className="mt-1 text-sm text-muted-foreground">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTA({ t }: { t: Dict }) {
  return (
    <section className="border-t border-border/60">
      <div className="bg-grid relative mx-auto max-w-6xl px-6 py-28 text-center">
        <Layers className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          {t.ctaTitle}
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            <Github className="h-4 w-4" />
            {t.ctaStar}
          </a>
          <CopyCommand command="pnpm add @ai-slot/runtime" />
        </div>
      </div>
    </section>
  )
}

function Footer({ t }: { t: Dict }) {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-3 border-b border-border/60 pb-6 sm:flex-row sm:justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground/60">
            {t.footer.links}
          </span>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a
              href="https://iannil.com"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              IANNIL · 用 FDE 把真实问题做成产品
            </a>
            <a
              href="https://zhurongshuo.com"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              祝融说。 法不净空，觉无性也。
            </a>
          </nav>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 pt-6 sm:flex-row">
          <p className="font-mono">
            <span className="text-primary">&lt;ai-slot&gt;</span> · {t.footer.license}
          </p>
          <nav className="flex items-center gap-6">
            <a href={GITHUB} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
              GitHub
            </a>
            <a href={NPM} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
              npm
            </a>
            <a
              href={`${GITHUB}#readme`}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {t.footer.docs}
            </a>
            <a href="/agents/" className="transition-colors hover:text-foreground">Agent · MCP / API / RSS / Skill</a>
          </nav>
        </div>
      </div>
    </footer>
  )
}

export default function Home() {
  const [lang, toggle] = useLang()
  const t = dict[lang] as Dict
  return (
    <main className="min-h-screen bg-background">
      <Nav t={t} lang={lang} toggle={toggle} />
      <Hero t={t} />
      <Demo t={t} lang={lang} />
      <SlotResponsibilities lang={lang} />
      <Modes t={t} />
      <Safety t={t} />
      <QuickStart t={t} />
      <CTA t={t} />
      <Footer t={t} />
    </main>
  )
}
