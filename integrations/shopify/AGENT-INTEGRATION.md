# Shopify 集成 recipe

> **状态：扩展骨架已落地（`integrations/shopify/extension/`），待 Partner 账号关联与发布。**
> 有两条路径：① 正式路径——Theme App Extension（商家拖拽使用，不碰代码，需 Partner 账号部署）；
> ② 过渡路径——主题代码注入（立即可用，主题升级会被覆盖）。

## 正式路径：Theme App Extension

部署步骤见 `integrations/shopify/README.md`：`pnpm --filter example-ai-slot-embed-starter build` → `shopify app config link`（需 Partner 账号）→ `shopify app deploy`。商家在主题编辑器开启「ai-slot 运行时」应用嵌入，再把「ai-slot 槽位」块拖入任意 section。单店分发无需商店审核；上架 App Store 需审核（1–2 周）。

## 过渡路径：主题代码注入

## detect

- 页面 HTML 含 `<!-- BEGIN theme app -->` 或资产域名 `cdn.shopify.com`（置信度：高）
- `<html>` / body 含 `shopify` class，脚本含 `shopify.js`（置信度：高）
- 页面含 `Shopify.theme` 全局对象（控制台执行 `typeof Shopify !== 'undefined'`）（置信度：高）

## files（过渡方案）

- 主题代码编辑：后台「Online Store → Themes → ⋯ → Edit code」（在线商店 → 模板 → 编辑代码）
- 目标文件：`layout/theme.liquid`（全站脚本）与具体 section 文件（如 `sections/main-product.liquid`）

## patch（过渡方案：主题代码注入）

> 正式 Theme App Extension 发布前，站长可通过主题代码注入使用。修改主题前先在后台「⋯ → Duplicate」创建主题副本，所有改动在副本上进行。

1. 把 `ai-slot-embed.js` 上传为资产或放到外部 HTTPS 托管：
   - 主题资产方式：「Edit code → Assets → Add a new asset」上传构建产物 `ai-slot-embed.js`。
2. 在 `layout/theme.liquid` 的 `</head>` 前加入（幂等：先搜索 `ai-slot-embed` 确认未重复）：

   ```liquid
   <script type="module" src="{{ 'ai-slot-embed.js' | asset_url }}"></script>
   ```

3. 在目标 section 的 `.liquid` 文件中需要的位置加入：

   ```liquid
   <ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only refresh-interval="60">
     <h2>原始兜底内容</h2>
   </ai-slot>
   ```

4. 预览副本主题确认无误后再发布（Publish）。

## verify

> 已实测通过（2026-10-29，Horizon 系主题 + demo.aislot.dev 交付端点）：
> 开发商店前台成功渲染演示端点返回的组件树并替换兜底内容。
> 证据截图：[docs/validation/assets/shopify/storefront-ai-content-rendered.png](../../docs/validation/assets/shopify/storefront-ai-content-rendered.png)。
> 实测注意：使用 demo.aislot.dev 时需关闭块的 fresh-only（演示响应不带过期时间，fresh-only 会按契约回退兜底）。

AI 必须逐条执行并全部通过：

1. 前台页面控制台 `customElements.get('ai-slot')` 返回函数。
2. `document.querySelector('ai-slot')` 存在且初始含兜底文本。
3. 交付端点不可达时页面正常显示兜底内容。
4. 切换商品页/集合页（SPA 感知的主题会重渲染 section）：`<ai-slot>` 重挂载后重新拉取，无报错。

## rollback

1. 删除 `theme.liquid` 与 section 中加入的片段。
2. 或直接切换回未修改的主题副本（Publish 原主题），再删除副本。

## constraints

- 「Edit code」对所有付费套餐开放；免费试用期内不可编辑代码。
- 主题更新（主题商店自动升级）可能覆盖手改代码——这是过渡方案的固有缺点，正式 Theme App Extension 不受影响。
- 部分商家启用了严格的 Content Security Policy：需允许脚本资产域与交付域。
- 正式路径的部署动作（`shopify app deploy`、Partner 账号操作、App Store 审核提交）必须由站长本人账号执行；AI 可准备材料与命令，但不持有站长凭证。
