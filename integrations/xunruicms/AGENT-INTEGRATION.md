# 迅睿 CMS（XunRuiCMS）集成 recipe

适用：XunRuiCMS 4.x（PHP / CodeIgniter）自托管站点。无需插件，模板注入即可。

## detect

- 页面 HTML 含 `<meta name="generator" content="XunRuiCMS ...">`（置信度：高）
- 页面源码或页脚含「迅睿」「dayrui」字样（置信度：中）
- 后台地址 `/admin.php`（置信度：中，可自定义，询问站长即可）

## files

- 无需安装插件。嵌入脚本 `ai-slot-embed.js` 由 `pnpm --filter example-ai-slot-embed-starter build` 生成（产物在 `integrations/embed/assets/`），自托管在任意 HTTPS 静态位置。
- 模板文件位于 `template/pc/当前目录/home/`（移动端 `template/mobile/当前目录/home/`；当前目录名以后台「设置 → 网站设置 → 模板风格」为准，默认为 `default`）。需 FTP/SSH 编辑。

## patch

人类操作 / AI 引导站长操作：

1. 编辑 `template/pc/当前目录/home/` 下目标模板（`index.html` 首页、`category.html`/`list.html` 列表页、`show.html` 内容页等），改动前先 `cp` 备份。
2. 在公共头部模板加入脚本（整站只加一次）：

   ```html
   <script type="module" src="https://你的域名/ai-slot-embed.js"></script>
   ```

3. 在需要的位置插入槽位（同一页面同一 `name` 只放一处；迅睿模板标签 `{...}` 可正常共存）：

   ```html
   <ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only refresh-interval="60">
     <!-- 原始兜底内容：AI 不可用时页面保持原样 -->
     <h2>欢迎来到本站</h2>
   </ai-slot>
   ```

4. 后台「更新缓存」后生效（迅睿模板有编译缓存，必须更新）。
5. 端点只允许站长自己的 HTTPS 域名。

AI 执行（站长已授权且有 SSH/FTP 时）：直接编辑模板文件，先备份；改后提示站长在后台点「更新缓存」（或 AI 用浏览器自动化代为点击）。缓存未更新前 verify 不会通过，属预期行为。

## verify

AI 必须逐条执行并全部通过（执行前先确认已「更新缓存」）：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面含 `type="module"` 的 `ai-slot-embed.js` 脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络刷新页面：仍显示兜底内容，无白屏。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 恢复集成前备份的模板文件，后台「更新缓存」。
2. 回滚后页面与集成前完全一致。

## constraints

- 模板有编译缓存：改模板后必须在后台「更新缓存」，否则前台不变。
- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- 移动端站点需在 `template/mobile/当前目录/home/` 同步插入；未配置移动端模板时系统自动复用 PC 模板，无需重复操作。
- 迅睿模板引擎只解析 `{...}` 标签，`<ai-slot>` 自定义元素会原样输出，无冲突。
