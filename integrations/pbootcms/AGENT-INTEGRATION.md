# PbootCMS 集成 recipe

适用：PbootCMS 3.x（PHP）自托管站点。无需插件，模板注入即可。

## detect

- 页面 HTML 含 `<meta name="generator" content="PbootCMS">`（置信度：高，官方默认模板有）
- 页脚含「Powered by PbootCMS」字样（置信度：中）
- 后台地址 `/admin.php`（置信度：中，部分站点改过入口名，询问站长即可）

## files

- 无需安装插件。嵌入脚本 `ai-slot-embed.js` 由 `pnpm --filter example-ai-slot-embed-starter build` 生成（产物在 `integrations/embed/assets/`），自托管在任意 HTTPS 静态位置。
- 模板文件位于 `template/当前风格/html/`（如设置了模板子目录则为 `template/当前风格/子目录名/`；子目录设置在后台「全局配置 → 配置参数 → 安全配置 → 模板子目录」查看）。需 FTP/SSH 编辑。

## patch

人类操作 / AI 引导站长操作：

1. 编辑 `template/当前风格/html/` 下目标模板（`index.html` 首页、`list.html` 列表页、`content.html` 内容页、`head.html` 公共头部），改动前先 `cp` 备份。
2. 在 `head.html`（或目标模板 `<head>`）加入脚本（整站只加一次）：

   ```html
   <script type="module" src="https://你的域名/ai-slot-embed.js"></script>
   ```

3. 在需要的位置插入槽位（同一页面同一 `name` 只放一处；模板中的 `{pboot:...}` 标签可正常共存）：

   ```html
   <ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only refresh-interval="60">
     <!-- 原始兜底内容：AI 不可用时页面保持原样 -->
     <h2>欢迎来到本站</h2>
   </ai-slot>
   ```

4. 保存后一般即时生效；如未生效，后台「系统管理 → 清理缓存」。
5. 端点只允许站长自己的 HTTPS 域名。

AI 执行（站长已授权且有 SSH/FTP 时）：直接编辑模板文件，先备份；改后按 verify 自检。

## verify

AI 必须逐条执行并全部通过：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面含 `type="module"` 的 `ai-slot-embed.js` 脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络刷新页面：仍显示兜底内容，无白屏。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 恢复集成前备份的模板文件，清理缓存。
2. 回滚后页面与集成前完全一致。

## constraints

- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- 模板子目录功能可能改变模板实际路径：verify 失败时先在「全局配置 → 配置参数 → 安全配置」确认「模板子目录」设置。
- PbootCMS 标签引擎只解析 `{pboot:...}` 标签，`<ai-slot>` 自定义元素会原样输出，无冲突。
