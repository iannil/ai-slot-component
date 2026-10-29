# PageAdmin 集成 recipe

适用：PageAdmin（ASP.NET，Windows/跨平台部署均可）自托管站点。无需插件，后台模板在线编辑即可。

## detect

- 页面 URL 以 `.aspx` 结尾（置信度：中，其他 .NET CMS 也有）
- 页面源码或页脚含「PageAdmin」字样（置信度：高）
- 后台地址以站点安装时设置为准（询问站长即可，勿探测）

## files

- 无需安装插件、无需服务器文件权限。嵌入脚本 `ai-slot-embed.js` 由 `pnpm --filter example-ai-slot-embed-starter build` 生成（产物在 `integrations/embed/assets/`），自托管在任意 HTTPS 静态位置。

## patch

人类操作 / AI 引导站长操作：

1. 后台「网站管理 → 模板管理」（新版为「视图/模板」入口），打开目标页面对应的模板，编辑前先复制原内容备份。
2. 在模板 `<head>` 或页面底部加入脚本（整站只加一次，建议加在母版/布局模板中）：

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

4. 保存后前台即时生效；如开启了页面缓存，在后台「系统 → 缓存管理」清空缓存。
5. 端点只允许站长自己的 HTTPS 域名。

AI 执行：PageAdmin 模板编辑在后台完成，纯命令行不可达；站长授权后台账号后，AI 可通过浏览器自动化代为编辑，或输出逐步指引由站长粘贴。改动前必须先备份原模板内容。

## verify

AI 必须逐条执行并全部通过：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面含 `type="module"` 的 `ai-slot-embed.js` 脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络刷新页面：仍显示兜底内容，无白屏。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 后台模板管理中恢复集成前备份的模板内容，清空缓存。
2. 回滚后页面与集成前完全一致。

## constraints

- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- PageAdmin 部分版本后台模板编辑器会过滤 `<script>` 标签：如遇此情况，把脚本标签放到「系统 → 站点设置 → 统计代码/第三方代码」输入框（该入口输出到页面底部且不过滤），槽位标记不受影响。
