<?php
/**
 * Plugin Name:       ai-slot
 * Plugin URI:        https://github.com/ai-slot/ai-slot-component
 * Description:       把存量页面区域变成 AI 内容的安全上线通道：AI 返回结构化组件树，校验通过后渲染为真实组件；失败、超时或校验不过时静默回退原始内容。
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            ai-slot
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       ai-slot
 */

if (!defined('ABSPATH')) {
    exit;
}

define('AI_SLOT_VERSION', '0.1.0');

/* -------------------------------------------------------------------------
 * 设置
 * ---------------------------------------------------------------------- */

function ai_slot_defaults(): array {
    return [
        'default_src'      => '',
        'refresh_interval' => 60,
        'fresh_only'       => 1,
    ];
}

function ai_slot_options(): array {
    $stored = get_option('ai_slot_options', []);
    return wp_parse_args(is_array($stored) ? $stored : [], ai_slot_defaults());
}

/** 交付端点必须是 HTTPS；仅放行 127.0.0.1/localhost 的 HTTP 用于本机联调。 */
function ai_slot_validate_src($url): string {
    if (!is_string($url) || $url === '') {
        return '';
    }
    $scheme = wp_parse_url($url, PHP_URL_SCHEME);
    if ($scheme === 'https') {
        return $url;
    }
    if ($scheme === 'http' && preg_match('#^http://(127\.0\.0\.1|localhost)(:\d+)?/#', $url)) {
        return $url;
    }
    return '';
}

function ai_slot_sanitize_options($input): array {
    $input    = is_array($input) ? $input : [];
    $defaults = ai_slot_defaults();
    return [
        'default_src'      => ai_slot_validate_src(trim((string) ($input['default_src'] ?? ''))),
        'refresh_interval' => min(86400, max(0, absint($input['refresh_interval'] ?? $defaults['refresh_interval']))),
        'fresh_only'       => empty($input['fresh_only']) ? 0 : 1,
    ];
}

add_action('admin_init', function () {
    register_setting('ai_slot', 'ai_slot_options', ['sanitize_callback' => 'ai_slot_sanitize_options']);
});

add_action('admin_menu', function () {
    add_options_page('ai-slot', 'ai-slot', 'manage_options', 'ai-slot', 'ai_slot_settings_page');
});

function ai_slot_settings_page(): void {
    if (!current_user_can('manage_options')) {
        return;
    }
    $opts = ai_slot_options();
    ?>
    <div class="wrap">
        <h1>ai-slot</h1>
        <p>把页面中的指定区域交给 AI 内容通道。AI 返回结构化组件树（绝不返回 HTML），校验通过后渲染；失败、超时或校验不过时静默回退原始内容。</p>
        <form method="post" action="options.php">
            <?php settings_fields('ai_slot'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="ai-slot-default-src">默认交付端点</label></th>
                    <td>
                        <input type="url" class="regular-text" id="ai-slot-default-src"
                               name="ai_slot_options[default_src]"
                               value="<?php echo esc_attr($opts['default_src']); ?>"
                               placeholder="https://delivery.example/ai-render/hero">
                        <p class="description">必须是 HTTPS。简码、区块或小组件未填写端点时使用此处。</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="ai-slot-refresh">默认轮询间隔（秒）</label></th>
                    <td>
                        <input type="number" min="0" max="86400" id="ai-slot-refresh"
                               name="ai_slot_options[refresh_interval]"
                               value="<?php echo esc_attr((string) $opts['refresh_interval']); ?>">
                        <p class="description">0 表示不轮询。</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">fresh-only</th>
                    <td>
                        <label><input type="checkbox" name="ai_slot_options[fresh_only]" value="1" <?php checked(1, (int) $opts['fresh_only']); ?>>
                        内容过期或拉取失败时回退到原始内容（推荐开启）</label>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <h2>使用方法</h2>
        <p>简码：<code>[ai_slot name="hero" src="https://delivery.example/ai-render/hero"]原始兜底内容[/ai_slot]</code></p>
        <p>区块编辑器：添加「ai-slot 槽位」区块；Elementor：添加「ai-slot 槽位」小组件。</p>
    </div>
    <?php
}

/* -------------------------------------------------------------------------
 * 渲染
 * ---------------------------------------------------------------------- */

add_action('wp_enqueue_scripts', function () {
    wp_register_script('ai-slot-embed', plugins_url('assets/ai-slot-embed.js', __FILE__), [], AI_SLOT_VERSION, true);
});

add_filter('script_loader_tag', function ($tag, $handle) {
    return $handle === 'ai-slot-embed' ? str_replace('<script ', '<script type="module" ', $tag) : $tag;
}, 10, 2);

/**
 * 统一的槽位标记输出。$args:
 *   name           槽位标识（sanitize_key）
 *   src            交付端点（HTTPS；空则用设置页默认）
 *   fallback       原始兜底 HTML（wp_kses_post 过滤）
 *   refresh_interval  <0 表示继承设置页默认；0 表示不轮询
 *   fresh_only     null 表示继承设置页默认
 */
function ai_slot_render(array $args): string {
    $opts = ai_slot_options();

    $src = ai_slot_validate_src($args['src'] ?? '');
    if ($src === '') {
        $src = ai_slot_validate_src($opts['default_src']);
    }

    $name     = sanitize_key($args['name'] ?? 'hero');
    $fallback = wp_kses_post($args['fallback'] ?? '');

    if ($src === '' || $name === '') {
        // 未配置端点时原样输出兜底内容，页面行为与不装插件一致
        return $fallback;
    }

    $refresh = isset($args['refresh_interval']) ? (int) $args['refresh_interval'] : -1;
    if ($refresh < 0) {
        $refresh = (int) $opts['refresh_interval'];
    }
    $fresh = array_key_exists('fresh_only', $args) && $args['fresh_only'] !== null
        ? (bool) $args['fresh_only']
        : (bool) $opts['fresh_only'];

    $attrs = 'name="' . esc_attr($name) . '" src="' . esc_url($src) . '"';
    if ($fresh) {
        $attrs .= ' fresh-only';
    }
    if ($refresh > 0) {
        $attrs .= ' refresh-interval="' . esc_attr((string) $refresh) . '"';
    }

    wp_enqueue_script('ai-slot-embed');
    return '<ai-slot ' . $attrs . '>' . $fallback . '</ai-slot>';
}

/* -------------------------------------------------------------------------
 * 简码：[ai_slot name="hero" src="…"]兜底内容[/ai_slot]
 * ---------------------------------------------------------------------- */

add_shortcode('ai_slot', function ($atts, $content = '') {
    $atts = shortcode_atts(
        ['name' => 'hero', 'src' => '', 'refresh' => -1, 'fresh_only' => null],
        is_array($atts) ? $atts : [],
        'ai_slot'
    );
    return ai_slot_render([
        'name'             => $atts['name'],
        'src'              => $atts['src'],
        'fallback'         => $content,
        'refresh_interval' => (int) $atts['refresh'],
        'fresh_only'       => $atts['fresh_only'] === null
            ? null
            : filter_var($atts['fresh_only'], FILTER_VALIDATE_BOOLEAN),
    ]);
});

/* -------------------------------------------------------------------------
 * Gutenberg 区块（动态区块，前台由 PHP 渲染，与简码共用同一出口）
 * ---------------------------------------------------------------------- */

add_action('init', function () {
    register_block_type(__DIR__ . '/block', [
        'render_callback' => function ($attributes) {
            $attributes = is_array($attributes) ? $attributes : [];
            return ai_slot_render([
                'name'             => $attributes['name'] ?? 'hero',
                'src'              => $attributes['src'] ?? '',
                'fallback'         => $attributes['fallback'] ?? '',
                'refresh_interval' => isset($attributes['refreshInterval']) ? (int) $attributes['refreshInterval'] : -1,
                'fresh_only'       => array_key_exists('freshOnly', $attributes) ? (bool) $attributes['freshOnly'] : null,
            ]);
        },
    ]);
});

/* -------------------------------------------------------------------------
 * Elementor 小组件（仅在 Elementor 已加载时注册）
 * ---------------------------------------------------------------------- */

add_action('elementor/widgets/register', function ($widgets_manager) {
    if (!class_exists('\Elementor\Widget_Base')) {
        return;
    }
    require_once __DIR__ . '/includes/class-ai-slot-elementor-widget.php';
    $widgets_manager->register(new \AI_Slot_Elementor_Widget());
});
