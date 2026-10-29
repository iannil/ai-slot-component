# Squarespace 集成 recipe

适用：Squarespace 7.1 托管站点。

## detect

- 页面 HTML 含 `<!-- This is Squarespace. -->` 注释（置信度：高）
- 资产/脚本域名含 `squarespace.com`、`sqspcdn.com`、`static1.squarespace.com`（置信度：高）
- `<html>` 含 `squarespace` 相关 class（置信度：中）

## files

无文件系统访问。后台操作路径：

- 页面内嵌入：编辑器中添加 **Code Block**（代码块）
- 全站脚本注入：「Settings → Advanced → Code Injection」（设置 → 高级 → 代码注入）

## patch

1. 把 `ai-slot-embed.js` 放到 HTTPS 可公开访问的位置（构建：`pnpm --filter example-ai-slot-embed-starter build`）。
2. 全站脚本：「Settings → Advanced → Code Injection → Header」粘贴（幂等：确认未重复添加）：

   ```html
   <script type="module" src="https://你的域名/ai-slot-embed.js"></script>
   ```

3. 目标页面添加 Code Block，取消勾选「Display Source Code」，粘贴：

   ```html
   <ai-slot name="hero" src="https://delivery.example/ai-render/hero" fresh-only refresh-interval="60">
     <h2>原始兜底内容</h2>
   </ai-slot>
   ```

4. `src` 只允许站长自己的 HTTPS 交付端点。

## verify

AI 必须逐条执行并全部通过：

1. 访问页面，控制台执行 `document.querySelector('ai-slot') !== null` 返回 `true`。
2. `document.querySelector('ai-slot').textContent` 初始包含原始兜底文本。
3. 交付端点正常时：`document.querySelector('ai-slot .ai-slot-hero-title')` 出现（或对应组件 class）。
4. 交付端点 503 时：仍显示兜底内容，无白屏。
5. Code Block 在编辑模式下显示占位符，**必须在退出编辑模式的访客视图验证**。

## rollback

1. 删除页面中的 Code Block。
2. 删除 Code Injection 中的脚本标签，保存。

## constraints

- **Code Block 与 Code Injection 均需 Business 及以上套餐**（Personal 档不可用）。
- Squarespace 默认对 Code Block 内容不做服务端渲染，SEO 抓取的是兜底 HTML——符合渐进增强预期。
- 部分模板启用了 Ajax 页面切换（Ajax loading），自定义元素会在导航后重新挂载并重新拉取，属预期行为；如出现重复脚本加载提示，可在模板设置中关闭 Ajax loading。
- Code Injection 的 Header 区域会被全站所有页面共享：只打算在单页使用时，把脚本标签与 `<ai-slot>` 一起放进该页的 Code Block。
