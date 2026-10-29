import { useState } from 'react'
import { Languages, ShieldCheck } from 'lucide-react'

type Lang = 'en' | 'zh'

const dict = {
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: October 29, 2026',
    intro:
      'This policy covers the aislot.dev website, the ai-slot open-source packages, and the official CMS integrations (including the WordPress plugin and the Shopify theme app extension).',
    sections: [
      {
        h: 'What we collect',
        items: [
          'Website (aislot.dev): page-view and usage statistics via Google Analytics (GA4, measurement ID G-6YRQHNCGZL). Google processes this data under its own privacy policy; we see only aggregated reports.',
          'Demo service (demo.aislot.dev): serves public demo content. Our hosting provider (Cloudflare) keeps standard server logs. The demo API stores no personal data.',
          'Agent/MCP endpoints: server-side telemetry is off by default and only enabled explicitly by the operator.',
        ],
      },
      {
        h: 'What we do not collect',
        items: [
          'The ai-slot runtime, plugins and extensions make requests only to the delivery endpoint configured by the site owner. They send no visitor data to us and contain no tracking.',
          'The Shopify extension requests zero Admin API scopes and cannot read store data.',
          'The WordPress plugin collects no data and phones home to nothing.',
          'We do not sell, rent or share any data with third parties for marketing.',
        ],
      },
      {
        h: 'Cookies',
        items: [
          'Google Analytics sets first-party cookies (e.g. _ga) on aislot.dev to distinguish visits. You can block them in your browser without breaking the site.',
          'The ai-slot runtime and integrations set no cookies.',
        ],
      },
      {
        h: 'Your choices',
        items: [
          'Block analytics cookies or use a content blocker; the site remains fully usable.',
          'Site owners control their own delivery endpoints and the data those endpoints process; that processing is governed by the site owner’s own privacy policy.',
        ],
      },
      {
        h: 'Contact & changes',
        items: [
          'Questions: open an issue at github.com/iannil/ai-slot-component.',
          'Changes to this policy are posted on this page with an updated date.',
        ],
      },
    ],
    back: '← Back to home',
  },
  zh: {
    title: '隐私政策',
    updated: '最后更新：2026 年 10 月 29 日',
    intro:
      '本政策适用于 aislot.dev 官网、ai-slot 开源软件包，以及官方建站程序集成（含 WordPress 插件与 Shopify 主题扩展）。',
    sections: [
      {
        h: '我们收集什么',
        items: [
          '官网（aislot.dev）：通过 Google Analytics（GA4，衡量 ID G-6YRQHNCGZL）统计页面访问与使用情况。该数据由 Google 按其隐私政策处理，我们只能看到聚合报表。',
          '演示服务（demo.aislot.dev）：提供公开演示内容。托管方（Cloudflare）保留标准服务器日志；演示 API 不存储任何个人数据。',
          'Agent/MCP 端点：服务端遥测默认关闭，仅在部署者显式开启时生效。',
        ],
      },
      {
        h: '我们不收集什么',
        items: [
          'ai-slot 运行时、插件与扩展只向站长自己配置的交付端点发起请求，不向我们发送任何访客数据，也不含任何追踪代码。',
          'Shopify 扩展申请零 Admin API 权限，无法读取店铺数据。',
          'WordPress 插件不收集任何数据，不连接任何第三方服务。',
          '我们不出售、出租或以营销目的与第三方共享任何数据。',
        ],
      },
      {
        h: 'Cookie',
        items: [
          'Google Analytics 在 aislot.dev 上设置第一方 Cookie（如 _ga）用于区分访问。你可以在浏览器中屏蔽它们，不影响网站正常使用。',
          'ai-slot 运行时与各平台集成不设置任何 Cookie。',
        ],
      },
      {
        h: '你的选择',
        items: [
          '可以屏蔽分析 Cookie 或使用内容拦截器，网站功能不受影响。',
          '站长的交付端点自行控制其数据处理行为，该部分由站长自己的隐私政策约束。',
        ],
      },
      {
        h: '联系与变更',
        items: [
          '如有问题，请在 github.com/iannil/ai-slot-component 提交 issue。',
          '本政策的变更会更新本页面并标注日期。',
        ],
      },
    ],
    back: '← 返回首页',
  },
}

export default function Privacy() {
  const [lang, setLang] = useState<Lang>(() =>
    typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en',
  )
  const t = dict[lang]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <a href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t.back}
          </a>
          <button
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Languages className="h-3.5 w-3.5" />
            {lang === 'en' ? '中文' : 'English'}
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        </div>
        <p className="mb-2 font-mono text-xs text-muted-foreground">{t.updated}</p>
        <p className="mb-10 leading-relaxed text-muted-foreground">{t.intro}</p>

        {t.sections.map((s) => (
          <section key={s.h} className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">{s.h}</h2>
            <ul className="space-y-2">
              {s.items.map((item) => (
                <li key={item.slice(0, 32)} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
