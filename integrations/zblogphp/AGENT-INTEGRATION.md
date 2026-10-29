# Z-BlogPHP 集成 recipe

适用：Z-BlogPHP 1.7+ 自托管站点。插件源码见 `integrations/zblogphp/plugin/AiSlot/`。

## detect

- 页面 HTML 含 `<meta name="generator" content="Z-BlogPHP ...">`（置信度：高）
- 资产路径含 `/zb_users/` 或 `/zb_system/`（置信度：高）
- 后台地址 `/zb_system/admin/`（置信度：高，但勿探测客户后台，询问站长即可）

## files

- 插件安装：把 `integrations/zblogphp/plugin/AiSlot/` 整个目录复制到站点的 `zb_users/plugin/AiSlot/`（目录名必须恰好是 `AiSlot`）
- 插件依赖 `assets/ai-slot-embed.js`（由 `pnpm --filter example-ai-slot-embed-starter build` 生成并自动同步；缺失时先构建）
- `plugin.xml`、`logo.png` 为应用中心格式必需文件，勿删

## patch

人类操作 / AI 引导站长操作：

1. 复制插件目录后，后台「插件管理」启用 `ai-slot`。
2. 「插件管理 → ai-slot → 配置」填写默认交付端点（HTTPS），保存。
3. 在主题模板（如 `zb_users/theme/当前主题/template/index.php`、`single.php`）需要的位置插入（幂等：同一页面同一 `name` 只放一处）：

   ```
   {AiSlot_Slot('hero', '', '<h2>原始兜底内容</h2>')}
   ```

   或在 PHP 模板中直接 `echo AiSlot_Slot('hero', '', '<h2>原始兜底内容</h2>');`。参数：槽位标识、端点（空串用插件设置默认）、兜底 HTML、轮询秒数（-1 继承设置）、fresh-only（null 继承设置）。
4. 端点只允许站长自己的 HTTPS 域名（127.0.0.1/localhost 的 HTTP 仅限本机联调）。

AI 执行（站长已授权且有 SSH / 文件写入能力时）：

```sh
cp -r integrations/zblogphp/plugin/AiSlot <站点根目录>/zb_users/plugin/AiSlot
```

然后在主题模板中插入上述一行调用。插件启用与端点配置需在后台完成（Z-BlogPHP 无 CLI），AI 应给出逐步指引。

## verify

AI 必须逐条执行并全部通过：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面 `<head>` 含 `type="module"` 且指向 `/zb_users/plugin/AiSlot/assets/ai-slot-embed.js` 的脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络（或端点指向不可达地址）刷新页面：仍显示兜底内容，无白屏、无 PHP 报错。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 删除主题模板中插入的 `AiSlot_Slot(...)` 行，确认前台不再出现 `<ai-slot>`。
2. 后台停用插件，删除 `zb_users/plugin/AiSlot/` 目录；如需清配置，后台「网站设置 → 配置管理」删除 `AiSlot` 组。
3. 回滚后页面与集成前完全一致。

## constraints

- 需要 Z-BlogPHP ≥ 1.7（`plugin.xml` 的 `adapted` 为 172000）、PHP ≥ 7.2。
- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- 主题模板中的兜底 HTML 由主题作者控制，插件不转义它（与 Z-BlogPHP 模板惯例一致）；`name` 与 `src` 一律转义。
- 配置页使用 `GetVars` 读表单并先经 `AiSlot_ValidateSrc` 校验后才入库；无 `eval`、无 `echo $_GET/$_POST` 直接输出。
- 本插件只做过静态契约校验（仓库 `integrations/embed/blog-trio.test.mjs`），未在真实 Z-BlogPHP 运行时验证；首次部署请先在测试站启用。
