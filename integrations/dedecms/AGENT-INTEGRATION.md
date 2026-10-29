# 织梦 CMS（DedeCMS）集成 recipe

适用：DedeCMS 5.7 自托管站点。无需插件，模板注入即可。

> 注意：织梦默认将页面生成为静态 HTML，改完模板必须重新生成页面才能生效（见 patch 第 4 步）。

## detect

- 资产路径含 `/templets/`（置信度：高）
- 页面源码含 `dedeajax` 或 `/include/dedeajax2.js`（置信度：高）
- 页脚含「Powered by DedeCMS」「织梦」字样（置信度：中）
- 后台地址 `/dede/`（置信度：高，但勿探测客户后台，询问站长即可）

## files

- 无需安装插件。嵌入脚本 `ai-slot-embed.js` 由 `pnpm --filter example-ai-slot-embed-starter build` 生成（产物在 `integrations/embed/assets/`），自托管在任意 HTTPS 静态位置。
- 模板文件位于 `templets/当前风格/`（默认风格为 `templets/default/`），可用 FTP/SSH 直接编辑，也可用后台在线编辑。

## patch

人类操作 / AI 引导站长操作：

1. 后台「模板 → 默认模板管理」在线编辑，或直接编辑 `templets/当前风格/` 下的模板文件（`index.htm` 首页、`article_article.htm` 文章页、`list_article.htm` 列表页、公共头部 `header.htm`）。改动前先备份原文件。
2. 在 `header.htm`（或目标模板 `<head>`）加入脚本（整站只加一次）：

   ```html
   <script type="module" src="https://你的域名/ai-slot-embed.js"></script>
   ```

3. 在需要的位置插入槽位（同一页面同一 `name` 只放一处）：

   ```html
   <ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only refresh-interval="60">
     <!-- 原始兜底内容：AI 不可用时页面保持原样 -->
     <h2>欢迎来到本站</h2>
   </ai-slot>
   ```

4. **重新生成静态页**：后台「生成 → 一键更新网站」（或「更新主页 HTML」+ 对应栏目/文档），否则前台仍是旧 HTML。
5. 端点只允许站长自己的 HTTPS 域名。

AI 执行（站长已授权且有 SSH/FTP 时）：直接编辑 `templets/当前风格/` 下模板文件，先 `cp` 备份；编辑后提示站长在后台执行「一键更新网站」（或 AI 用浏览器自动化代为点击）。静态页未重新生成前 verify 不会通过，属预期行为。

## verify

AI 必须逐条执行并全部通过（执行前先确认静态页已重新生成）：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面含 `type="module"` 的 `ai-slot-embed.js` 脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络刷新页面：仍显示兜底内容，无白屏。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 恢复集成前备份的模板文件（或后台粘贴回原内容）。
2. 后台「生成 → 一键更新网站」重新生成静态页。
3. 回滚后页面与集成前完全一致。

## constraints

- 静态生成是织梦的默认行为：模板改动不重新生成就不会出现在前台；verify 失败时先排查这一点。
- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- 部分织梦站点把 `templets/` 移到了自定义路径：以后台「系统 → 系统基本参数 → 模板默认风格」显示的路径为准。
- 织梦历史上安全漏洞较多，建议站长确认已升级到官方最新修复版本再接入任何新组件。
