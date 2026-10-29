=== ai-slot ===
Contributors: ai-slot
Tags: ai, content, slot, block, elementor
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Safe AI content delivery for existing pages: validated component trees, never HTML, with silent fallback to original content.

== Description ==

ai-slot is an AI content delivery layer for existing pages:

* AI never outputs HTML: it returns structured component-tree JSON, and component names must exist in the developer-declared registry.
* Progressive enhancement: the `<ai-slot>` element always keeps its original fallback content. If AI fails, times out or fails validation, the page degrades to a normal web page (SEO and accessibility unaffected).
* Five starter components included: hero-banner, markdown-block, info-card, cta-banner, feature-list. AI text is written via textContent only; links are restricted to http/https.
* Three insertion methods: Gutenberg block, shortcode `[ai_slot]`, and an Elementor widget.

Privacy: this plugin requests content only from the delivery endpoint explicitly configured by the site owner. It collects no visitor data and connects to no third-party service.

== Installation ==

1. Upload the `ai-slot` directory to `/wp-content/plugins/`, or install via Plugins → Add New.
2. Activate the plugin.
3. Optionally set the default delivery endpoint under Settings → ai-slot.
4. Add the "ai-slot slot" block, the `[ai_slot]` shortcode, or the Elementor widget to a page.

== Frequently Asked Questions ==

= Does it work without a delivery endpoint? =

No. ai-slot is a delivery channel and needs a service that returns component-tree JSON. Without an endpoint configured, the page simply shows the fallback content, identical to not having the plugin installed.

= What happens if the AI service is down? =

The page keeps the original fallback content. No blank areas, no errors shown to visitors.

== Changelog ==

= 0.1.0 =
* Initial release: Gutenberg block, shortcode, Elementor widget, settings page.
