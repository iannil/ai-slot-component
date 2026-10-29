# Discuz! 集成 recipe

适用：Discuz! X3.x 论坛站点。两条集成路径：免改代码的广告位路径（推荐）与模板注入路径。

## detect

- 页面 HTML 含 `<meta name="generator" content="Discuz! X...">`（置信度：高）
- 页面 URL 含 `forum.php`、`thread-`、`forum-`（置信度：高）
- 页面 Cookie 名前缀为站点自定义的 Discuz! 前缀（置信度：中）
- 后台地址 `/admin.php`（置信度：高，但勿探测客户后台，询问站长即可）

## files

- 无需安装插件。嵌入脚本 `ai-slot-embed.js` 由 `pnpm --filter example-ai-slot-embed-starter build` 生成（产物在 `integrations/embed/assets/`），自托管在任意 HTTPS 静态位置。
- 模板文件位于 `template/当前风格/`（默认 `template/default/`），需 FTP/SSH 编辑；广告位路径无需文件权限。

## patch

**路径 A（推荐，免改代码）——广告位注入：**

1. 后台「运营 → 广告 → 添加广告」，选择投放位置（如「页头通栏广告」「页尾通栏广告」或具体版块的帖间广告位），类型选「代码」。
2. 在广告代码框粘贴（脚本整站只需一次，可放进页尾广告位）：

   ```html
   <script type="module" src="https://你的域名/ai-slot-embed.js"></script>

   <ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only refresh-interval="60">
     <!-- 原始兜底内容：AI 不可用时页面保持原样 -->
     <h2>欢迎来到本站</h2>
   </ai-slot>
   ```

3. 提交后前台即时生效（如未生效，后台「工具 → 更新缓存」）。

**路径 B——模板注入（广告位位置不满足需求时）：**

1. FTP/SSH 编辑 `template/当前风格/` 下模板（公共头部 `common/header.htm`、首页 `forum/discuz.htm`、帖子页 `forum/viewthread.htm` 等），先 `cp` 备份；也可后台「界面 → 模板管理」在线编辑。
2. 插入与路径 A 相同的脚本与槽位片段。
3. 后台「工具 → 更新缓存」后生效。

AI 执行：路径 A 站长授权后台账号后 AI 可用浏览器自动化代为配置；路径 B 有 SSH/FTP 时 AI 直接改模板（先备份）并提示更新缓存。

## verify

AI 必须逐条执行并全部通过：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面含 `type="module"` 的 `ai-slot-embed.js` 脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络刷新页面：仍显示兜底内容，无白屏。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

- 路径 A：后台「运营 → 广告」删除对应广告。
- 路径 B：恢复集成前备份的模板文件，后台「工具 → 更新缓存」。
- 回滚后页面与集成前完全一致。

## constraints

- 广告位只能出现在 Discuz! 预定义的位置（页头/页尾/帖间等）；需要任意位置时走路径 B。
- Discuz! 广告「代码」类型原样输出 HTML，不会被转义；但请勿在广告代码中放任何未授权第三方脚本。
- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- 部分站长开启了 `forum.php` 静态化或外部页面缓存：改后需刷新对应缓存。
