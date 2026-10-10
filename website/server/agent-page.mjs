import { styles } from './generated-agent-style.mjs';

const github = 'https://github.com/iannil/ai-slot-component';
const link = 'text-primary underline-offset-4 hover:underline';
const channels = [
  {
    name:'MCP', label:'连接你的 Agent',
    description:'在支持 Streamable HTTP 的客户端添加端点，直接发现文档搜索与读取工具。',
    code:'https://aislot.dev/mcp',
    detail:'无需令牌。提供 search_docs、read_doc 工具与 aislot://guide 资源。浏览器 GET 返回 405 属预期，不提供 SSE 订阅。',
    links:`<a class="${link}" href="#quickstart">查看调用示例 →</a>`,
  },
  {
    name:'API', label:'直接读取文档',
    description:'使用公开 JSON 接口搜索关键词、读取完整正文，将文档接入自己的工作流。',
    code:'GET /api/agent/search?q=React&limit=5',
    detail:'读取 nextCursor 直至为空。400 时修正参数，404 时从目录选择 ID，空结果时缩短关键词。',
    links:`<a class="${link}" href="/agent/openapi.json">OpenAPI →</a><a class="${link}" href="/api/agent/content?id=adapter-react">读取示例 →</a>`,
  },
  {
    name:'RSS', label:'跟踪内容更新',
    description:'订阅公开文档 Feed，发现最新变更。每条内容保留真实来源与文档提交时间。',
    code:'https://aislot.dev/agent/feed.xml',
    detail:'稳定条目 ID，支持缓存校验。RSS 用于发现和跟踪更新，不执行业务操作。',
    links:`<a class="${link}" href="/agent/feed.xml">打开 Feed →</a>`,
  },
  {
    name:'SKILL', label:'按步骤完成接入',
    description:'给 Agent 一份可执行的阅读与接入指南，涵盖查询、错误恢复和来源引用。',
    code:'ai-slot-guide/SKILL.md',
    detail:'下载同名目录 ZIP，按客户端指南安装。下载不等于安装或执行。',
    links:`<a class="${link}" href="/agent/skills/ai-slot-guide/SKILL.md">阅读 Skill →</a><a class="${link}" href="/agent/ai-slot-guide.zip">下载 ZIP ↓</a><a class="${link}" href="/agent/checksums.json">校验文件</a>`,
  },
];
const escape = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

export const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="通过 MCP、API、RSS 或 Skill 将 AI Slot 公开文档接入 Agent。查询接入方法、读取完整来源、跟踪文档更新。">
  <title>ai-slot — Agent 接入</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="canonical" href="https://aislot.dev/agents/">
  <link rel="alternate" type="application/rss+xml" href="/agent/feed.xml">
  <style>${styles}</style>
</head>
<body class="min-h-screen bg-background text-foreground">
  <header class="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
      <a href="/" aria-label="AI Slot 首页" class="flex shrink-0 items-center gap-2 font-mono text-base font-bold tracking-tight">
        <img src="/logo.svg" alt="" class="h-5 w-5"><span class="text-primary">&lt;ai-slot&gt;</span>
      </a>
      <nav aria-label="主导航" class="flex items-center gap-6 text-sm text-muted-foreground">
        <a href="/#modes" class="hidden transition-colors hover:text-foreground sm:block">内容交付</a>
        <a href="/#safety" class="hidden transition-colors hover:text-foreground sm:block">安全</a>
        <a href="/#quickstart" class="hidden transition-colors hover:text-foreground sm:block">快速开始</a>
        <a href="/agents/" aria-current="page" class="text-primary">Agent</a>
        <a href="${github}" class="rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-primary/60">GitHub ↗</a>
      </nav>
    </div>
  </header>
  <main>
    <section class="bg-grid relative overflow-hidden border-b border-border/60 pt-14">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,hsl(80_84%_56%/0.12),transparent)]"></div>
      <div class="relative mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pb-20 sm:pt-24">
        <p class="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 font-mono text-xs text-muted-foreground">
          <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>AGENT ACCESS · 公开文档 · 无需令牌
        </p>
        <h1 class="text-gradient text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">让 Agent 读懂<br class="sm:hidden"> AI Slot。</h1>
        <p class="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">通过 MCP、API、RSS 或 Skill，查询存量 HTML、React、Vue 页面的接入方法。四种入口，共用真实项目文档。</p>
        <div class="mt-8 flex flex-wrap items-center gap-4">
          <a href="#channels" class="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]">选择接入方式 →</a>
          <a href="/agent/catalog.json" class="rounded-lg border border-border bg-secondary/60 px-5 py-2.5 text-sm transition-colors hover:border-primary/50">浏览内容目录</a>
        </div>
        <p class="mt-6 text-sm text-muted-foreground">当前提供文档查询与读取，不代为部署、修改页面或调用 LLM。</p>
      </div>
    </section>
    <section id="channels" aria-labelledby="channels-title" class="mx-auto max-w-6xl scroll-mt-20 px-6 py-16 sm:py-20">
      <p class="font-mono text-xs uppercase tracking-widest text-primary">01 / CONNECT</p>
      <h2 id="channels-title" class="mt-3 text-3xl font-bold tracking-tight">选择适合你的入口</h2>
      <p class="mt-4 text-muted-foreground">一次任务，选择一种合适的方式即可。</p>
      <div class="mt-8 grid gap-5 md:grid-cols-2">
        ${channels.map(channel=>`<article class="flex min-w-0 flex-col rounded-xl border border-border bg-card p-6 sm:p-7">
          <div class="flex items-center justify-between gap-3"><h3 class="font-mono text-xl font-semibold text-primary">${channel.name}</h3><span class="text-sm text-muted-foreground">${channel.label}</span></div>
          <p class="mt-4 leading-relaxed text-muted-foreground">${channel.description}</p>
          <pre class="mt-5 overflow-x-auto rounded-lg border border-border bg-background px-4 py-3 text-xs leading-relaxed sm:text-sm"><code>${escape(channel.code)}</code></pre>
          <p class="mt-4 text-sm leading-relaxed text-muted-foreground">${channel.detail}</p>
          <div class="mt-auto flex flex-wrap gap-x-5 gap-y-3 pt-6 text-sm">${channel.links}</div>
        </article>`).join('')}
      </div>
    </section>
    <section id="quickstart" aria-labelledby="quickstart-title" class="border-y border-border/60 bg-card/50 scroll-mt-20">
      <div class="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center">
        <div>
          <p class="font-mono text-xs uppercase tracking-widest text-primary">02 / QUICK START</p>
          <h2 id="quickstart-title" class="mt-3 text-3xl font-bold tracking-tight">从任务到有来源的答案</h2>
          <p class="mt-5 leading-relaxed text-muted-foreground">先搜索，再读完正文。跟随 nextCursor 读取后续内容，并引用 canonicalUrl；没有结果时如实说明。</p>
          <a class="mt-6 inline-block text-sm ${link}" href="/api/agent/search?q=React&amp;limit=5">试试搜索 React →</a>
        </div>
        <div class="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
          <div class="flex items-center gap-1.5 border-b border-border px-4 py-3"><span class="h-2.5 w-2.5 rounded-full bg-zinc-700"></span><span class="h-2.5 w-2.5 rounded-full bg-zinc-700"></span><span class="h-2.5 w-2.5 rounded-full bg-zinc-700"></span><span class="ml-3 font-mono text-xs text-muted-foreground">agent / quickstart</span></div>
          <div class="p-5"><p class="font-mono text-xs text-primary">MCP</p><pre class="mt-3 overflow-x-auto text-sm leading-7"><code>search_docs({"q":"React","limit":5})
read_doc({"id":"adapter-react"})</code></pre>
          <p class="mt-6 font-mono text-xs text-primary">HTTP</p><pre class="mt-3 overflow-x-auto text-xs leading-7 sm:text-sm"><code>curl 'https://aislot.dev/api/agent/search?q=React&amp;limit=5'
curl 'https://aislot.dev/api/agent/content?id=adapter-react'</code></pre></div>
        </div>
      </div>
    </section>
    <section aria-labelledby="boundaries-title" class="mx-auto max-w-6xl px-6 py-16">
      <p class="font-mono text-xs uppercase tracking-widest text-primary">03 / BOUNDARIES</p>
      <h2 id="boundaries-title" class="mt-3 text-3xl font-bold tracking-tight">明确能力，也保留边界</h2>
      <div class="mt-8 grid gap-8 text-sm leading-7 text-muted-foreground md:grid-cols-3">
        <div><h3 class="mb-2 font-semibold text-foreground">安全交付</h3><p>AI 只输出组件树 JSON，必须校验后渲染。密钥只在服务端，原始兜底始终保留。</p></div>
        <div><h3 class="mb-2 font-semibold text-foreground">当前限制</h3><p>尚未提供 token 级流式、live 自动重连及多实例缓存/限流抽象。公开入口不保证被所有 Agent 自动发现。</p></div>
        <div><h3 class="mb-2 font-semibold text-foreground">公开访问</h3><p>不提交私有代码或凭据。采集仅记录通道、状态、数量与耗时，不记录查询正文。平台可能施加流量防护。</p></div>
      </div>
      <p class="mt-8 text-sm leading-relaxed text-muted-foreground">可选来源头：<code class="break-all font-mono text-foreground">X-Iannil-Entry-Source: skill</code>。客户端不支持时可省略，不影响访问。</p>
    </section>
  </main>
  <footer class="border-t border-border/60">
    <div class="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">
      <div class="flex flex-col items-center gap-3 border-b border-border/60 pb-6 sm:flex-row sm:justify-between">
        <span class="font-mono text-xs uppercase tracking-widest text-muted-foreground/60">更多来自作者</span>
        <nav aria-label="作者链接" class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"><a href="https://iannil.com" class="hover:text-foreground">IANNIL · 用 FDE 把真实问题做成产品</a><a href="https://zhurongshuo.com" class="hover:text-foreground">祝融说。 法不净空，觉无性也。</a></nav>
      </div>
      <div class="flex flex-col items-center justify-between gap-4 pt-6 sm:flex-row">
        <p class="font-mono"><a href="/" class="text-primary">&lt;ai-slot&gt;</a> · MIT 许可证</p>
        <nav aria-label="资源链接" class="flex flex-wrap justify-center gap-6"><a href="${github}" class="hover:text-foreground">GitHub</a><a href="https://www.npmjs.com/package/@ai-slot/runtime" class="hover:text-foreground">npm</a><a href="${github}#readme" class="hover:text-foreground">文档</a><a href="/llms.txt" class="hover:text-foreground">llms.txt</a><a href="/agent/catalog.json" class="hover:text-foreground">内容目录</a></nav>
      </div>
    </div>
  </footer>
</body>
</html>`;
