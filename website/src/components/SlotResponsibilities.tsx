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
