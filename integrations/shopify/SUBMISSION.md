# Shopify App Store 上架提交材料

> 目标：让 `ai-slot` 在 Shopify App Store 可被公开搜索安装。
> 当前状态：应用已在 Partner Dashboard 创建并完成开发商店实测（2026-10-29），版本 ai-slot-3 已含强制合规 Webhook 配置；**尚未提交上架审核**。
> 过渡方案：提交审核前，可通过 Partner Dashboard「Distribution」生成安装链接做单店分发（无需审核）。

## 一、技术硬性门槛（逐项核对）

| 要求 | 状态 | 说明 |
|---|---|---|
| HTTPS 托管 | ✅ | 落地页 `aislot.dev`、演示端点 `demo.aislot.dev` 均为 HTTPS |
| 强制 GDPR 合规 Webhook | ✅ | `customers/data_request`、`customers/redact`、`shop/redact` 三个 topic 已在 `shopify.app.ai-slot.toml` 声明，端点 `https://demo.aislot.dev/webhooks/shopify/compliance` 实测应答 200（应用零权限、不存储任何店铺或客户数据，仅确认收到） |
| GraphQL Admin API（2025-04-01 起新应用禁用 REST） | ✅ | 应用完全不调用 Admin API（`scopes = ""`），天然合规 |
| Theme App Extension（不得直接改主题代码） | ✅ | 正式路径即 Theme App Extension；主题代码注入仅为文档中的过渡方案 |
| OAuth 安装流程 | ✅ | 由 Shopify 托管（embedded = false 的非嵌入应用由 CLI 模板流程接管） |
| App Bridge | N/A | 非嵌入应用（无后台 iframe 页面），不要求 App Bridge |
| 隐私政策 URL | ✅ | `https://aislot.dev/privacy` 已上线 |
| 商家可完整走通安装→启用→渲染 | ✅ | 开发商店 `ai-slot.myshopify.com` 已实测（证据：`docs/validation/assets/shopify/storefront-ai-content-rendered.png`） |

## 二、应用列表资料（Listing）

在 Partner Dashboard → Apps → ai-slot → App listings 填写。

### 应用名称与 handle

- Name: `ai-slot`（已占用，与 handle 一致）
- 不得以「Shopify」开头或含 Shopify 商标；图标与截图中不得出现 Shopify 购物袋 logo。

### Tagline（一句话，英文为主）

```
AI content slots for your existing theme — validated JSON, rendered as real blocks, silent fallback.
```

### 详细描述（英文，粘贴用）

```
ai-slot turns any region of your existing storefront into a safe delivery channel
for AI-generated content. AI returns a validated component-tree JSON — never raw
HTML — which is rendered as your theme's real components. If generation fails,
times out, or fails validation, the slot silently falls back to your original
content. No white screens, no broken pages.

How it works:
1. Enable the ai-slot app embed in the theme editor.
2. Drag an "ai-slot" block into any section and set the delivery endpoint.
3. Content updates ship to the slot without redeploying or editing theme code.

Safety by design:
- AI never outputs HTML — only structured component trees validated against
  registered component schemas.
- Original fallback content stays inside the slot, so SEO and accessibility
  degrade gracefully.
- The app requests zero Admin API permissions and stores no shop or customer
  data. Mandatory compliance webhooks are answered with a bare acknowledgement.

Free and open source (MIT): https://github.com/iannil/ai-slot-component
```

### 图标

- 1200×1200 PNG，不含 Shopify 商标。已生成候选稿：`integrations/shopify/listing-assets/app-icon.png`（深色底 + 槽位图形，与 Z-BlogPHP 插件 logo 同一视觉语言）；不满意可在提交前替换。

### 截图（必须，建议 3 张以上，1600×900 或 1280×720，展示真实界面）

需实际截取（浏览器打开开发商店即可）：

1. 主题编辑器中拖入「ai-slot 槽位」块并配置端点的画面；
2. 前台页面渲染 AI 组件树的画面（参考已有证据截图构图）；
3. 端点不可达时前台仍显示兜底内容的画面（对照组，最能体现卖点）。

每张截图配描述性 alt 文本；不得用股票图/摆拍图。

### 分类与定价

- Category: Store design → Page enhancements（或按 Dashboard 最新分类树就近选择）
- Pricing: Free（免费应用无需 Billing API 集成）

### 联系与支持

- Support email：使用站长常用邮箱
- Support URL：`https://github.com/iannil/ai-slot-component/issues`

## 三、Test instructions（审核员测试指引，粘贴用）

```
1. Install the app on the provided development store.
2. Go to Online Store → Themes → Customize.
3. In the theme editor, enable the "ai-slot runtime" app embed (App embeds panel).
4. Add an "ai-slot slot" block to the home page hero section.
5. In the block settings, set the delivery endpoint to:
   https://demo.aislot.dev/ai-render/shop-hero
   Disable the fresh-only toggle for this demo endpoint (demo responses carry no expiry).
6. Save and visit the storefront: the slot renders the component tree returned
   by the endpoint, replacing the fallback content.
7. (Fallback check) Change the endpoint to https://demo.aislot.dev/ai-render/shop-rec
   (this endpoint intentionally fails): the slot keeps showing the original
   fallback content with no blank area and no console error.
```

## 四、Screencast（强烈建议）

用 Loom / 系统录屏录一段 1–2 分钟的英文旁白视频：安装 → 开启应用嵌入 → 拖入槽位块 → 前台渲染 → 失败兜底对照。审核员会先看视频再装应用。

## 五、提交步骤（站长本人操作，AI 不得持有凭证）

1. Partner Dashboard → Apps → ai-slot → Distribution，确认选择「Public distribution / Shopify App Store」。
2. App listings 填写第二节全部资料（英文必填，可加中文本地化）。
3. 粘贴第三节 Test instructions。
4. 提交审核（Submit for review）。
5. 审核周期约 1–4 周；驳回邮件会给出具体条款编号，按条修复后重新提交。

## 六、常见驳回点自检（提交前过一遍）

- [ ] 安装后没有任何 404/500 页面
- [ ] 描述中没有「即将上线」的功能承诺（只写当前真实可用的能力）
- [ ] 图标、截图无 Shopify 商标
- [ ] Test instructions 逐条可执行，无需审核员注册任何外部账号
- [ ] 定价信息与实际一致（Free）
- [ ] 应用卸载后主题无残留（Theme App Extension 卸载即整体移除，天然满足；在 Test instructions 中可补一句说明）
