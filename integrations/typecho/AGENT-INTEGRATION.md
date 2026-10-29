# Typecho 集成 recipe

适用：Typecho 1.1+ 自托管博客。插件源码见 `integrations/typecho/plugin/AiSlot/`。

## detect

- 页面 HTML 含 `<meta name="generator" content="Typecho ...">`（置信度：高）
- 页面或评论表单路径含 `/index.php/`（置信度：中，其他国产 CMS 也有）
- 资产路径含 `/usr/themes/` 或 `/usr/plugins/`（置信度：高）
- 后台地址 `/admin/`（置信度：低，需站长确认）

## files

- 插件安装：把 `integrations/typecho/plugin/AiSlot/` 整个目录复制到站点的 `usr/plugins/AiSlot/`（目录名必须恰好是 `AiSlot`，首字母大写）
- 插件依赖 `assets/ai-slot-embed.js`（由 `pnpm --filter example-ai-slot-embed-starter build` 生成并自动同步；缺失时先构建）

## patch

人类操作 / AI 引导站长操作：

1. 复制插件目录后，后台「控制台 → 插件」启用 `AiSlot`。
2. 插件「设置」填写默认交付端点（HTTPS），保存。
3. 在主题模板（如 `usr/themes/当前主题/index.php`、`post.php`、`page.php`）需要的位置插入（幂等：同一页面同一 `name` 只放一处）：

   ```php
   <?php AiSlot_Plugin::slot('hero', '', '<h2>原始兜底内容</h2>'); ?>
   ```

   参数：`$name` 槽位标识；`$src` 端点（空串用插件设置默认）；`$fallback` 兜底 HTML；`$refresh` 轮询秒数（-1 继承设置）；`$freshOnly`（null 继承设置）。
4. 端点只允许站长自己的 HTTPS 域名（127.0.0.1/localhost 的 HTTP 仅限本机联调）。

AI 执行（站长已授权且有 SSH / 文件写入能力时）：

```sh
cp -r integrations/typecho/plugin/AiSlot <站点根目录>/usr/plugins/AiSlot
```

然后在主题模板中插入上述一行调用。插件启用与端点配置无法纯命令行完成（Typecho 无 WP-CLI 等价物），需站长在后台点一次「启用」并填端点；AI 应给出逐步截图级指引。

## verify

AI 必须逐条执行并全部通过：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面 `<head>` 含 `type="module"` 且指向 `/usr/plugins/AiSlot/assets/ai-slot-embed.js` 的脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络（或端点指向不可达地址）刷新页面：仍显示兜底内容，无白屏、无 PHP 报错。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 删除主题模板中插入的 `AiSlot_Plugin::slot(...)` 行，确认前台不再出现 `<ai-slot>`。
2. 后台停用插件，删除 `usr/plugins/AiSlot/` 目录。
3. 回滚后页面与集成前完全一致。

## constraints

- 需要 Typecho ≥ 1.1、PHP ≥ 7.2；未在 1.3 的 `contentEx` 钩子（部分主题不触发）上依赖任何行为。
- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- 主题模板中的兜底 HTML 由主题作者控制，插件不转义它（与 Typecho 模板惯例一致）；`name` 与 `src` 一律转义。
- 本插件只做过静态契约校验（仓库 `integrations/embed/blog-trio.test.mjs`），未在真实 Typecho 运行时验证；首次部署请先在测试站启用。
