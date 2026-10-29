# WordPress 集成 recipe

适用：WordPress.org 自托管站点（含 WooCommerce / Elementor / Gutenberg）。插件源码见 `integrations/wordpress/plugin/ai-slot/`。

## detect

- 页面 HTML 含 `<meta name="generator" content="WordPress ...">`（置信度：高）
- 资产路径含 `/wp-content/` 或 `/wp-includes/`（置信度：高）
- 后台地址 `/wp-admin/` 可访问（置信度：高，但勿探测客户后台，询问站长即可）

## files

- 插件安装：后台「插件 → 安装插件 → 上传插件」，或把 `integrations/wordpress/plugin/ai-slot/` 整个目录复制到 `wp-content/plugins/ai-slot/`
- 插件依赖 `assets/ai-slot-embed.js`（由 `pnpm --filter example-ai-slot-embed-starter build` 生成并自动同步；缺失时先构建）

## patch

人类操作 / AI 引导站长操作：

1. 安装并启用插件 `ai-slot`。
2. 「设置 → ai-slot」填写默认交付端点（HTTPS），保存。
3. 在目标页面用任一方式插入槽位（幂等：同一页面同一 `name` 只放一个）：
   - Gutenberg：添加「ai-slot 槽位」区块，填写兜底内容；
   - 简码：`[ai_slot name="hero" src="https://delivery.example/ai-render/hero"]原始兜底内容[/ai_slot]`；
   - Elementor：拖入「ai-slot 槽位」小组件。
4. `src` 留空时使用设置页默认端点；端点只允许站长自己的 HTTPS 域名（127.0.0.1/localhost 的 HTTP 仅限本机联调）。

AI 通过 WP-CLI 执行（站长已授权且有 SSH 时）：

```sh
wp plugin install /path/to/ai-slot.zip --activate
wp option update ai_slot_options '{"default_src":"https://delivery.example/ai-render/hero","refresh_interval":60,"fresh_only":1}' --format=json
# 在目标页面追加简码（示例：ID 为 42 的页面）
wp post update 42 --post_content="$(wp post get 42 --field=content)"$'\n[ai_slot name="hero"]原始兜底内容[/ai_slot]'
```

## verify

AI 必须逐条执行并全部通过：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面包含 `type="module"` 的 `ai-slot-embed.js` 脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络（或端点指向不可达地址）刷新页面：仍显示兜底内容，无白屏、无错误弹窗。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 把页面中的槽位（区块/简码/小组件）删除，确认前台不再加载 `ai-slot-embed.js`。
2. 后台停用并删除插件；删除 `ai_slot_options` 选项（`wp option delete ai_slot_options`）。
3. 回滚后页面与集成前完全一致。

## constraints

- 需要 WordPress ≥ 6.0、PHP ≥ 7.4。
- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- 部分缓存插件（如 WP Super Cache）会缓存页面 HTML：槽位标记可缓存（内容是浏览器端拉取），无需排除。
- Elementor 小组件仅在 Elementor 已安装时出现；未安装 Elementor 不影响其他两种形态。
