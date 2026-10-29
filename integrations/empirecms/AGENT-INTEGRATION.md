# 帝国 CMS（EmpireCMS）集成 recipe

适用：帝国 CMS 7.x 自托管站点。无需插件，模板注入即可。

## detect

- 页面源码或链接含 `/e/action/`、`/e/data/` 路径（置信度：高）
- 页脚或源码含「帝国 CMS」「EmpireCMS」字样（置信度：中）
- 后台地址 `/e/admin/`（置信度：高，但勿探测客户后台，询问站长即可）

## files

- 无需安装插件。嵌入脚本 `ai-slot-embed.js` 由 `pnpm --filter example-ai-slot-embed-starter build` 生成（产物在 `integrations/embed/assets/`），自托管在任意 HTTPS 静态位置。
- 帝国 CMS 模板存储在数据库中，通过后台在线编辑，无需 FTP。

## patch

人类操作 / AI 引导站长操作：

1. 后台「模板 → 模板管理」，选择要改造页面的模板（首页模板 / 封面模板 / 列表页模板 / 内容页模板），编辑前先复制原内容备份。
2. 在公共头部模板变量（或目标模板 `<head>`）加入脚本（整站只加一次）：

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

4. 端点只允许站长自己的 HTTPS 域名。

AI 执行：帝国 CMS 模板在数据库中，纯命令行不可达；站长授权后台账号后，AI 可通过浏览器自动化代为编辑，或输出逐步指引由站长粘贴。改动前必须先把原模板内容存为备份文件。

## verify

AI 必须逐条执行并全部通过：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面含 `type="module"` 的 `ai-slot-embed.js` 脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络刷新页面：仍显示兜底内容，无白屏。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 后台模板管理中恢复集成前备份的模板内容。
2. 回滚后页面与集成前完全一致。

## constraints

- 模板存数据库：任何「改文件」的自动化都不会生效，必须走后台或数据库。
- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- 帝国 CMS 默认页面为动态访问，槽位标记随页面输出即可；若站点额外做了整页静态化/外部 CDN 缓存，改动后需刷新对应缓存。
