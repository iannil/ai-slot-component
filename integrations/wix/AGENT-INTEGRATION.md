# Wix 集成 recipe

适用：Wix 托管站点。`<ai-slot>` 是标准 Web Component，与 Wix 的 Custom Element 功能天然兼容。

## detect

- 页面 HTML 含 `<meta name="generator" content="Wix.com Website Builder">`（置信度：高）
- 页面脚本/资产域名含 `wixstatic.com`、`parastorage.com`（置信度：高）
- `<html>` 或 body 上含 `wix-` 前缀的 class / data 属性（置信度：中）

## files

无文件系统访问。后台操作路径：

- 全站嵌入脚本：后台「Settings → Custom Code」（设置 → 自定义代码）
- 页面内槽位：编辑器「Add Elements (+) → Embed Code → Custom Element」（添加元素 → 嵌入代码 → 自定义元素）

## patch

1. 先把 `ai-slot-embed.js` 放到一个 HTTPS 可公开访问的位置（站长自己的静态托管 / CDN）。构建：`pnpm --filter example-ai-slot-embed-starter build`，产物 `integrations/embed/assets/ai-slot-embed.js`。
2. 在 Wix 编辑器目标页面：Add Elements → Embed Code → **Custom Element**。
3. 在该元素的设置中：
   - Server URL / 脚本地址填 `https://你的域名/ai-slot-embed.js`；
   - Tag name 填 `ai-slot`；
   - Attributes 添加 `name=hero`、`src=https://delivery.example/ai-render/hero`、`fresh-only`、`refresh-interval=60`。
4. 幂等检查：同一页面只放置一个同名 `ai-slot` 元素。

## verify

AI 必须逐条执行并全部通过：

1. 发布后访问页面，浏览器控制台执行 `customElements.get('ai-slot')` 返回函数（元素已定义）。
2. `document.querySelector('ai-slot')?.getAttribute('src')` 返回配置的交付端点。
3. 交付端点不可达时：页面其余内容正常显示，槽位区域为空或保留占位，无白屏、无整页报错。
4. 注意：Wix 编辑器内预览不一定加载自定义元素脚本，**必须在已发布站点上验证**。

## rollback

1. 在编辑器中删除该 Custom Element，重新发布。
2. 若在「Custom Code」加过全站脚本，一并删除。

## constraints

- **Custom Element 需要 Wix 付费套餐**（免费档不可用）；「Custom Code」同样需要付费套餐且部分档位仅限 head 区域。
- Wix 的 Custom Element 在编辑器预览中不执行，只能在发布后的站点验证。
- Wix 页面由 React 驱动，路由切换（SPA 导航）时自定义元素可能被卸载重建；`ai-slot` 元素重挂载时会重新拉取，属预期行为。
- 兜底内容写在 Custom Element 内部的能力受 Wix 界面限制：若界面不支持子节点，兜底内容放在槽位元素旁边的静态元素中，由站长接受此折衷（未实测项以实测为准，并在本文件更新）。
