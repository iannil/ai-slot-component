# Halo 集成 recipe

适用：Halo 2.x（Java/Spring Boot 建站程序）。

> 说明：Halo 的正式插件需要 Java/Gradle 工具链与独立发布流程，成本与其他平台不成比例，本仓库**暂不提供 Halo Java 插件**（YAGNI，待有真实用户需求再排期）。Halo 主题基于 FreeMarker/Thymeleaf 模板，直接粘贴通用嵌入片段即可完整获得 ai-slot 能力，无需插件。

## detect

- 页面 HTML 含 `<meta name="generator" content="Halo ...">`（置信度：高）
- 静态资源路径含 `/themes/` 或 `/upload/`、API 路径含 `/api/` 或 `/apis/`（置信度：中）
- 后台地址 `/console/`（置信度：高，但勿探测客户后台，询问站长即可）

## files

- 无需安装插件。嵌入脚本 `ai-slot-embed.js` 由 `pnpm --filter example-ai-slot-embed-starter build` 生成（产物在 `integrations/embed/assets/`），自托管在任意 HTTPS 静态位置（站长自己的 CDN / 对象存储 / Halo 附件均可）。

## patch

人类操作 / AI 引导站长操作：

1. 后台「外观 → 主题 → 编辑代码」（或自定义主题源码）打开要改造的模板，如 `templates/index.html`、`templates/post.html`。
2. 在 `<head>` 或页面底部加入脚本（幂等：整站只加一次，建议放在公共布局模板 `templates/layout/` 下）：

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

AI 执行（站长已授权且可改主题源码时）：AI 直接编辑主题模板文件插入上述两段代码；改动前先 `cp` 备份模板，改后按下方 verify 自检。

## verify

AI 必须逐条执行并全部通过：

1. 前台页面源码包含 `<ai-slot name="hero"` 且标签内保留原始兜底文本：`curl -s <页面URL> | grep -o '<ai-slot[^>]*>'`。
2. 页面含 `type="module"` 的 `ai-slot-embed.js` 脚本标签。
3. 浏览器控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
4. 停用网络（或端点指向不可达地址）刷新页面：仍显示兜底内容，无白屏。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：页面仍显示兜底内容。

## rollback

1. 删除模板中插入的 `<ai-slot>` 片段与脚本标签（用集成前的备份直接恢复亦可）。
2. 回滚后页面与集成前完全一致。

## constraints

- 需要 Halo 2.x 主题支持自定义模板编辑（官方与绝大多数第三方主题均支持）。
- 交付端点必须支持 CORS（允许站点源）；页面 CSP 需允许脚本来源与交付域的 `connect-src`。
- Halo 部分主题带全站缓存/静态化插件：槽位标记可缓存（内容是浏览器端拉取），无需排除。
- 若未来需要 Java 插件形态（设置页、后台配置注入），将另起交付，不在本 recipe 范围内。
