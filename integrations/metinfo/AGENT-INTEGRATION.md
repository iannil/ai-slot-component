# MetInfo 集成 recipe

适用：MetInfo 6.x/7.x（PHP）自托管站点。无需插件，模板注入即可。

## detect

- 页面 HTML 含 `<meta name="generator" content="MetInfo ...">`（置信度：高）
- 页脚含「Powered by MetInfo」「米拓」字样（置信度：中）
- 后台地址 `/admin/`（置信度：低，需站长确认）

## files

- 无需安装插件。嵌入脚本 `ai-slot-embed.js` 由 `pnpm --filter example-ai-slot-embed-starter build` 生成（产物在 `integrations/embed/assets/`），自托管在任意 HTTPS 静态位置。
- 模板文件位于 `templates/当前模板/`（.php 模板），可 FTP/SSH 编辑，也可后台在线编辑。

## patch

人类操作 / AI 引导站长操作：

1. 后台「外观 → 模板 → 编辑代码」（或直接 FTP 编辑 `templates/当前模板/`），打开目标页面模板（`index.php` 首页、`show.php` 内容页、`list.php` 列表页等），改动前先备份原文件。
2. 在公共头部模板加入脚本（整站只加一次）：

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

4. 后台「设置 → 清空缓存」使改动立即生效。
5. 端点只允许站长自己的 HTTPS 域名。

AI 执行（站长已授权且有 SSH/FTP 时）：直接编辑 `templates/当前模板/` 下模板文件，先 `cp` 备份；改后提示站长清空缓存。仅后台账号时可用浏览器自动化代为编辑。

## verify

AI 必须逐条执行并全部通过：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面含 `type="module"` 的 `ai-slot-embed.js` 脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络刷新页面：仍显示兜底内容，无白屏。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 恢复集成前备份的模板文件（或后台粘贴回原内容），清空缓存。
2. 回滚后页面与集成前完全一致。

## constraints

- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- MetInfo 模板为 PHP 文件，粘贴片段时注意不要插入到 `<?php ... ?>` 代码块内部。
- 商业模板可能加密或混淆模板文件：遇到无法编辑的模板文件时改走「后台 → 应用插件 → 自定义代码」类入口（如已安装），或联系模板作者。
