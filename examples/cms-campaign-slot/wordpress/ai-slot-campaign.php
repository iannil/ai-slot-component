<?php
/**
 * Plugin Name: AI-SLOT Campaign Reference
 * Description: 已批准公开活动事实的只读参考接入。
 * Version: 0.1.0
 */

// 这是参考站的公开事实端点；批准 AI 草稿仍由独立的管理服务完成。
add_action('rest_api_init', function () {
    register_rest_route('ai-slot/v1', '/campaign/(?P<id>\d+)', [
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => function ($request) {
            $post = get_post((int) $request['id']);
            if (!$post || $post->post_type !== 'page' || $post->post_status !== 'publish' || !empty($post->post_password)) {
                return new WP_Error('not_found', 'Not found', ['status' => 404]);
            }
            $facts = get_post_meta($post->ID, '_ai_slot_campaign', true);
            if (!is_array($facts) || ($facts['approved'] ?? null) !== true) {
                return new WP_Error('not_found', 'Not found', ['status' => 404]);
            }
            $value = [
                'id' => 'campaign-' . $post->ID,
                'title' => (string) ($facts['title'] ?? ''),
                'price' => (string) ($facts['price'] ?? ''),
                'link' => (string) ($facts['link'] ?? ''),
                'expiresAt' => (float) ($facts['expiresAt'] ?? 0),
            ];
            $response = new WP_REST_Response($value, 200);
            $response->header('Cache-Control', 'no-store');
            return $response;
        },
    ]);
});

// 运营页面只放公开 HTTPS URL；管理令牌与事实读取均不进入页面。
add_shortcode('ai_slot_campaign', function ($attrs) {
    $a = shortcode_atts(['endpoint' => '', 'registry' => ''], $attrs);
    foreach (['endpoint', 'registry'] as $key) {
        if (wp_parse_url($a[$key], PHP_URL_SCHEME) !== 'https') {
            return '<p>产品介绍暂不可用。</p>';
        }
    }
    wp_enqueue_script('ai-slot-reference', plugins_url('assets/ai-slot.js', __FILE__), [], null, true);
    return '<div data-ai-slot-endpoint="' . esc_url($a['endpoint']) . '" data-ai-slot-registry="' . esc_url($a['registry']) . '"><h2>产品介绍暂不可用，请查看原站信息。</h2></div>';
});
add_filter('script_loader_tag', function ($tag, $handle) {
    return $handle === 'ai-slot-reference' ? str_replace('<script ', '<script type="module" ', $tag) : $tag;
}, 10, 2);
