=== ai-slot ===
Contributors: ai-slot
Tags: ai, content, slot, block, elementor
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

把存量页面区域变成 AI 内容的安全上线通道。AI 返回结构化组件树（绝不返回 HTML），校验通过后渲染为真实组件；失败、超时或校验不过时静默回退原始内容。

== Description ==

ai-slot 是「存量页面的 AI 内容交付层」：

* AI 从不输出 HTML：只输出结构化组件树 JSON，组件名必须存在于注册表中。
* 渐进增强：`<ai-slot>` 内部永远保留原始兜底内容，AI 失败/超时/校验失败时页面退化为普通网页（SEO 与无障碍不受影响）。
* 内置 5 个起步组件：hero-banner、markdown-block、info-card、cta-banner、feature-list。AI 文本一律以 textContent 写入，链接仅允许 http/https。
* 支持 Gutenberg 区块、简码 `[ai_slot]`、Elementor 小组件三种插入方式。

隐私说明：本插件向站长自行配置的「交付端点」发起内容请求，不收集访客数据，不连接任何第三方服务。交付端点由站长在设置页或区块属性中显式配置。

== Installation ==

1. 上传 `ai-slot` 目录到 `/wp-content/plugins/`，或在后台「插件 → 安装插件」中搜索安装。
2. 启用插件。
3. 在「设置 → ai-slot」填写默认交付端点（可选）。
4. 在页面中添加「ai-slot 槽位」区块、简码或 Elementor 小组件。

== Frequently Asked Questions ==

= 没有交付端点能用吗？ =

不能。ai-slot 是内容通道，需要一个返回组件树 JSON 的交付服务。未配置端点时，页面原样显示兜底内容，与不装插件行为一致。

= AI 服务挂了会怎样？ =

页面保留原始兜底内容，不白屏、不报错给访客。

== Changelog ==

= 0.1.0 =
* 首个版本：Gutenberg 区块、简码、Elementor 小组件、设置页。
