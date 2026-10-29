# ai-slot 建站程序集成中心

> 本目录是 ai-slot 面向存量站点的集成入口，**同时面向人类站长与 AI 编程助手**。
> AI 助手：本文件即索引，按目标平台取对应 `AGENT-INTEGRATION.md` 执行即可。

ai-slot 把存量页面的指定区域变成 AI 内容的安全上线通道：AI 返回结构化组件树 JSON（绝不返回 HTML），经校验后渲染为站点真实组件；失败、超时、校验不过一律静默回退原始内容。

## 60 秒接入（任何支持自定义 HTML 的平台）

```html
<script type="module" src="https://你的域名/ai-slot-embed.js"></script>

<ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only refresh-interval="60">
  <!-- 原始兜底内容：AI 不可用时页面保持原样，SEO 与无障碍不受影响 -->
  <h2>欢迎来到本站</h2>
</ai-slot>
```

- `ai-slot-embed.js` 由 `integrations/embed` 构建（`pnpm --filter example-ai-slot-embed-starter build`），自托管在任意 HTTPS 静态位置。
- 内置 5 个起步组件：`hero-banner`、`markdown-block`、`info-card`、`cta-banner`、`feature-list`。AI 文本一律以 `textContent` 写入，链接仅允许 http/https。
- 自定义组件集请使用完整 SDK（见仓库根 README）。
- 交互式生成接入代码：`integrations/wizard/index.html`（浏览器直接打开）。

## 平台 recipe 索引

| 平台 | recipe | 集成方式 | 状态 |
|---|---|---|---|
| WordPress（含 WooCommerce / Elementor / Gutenberg） | [wordpress/AGENT-INTEGRATION.md](wordpress/AGENT-INTEGRATION.md) | 官方插件（简码 + 块 + Elementor Widget） | ✅ 可用 |
| Wix | [wix/AGENT-INTEGRATION.md](wix/AGENT-INTEGRATION.md) | Custom Element 嵌入 | ✅ 可用（需付费套餐） |
| Squarespace | [squarespace/AGENT-INTEGRATION.md](squarespace/AGENT-INTEGRATION.md) | Code Block / Code Injection | ✅ 可用（需 Business 档以上） |
| Webflow | [webflow/AGENT-INTEGRATION.md](webflow/AGENT-INTEGRATION.md) | Embed 元素 | ✅ 可用（需付费站点计划） |
| Shopify | [shopify/AGENT-INTEGRATION.md](shopify/AGENT-INTEGRATION.md) | Theme App Extension + 主题代码注入过渡方案 | ✅ 开发商店实测通过 |
| Typecho | [typecho/AGENT-INTEGRATION.md](typecho/AGENT-INTEGRATION.md) | 官方插件（主题模板 `AiSlot_Plugin::slot()` + 设置页） | ✅ 可用（静态契约校验） |
| Z-BlogPHP | [zblogphp/AGENT-INTEGRATION.md](zblogphp/AGENT-INTEGRATION.md) | 官方插件（模板函数 `AiSlot_Slot()` + 配置页） | ✅ 可用（静态契约校验） |
| Halo | [halo/AGENT-INTEGRATION.md](halo/AGENT-INTEGRATION.md) | 主题模板注入（Java 插件推迟） | ✅ 可用（模板注入） |

其余支持「自定义 HTML/JS」的平台（Tilda T123、Duda HTML 组件、GoDaddy、Weebly Embed Code、Framer、HubSpot 自定义模块、BigCommerce Script Manager、凡科代码嵌入、建站之星 HTML 组件、上线了 Custom Code、店匠/SHOPLINE 主题代码等）均适用上方 60 秒接入片段，逐平台图文步骤随 recipe 补全。

服务端模板系 CMS（帝国 CMS、织梦、PageAdmin、MetInfo、PbootCMS、迅睿、Discuz! 等）：在页面模板需要的位置粘贴同一 `<ai-slot>` 片段即可，无需插件。

## 规范与约定

- recipe 编写规范：[AGENT-INTEGRATION.schema.md](AGENT-INTEGRATION.schema.md)（detect / files / patch / verify / rollback / constraints 六段式）。
- 覆盖率口径与平台全景调研：本地 `docs/research/2026-10-29-site-builder-coverage-research.md`（该目录按仓库约定不入库）。

## AI 助手快速路由

1. 拿到站点 URL → 按各 recipe 的 `detect` 小节识别平台。
2. 打开对应平台的 `AGENT-INTEGRATION.md`。
3. 按 `patch` 执行 → 按 `verify` 自检（必须全部通过）→ 失败按 `rollback` 回滚并报告。
4. 平台无法识别：使用上方 60 秒片段 + 询问站长「后台是否有自定义代码/HTML 嵌入入口」。
