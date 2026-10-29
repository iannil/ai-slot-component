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
    nav: { delivery: 'Delivery', safety: 'Safety', platforms: 'Platforms', quickstart: 'Quick start', star: 'Star' },
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
        body: 'Data changes can trigger invalidation so connected pages reload the slot. Live connections automatically reconnect after interruption. Initial installation and new component code may still require a host release.',
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
    qsComment: '# Node ≥ 22 for this workspace, pnpm (corepack enable)',
    qsOpen: '# → open https://demo.aislot.dev (hosted) or http://localhost:4173 (local)',
    platformsKicker: 'integrations',
    platformsTitle: 'Works with the site builders people actually use.',
    platformsSub:
      'Official plugins, a Shopify theme app extension, and copy-paste recipes — every integration keeps your original content as fallback, and every step can be executed by a human or delegated to an AI assistant.',
    platformGroups: [
      {
        label: 'Official plugin / extension',
        note: 'install & configure',
        items: ['wordpress', 'typecho', 'zblogphp', 'shopify'],
      },
      {
        label: 'Hosted builder recipes',
        note: 'paste the embed snippet',
        items: ['wix', 'squarespace', 'webflow', 'halo'],
      },
      {
        label: 'Template-injection recipes',
        note: 'one line in the theme template',
        items: ['empirecms', 'dedecms', 'pageadmin', 'metinfo', 'pbootcms', 'xunruicms', 'discuz'],
      },
    ] as const,
    platformDetails: {
      wordpress: {
        name: 'WordPress',
        recipe: 'integrations/wordpress/AGENT-INTEGRATION.md',
        steps: [
          'Upload and activate the ai-slot plugin (shortcode + Gutenberg block + Elementor widget included).',
          'Settings → ai-slot: set your HTTPS delivery endpoint.',
          'Insert a slot via [ai_slot] shortcode, the block editor, or Elementor.',
        ],
      },
      typecho: {
        name: 'Typecho',
        recipe: 'integrations/typecho/AGENT-INTEGRATION.md',
        steps: [
          'Copy the AiSlot folder into usr/plugins/ and enable it.',
          'Set the default endpoint in the plugin settings.',
          'Call AiSlot_Plugin::slot(\'hero\', \'\', \'fallback\') in the theme template.',
        ],
      },
      zblogphp: {
        name: 'Z-BlogPHP',
        recipe: 'integrations/zblogphp/AGENT-INTEGRATION.md',
        steps: [
          'Copy the AiSlot folder into zb_users/plugin/ and enable it.',
          'Set the default endpoint on the plugin admin page.',
          'Call {AiSlot_Slot(\'hero\', \'\', \'fallback\')} in the theme template.',
        ],
      },
      shopify: {
        name: 'Shopify',
        recipe: 'integrations/shopify/AGENT-INTEGRATION.md',
        steps: [
          'Deploy the Theme App Extension with the Shopify CLI (theme-code injection works meanwhile).',
          'Enable the app embed in the theme editor.',
          'Drag the ai-slot block into any section.',
        ],
      },
      wix: {
        name: 'Wix',
        recipe: 'integrations/wix/AGENT-INTEGRATION.md',
        steps: [
          'Host ai-slot-embed.js on your own HTTPS location.',
          'Add a Custom Element with tag ai-slot and name/src attributes.',
          'Publish and verify on the live site (paid plan required).',
        ],
      },
      squarespace: {
        name: 'Squarespace',
        recipe: 'integrations/squarespace/AGENT-INTEGRATION.md',
        steps: [
          'Code Injection → Header: add the module script.',
          'Add a Code Block containing the <ai-slot> element.',
          'Verify in visitor view (Business plan or above).',
        ],
      },
      webflow: {
        name: 'Webflow',
        recipe: 'integrations/webflow/AGENT-INTEGRATION.md',
        steps: [
          'Page settings → Custom Code: add the module script.',
          'Drag in an Embed element with the <ai-slot> markup.',
          'Publish the site (paid site plan required).',
        ],
      },
      halo: {
        name: 'Halo',
        recipe: 'integrations/halo/AGENT-INTEGRATION.md',
        steps: [
          'Host ai-slot-embed.js on your own HTTPS location.',
          'Paste the script and the <ai-slot> element into the theme template.',
          'No plugin needed; a Java plugin is deliberately deferred.',
        ],
      },
      empirecms: {
        name: 'EmpireCMS 帝国',
        recipe: 'integrations/empirecms/AGENT-INTEGRATION.md',
        steps: [
          'Admin → template manager (templates live in the database).',
          'Paste the script and the <ai-slot> element into the target template.',
          'Changes apply immediately.',
        ],
      },
      dedecms: {
        name: 'DedeCMS 织梦',
        recipe: 'integrations/dedecms/AGENT-INTEGRATION.md',
        steps: [
          'Edit templets/<style>/*.htm (back up first).',
          'Paste the script and the <ai-slot> element.',
          'Regenerate static pages via the update tool, or nothing changes.',
        ],
      },
      pageadmin: {
        name: 'PageAdmin',
        recipe: 'integrations/pageadmin/AGENT-INTEGRATION.md',
        steps: [
          'Admin → template management, online editor.',
          'Paste the script and the <ai-slot> element.',
          'Clear the cache if page caching is enabled.',
        ],
      },
      metinfo: {
        name: 'MetInfo',
        recipe: 'integrations/metinfo/AGENT-INTEGRATION.md',
        steps: [
          'Edit templates/<theme>/ files or use the admin code editor.',
          'Paste the script and the <ai-slot> element.',
          'Clear the site cache.',
        ],
      },
      pbootcms: {
        name: 'PbootCMS',
        recipe: 'integrations/pbootcms/AGENT-INTEGRATION.md',
        steps: [
          'Edit template/<style>/html/*.html.',
          'Paste the script and the <ai-slot> element.',
          'Clear the cache if changes do not appear.',
        ],
      },
      xunruicms: {
        name: 'XunRuiCMS 迅睿',
        recipe: 'integrations/xunruicms/AGENT-INTEGRATION.md',
        steps: [
          'Edit template/pc/<dir>/home/*.html.',
          'Paste the script and the <ai-slot> element.',
          'Refresh the compiled template cache in admin.',
        ],
      },
      discuz: {
        name: 'Discuz!',
        recipe: 'integrations/discuz/AGENT-INTEGRATION.md',
        steps: [
          'Admin → ads: add a "code" ad slot and paste the snippet — no code edit.',
          'Or inject into template/default/ templates directly.',
          'Update the cache after either path.',
        ],
      },
    } as const,
    genericPlatforms: {
      label: 'Any custom-HTML platform',
      note: 'the same 60-second snippet',
      items: ['Tilda', 'Duda', 'GoDaddy', 'Weebly', 'Framer', 'HubSpot', 'BigCommerce', 'SHOPLINE 店匠', '凡科', '建站之星', '上线了', '…'],
      steps: [
        'Host ai-slot-embed.js on any HTTPS static location.',
        'Add the module script and the <ai-slot> element where the platform allows custom HTML.',
        'Keep your original content inside the element as fallback.',
      ],
    },
    recipeLink: 'Full recipe →',
    genericSnippet:
      '<script type="module" src="https://your-domain/ai-slot-embed.js"></script>\n\n<ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only>\n  <h2>Original fallback content</h2>\n</ai-slot>',
    platformsFoot:
      'Each platform ships a detect → patch → verify → rollback recipe in integrations/, written for humans and AI assistants alike.',
    stats: [
      ['9 published packages', '7 SDK packages + experimental operations / mcp'],
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
    nav: { delivery: '交付模式', safety: '安全性', platforms: '支持平台', quickstart: '快速上手', star: 'Star' },
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
        body: '数据变更可触发失效通知，让连接正常的页面重新加载槽位；连接中断后自动重连。首次安装或新增组件代码仍可能需要宿主发布。',
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
    qsComment: '# 本仓库使用 Node ≥ 22，pnpm（corepack enable）',
    qsOpen: '# → 打开 https://demo.aislot.dev（在线）或 http://localhost:4173（本地）',
    platformsKicker: '集成',
    platformsTitle: '适配你正在用的建站程序。',
    platformsSub:
      '官方插件、Shopify 主题应用扩展与可粘贴的接入 recipe——每种集成都保留原始内容作为兜底，每一步既可以由站长手动完成，也可以交给 AI 助手执行。',
    platformGroups: [
      {
        label: '官方插件 / 扩展',
        note: '安装后配置即可',
        items: ['wordpress', 'typecho', 'zblogphp', 'shopify'],
      },
      {
        label: '托管建站平台 recipe',
        note: '粘贴嵌入片段',
        items: ['wix', 'squarespace', 'webflow', 'halo'],
      },
      {
        label: '模板注入 recipe',
        note: '主题模板加一行',
        items: ['empirecms', 'dedecms', 'pageadmin', 'metinfo', 'pbootcms', 'xunruicms', 'discuz'],
      },
    ] as const,
    platformDetails: {
      wordpress: {
        name: 'WordPress',
        recipe: 'integrations/wordpress/AGENT-INTEGRATION.md',
        steps: [
          '上传并启用 ai-slot 插件（含简码 + Gutenberg 区块 + Elementor 小组件）。',
          '「设置 → ai-slot」填写 HTTPS 交付端点。',
          '用简码 [ai_slot]、区块编辑器或 Elementor 插入槽位。',
        ],
      },
      typecho: {
        name: 'Typecho',
        recipe: 'integrations/typecho/AGENT-INTEGRATION.md',
        steps: [
          '把 AiSlot 目录复制到 usr/plugins/ 并启用。',
          '插件设置中填写默认交付端点。',
          '主题模板中调用 AiSlot_Plugin::slot(\'hero\', \'\', \'兜底内容\')。',
        ],
      },
      zblogphp: {
        name: 'Z-BlogPHP',
        recipe: 'integrations/zblogphp/AGENT-INTEGRATION.md',
        steps: [
          '把 AiSlot 目录复制到 zb_users/plugin/ 并启用。',
          '插件配置页填写默认交付端点。',
          '主题模板中调用 {AiSlot_Slot(\'hero\', \'\', \'兜底内容\')}。',
        ],
      },
      shopify: {
        name: 'Shopify',
        recipe: 'integrations/shopify/AGENT-INTEGRATION.md',
        steps: [
          '用 Shopify CLI 部署 Theme App Extension（过渡期可用主题代码注入）。',
          '主题编辑器中开启「ai-slot 运行时」应用嵌入。',
          '把「ai-slot 槽位」块拖入任意 section。',
        ],
      },
      wix: {
        name: 'Wix',
        recipe: 'integrations/wix/AGENT-INTEGRATION.md',
        steps: [
          '把 ai-slot-embed.js 托管到自己的 HTTPS 位置。',
          '添加 Custom Element：标签 ai-slot，配置 name/src 属性。',
          '发布后在正式站点验证（需付费套餐）。',
        ],
      },
      squarespace: {
        name: 'Squarespace',
        recipe: 'integrations/squarespace/AGENT-INTEGRATION.md',
        steps: [
          'Code Injection → Header 粘贴 module 脚本。',
          '页面添加 Code Block，放入 <ai-slot> 元素。',
          '退出编辑模式在访客视图验证（需 Business 档以上）。',
        ],
      },
      webflow: {
        name: 'Webflow',
        recipe: 'integrations/webflow/AGENT-INTEGRATION.md',
        steps: [
          'Page settings → Custom Code 粘贴 module 脚本。',
          'Designer 中拖入 Embed 元素，放入 <ai-slot> 标记。',
          '发布站点（需付费站点计划）。',
        ],
      },
      halo: {
        name: 'Halo',
        recipe: 'integrations/halo/AGENT-INTEGRATION.md',
        steps: [
          '把 ai-slot-embed.js 托管到自己的 HTTPS 位置。',
          '主题模板中粘贴脚本与 <ai-slot> 元素。',
          '无需插件；Java 插件刻意推迟。',
        ],
      },
      empirecms: {
        name: '帝国 CMS',
        recipe: 'integrations/empirecms/AGENT-INTEGRATION.md',
        steps: [
          '后台「模板管理」在线编辑（模板存数据库，改文件无效）。',
          '向目标模板粘贴脚本与 <ai-slot> 元素。',
          '保存即时生效。',
        ],
      },
      dedecms: {
        name: '织梦 DedeCMS',
        recipe: 'integrations/dedecms/AGENT-INTEGRATION.md',
        steps: [
          '编辑 templets/当前风格/ 下模板（先备份）。',
          '粘贴脚本与 <ai-slot> 元素。',
          '「生成 → 一键更新网站」重新生成静态页，否则前台不变。',
        ],
      },
      pageadmin: {
        name: 'PageAdmin',
        recipe: 'integrations/pageadmin/AGENT-INTEGRATION.md',
        steps: [
          '后台「模板管理」在线编辑。',
          '粘贴脚本与 <ai-slot> 元素。',
          '开启页面缓存时清空缓存。',
        ],
      },
      metinfo: {
        name: 'MetInfo',
        recipe: 'integrations/metinfo/AGENT-INTEGRATION.md',
        steps: [
          '编辑 templates/当前模板/ 文件或用后台「编辑代码」。',
          '粘贴脚本与 <ai-slot> 元素。',
          '清空站点缓存。',
        ],
      },
      pbootcms: {
        name: 'PbootCMS',
        recipe: 'integrations/pbootcms/AGENT-INTEGRATION.md',
        steps: [
          '编辑 template/当前风格/html/ 下模板。',
          '粘贴脚本与 <ai-slot> 元素。',
          '未即时生效时清理缓存。',
        ],
      },
      xunruicms: {
        name: '迅睿 XunRuiCMS',
        recipe: 'integrations/xunruicms/AGENT-INTEGRATION.md',
        steps: [
          '编辑 template/pc/当前目录/home/ 下模板。',
          '粘贴脚本与 <ai-slot> 元素。',
          '后台「更新缓存」（模板有编译缓存，必做）。',
        ],
      },
      discuz: {
        name: 'Discuz!',
        recipe: 'integrations/discuz/AGENT-INTEGRATION.md',
        steps: [
          '后台「运营 → 广告」添加「代码」类型广告位，粘贴片段——免改代码。',
          '或直接注入 template/default/ 模板。',
          '任一路径完成后「工具 → 更新缓存」。',
        ],
      },
    } as const,
    genericPlatforms: {
      label: '任何支持自定义 HTML 的平台',
      note: '同一段 60 秒片段',
      items: ['Tilda', 'Duda', 'GoDaddy', 'Weebly', 'Framer', 'HubSpot', 'BigCommerce', '凡科', '建站之星', '上线了', '店匠 SHOPLINE', '…'],
      steps: [
        '把 ai-slot-embed.js 托管到任意 HTTPS 静态位置。',
        '在平台允许自定义 HTML 的位置粘贴 module 脚本与 <ai-slot> 元素。',
        '原始内容留在元素内部作为兜底。',
      ],
    },
    recipeLink: '完整 recipe →',
    genericSnippet:
      '<script type="module" src="https://你的域名/ai-slot-embed.js"></script>\n\n<ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only>\n  <h2>原始兜底内容</h2>\n</ai-slot>',
    platformsFoot:
      '每个平台在 integrations/ 下都有 detect → patch → verify → rollback 六段式 recipe，同时面向人类站长与 AI 编程助手。',
    stats: [
      ['9 个已发布包', '7 个 SDK 包 + 实验性 operations / mcp'],
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
          <a href="#platforms" className="hidden transition-colors hover:text-foreground sm:block">
            {t.nav.platforms}
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

function PlatformDetail({
  d,
}: {
  d: Dict['platformDetails'][keyof Dict['platformDetails']] & { recipeLabel: string }
}) {
  return (
    <details className="group rounded-md border border-border bg-secondary/40 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-mono text-xs text-foreground">
        <span>{d.name}</span>
        <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
      </summary>
      <ol className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
        {d.steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-mono text-primary">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <a
        href={`${GITHUB}/blob/master/${d.recipe}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block font-mono text-xs text-primary hover:underline"
      >
        {d.recipeLabel}
      </a>
    </details>
  )
}

function Platforms({ t }: { t: Dict }) {
  return (
    <section id="platforms" className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-sm text-primary">{t.platformsKicker}</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          {t.platformsTitle}
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">{t.platformsSub}</p>
        <div className="mt-12 grid items-start gap-5 sm:grid-cols-2">
          {t.platformGroups.map((g) => (
            <div key={g.label} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">{g.label}</h3>
                <span className="font-mono text-xs text-muted-foreground">{g.note}</span>
              </div>
              <div className="mt-4 space-y-2">
                {g.items.map((key) => {
                  const d = t.platformDetails[key as keyof Dict['platformDetails']]
                  return <PlatformDetail key={key} d={{ ...d, recipeLabel: t.recipeLink }} />
                })}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">{t.genericPlatforms.label}</h3>
              <span className="font-mono text-xs text-muted-foreground">{t.genericPlatforms.note}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {t.genericPlatforms.items.map((item) => (
                <span
                  key={item}
                  className="rounded-md border border-border bg-secondary/60 px-2.5 py-1 font-mono text-xs text-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
            <ol className="mt-4 space-y-1.5 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
              {t.genericPlatforms.steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-primary">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
              <code>{t.genericSnippet}</code>
            </pre>
          </div>
        </div>
        <p className="mt-8 font-mono text-xs text-muted-foreground">{t.platformsFoot}</p>
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
      <Platforms t={t} />
      <QuickStart t={t} />
      <CTA t={t} />
      <Footer t={t} />
    </main>
  )
}
