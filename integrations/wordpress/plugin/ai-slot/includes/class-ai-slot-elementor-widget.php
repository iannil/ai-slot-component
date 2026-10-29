<?php
/**
 * Elementor 小组件：ai-slot 槽位。
 * 仅在 Elementor 已加载时由 ai-slot.php 引入并注册。
 */

if (!defined('ABSPATH')) {
    exit;
}

class AI_Slot_Elementor_Widget extends \Elementor\Widget_Base {

    public function get_name(): string {
        return 'ai-slot';
    }

    public function get_title(): string {
        return 'ai-slot 槽位';
    }

    public function get_icon(): string {
        return 'eicon-code';
    }

    public function get_categories(): array {
        return ['general'];
    }

    protected function register_controls(): void {
        $this->start_controls_section('content_section', [
            'label' => '槽位设置',
            'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('name', [
            'label'   => '槽位标识',
            'type'    => \Elementor\Controls_Manager::TEXT,
            'default' => 'hero',
        ]);

        $this->add_control('src', [
            'label'       => '交付端点（HTTPS，留空用插件默认值）',
            'type'        => \Elementor\Controls_Manager::TEXT,
            'placeholder' => 'https://delivery.example/ai-render/hero',
            'default'     => '',
        ]);

        $this->add_control('fallback', [
            'label'   => '原始兜底内容（AI 不可用时显示）',
            'type'    => \Elementor\Controls_Manager::TEXTAREA,
            'rows'    => 3,
            'default' => '',
        ]);

        $this->add_control('refresh_interval', [
            'label'   => '轮询间隔（秒，-1 继承默认，0 不轮询）',
            'type'    => \Elementor\Controls_Manager::NUMBER,
            'default' => -1,
        ]);

        $this->add_control('fresh_only', [
            'label'        => 'fresh-only（失败时回退原始内容）',
            'type'         => \Elementor\Controls_Manager::SWITCHER,
            'label_on'     => '开',
            'label_off'    => '关',
            'return_value' => 'yes',
            'default'      => 'yes',
        ]);

        $this->end_controls_section();
    }

    protected function render(): void {
        $settings = $this->get_settings_for_display();
        // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- ai_slot_render() 内部对所有属性与内容统一完成转义（esc_attr/esc_url/wp_kses_post），并输出 <ai-slot> 自定义元素，不能再经 wp_kses 过滤。
        echo ai_slot_render([
            'name'             => $settings['name'] ?? 'hero',
            'src'              => $settings['src'] ?? '',
            'fallback'         => $settings['fallback'] ?? '',
            'refresh_interval' => isset($settings['refresh_interval']) ? (int) $settings['refresh_interval'] : -1,
            'fresh_only'       => !isset($settings['fresh_only']) || $settings['fresh_only'] === 'yes',
        ]);
    }
}
