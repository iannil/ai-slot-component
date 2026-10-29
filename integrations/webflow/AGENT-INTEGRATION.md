# Webflow 集成 recipe

适用：Webflow 托管站点（含导出自托管的 Webflow 站点——后者直接按静态站处理，更简单）。

## detect

- 页面 HTML 含 `<meta name="generator" content="Webflow">`（置信度：高）
- 资产域名含 `assets.website-files.com` 或 `webflow.com`，body 含 `w-` 前缀 class（置信度：高）
- 脚本含 `webflow.js` / `webflow.*.js`（置信度：高）

## files

- 页面内嵌入：Designer 中「Add Elements → Embed」（嵌入元素）
- 全站/单页脚本：「Site settings → Custom code → Head code」或「Page settings → Custom Code」
- 导出自托管：直接编辑导出的 HTML 文件

## patch

1. 把 `ai-slot-embed.js` 放到 HTTPS 可公开访问的位置（构建：`pnpm --filter example-ai-slot-embed-starter build`）。
2. 单页方案（推荐）：目标页面「Page settings → Custom Code → Inside <head> tag」粘贴：

   ```html
   <script type="module" src="https://你的域名/ai-slot-embed.js"></script>
   ```

3. Designer 中在目标位置拖入 **Embed** 元素，粘贴（幂等：同一页面同一 `name` 只放一个）：

   ```html
   <ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only refresh-interval="60">
     <h2>原始兜底内容</h2>
   </ai-slot>
   ```

4. 发布站点。

## verify

AI 必须逐条执行并全部通过：

1. 发布后访问页面，控制台 `document.querySelector('ai-slot') !== null` 返回 `true`，且初始文本含兜底内容。
2. `customElements.get('ai-slot')` 返回函数。
3. 交付端点正常时槽位区域渲染出起步组件（如 `.ai-slot-hero-title`）。
4. 交付端点不可达时：仍显示兜底内容，无白屏。
5. 交付端点返回伪造组件名（如 `{"component":"script-tag"}`）时：校验不通过，静默回退兜底，不渲染任何 AI 输出。
6. Embed 元素在 Designer 画布中不执行脚本，**必须在已发布站点验证**。

## rollback

1. 删除 Designer 中的 Embed 元素与 Page settings 中的脚本标签，重新发布。

## constraints

- **Embed 元素与 Custom Code 均需付费站点计划**（免费 Starter 计划不可用）。
- 单页 Embed 代码有字符数上限（约 5 万字符），本片段远低于上限。
- Webflow 交互（Interactions）不感知自定义元素内部变化；如需入场动画，把动画绑在 `<ai-slot>` 元素本身而非其内部节点。
- 若站点是「导出后自托管」模式，无需付费计划，直接把片段写进 HTML 文件即可。
