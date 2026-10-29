<?php
/**
 * ai-slot：把存量页面区域变成 AI 内容的安全上线通道。
 * AI 返回结构化组件树 JSON（绝不返回 HTML），校验通过后渲染为真实组件；
 * 失败、超时或校验不过时静默回退原始内容。
 *
 * @package AiSlot
 * @author ai-slot
 * @version 0.1.0
 * @link https://github.com/iannil/ai-slot-component
 *
 * 目录约定：usr/plugins/AiSlot/Plugin.php（类名 AiSlot_Plugin 与目录名一致）。
 * 兼容 Typecho 1.1+（旧式类名与 Typecho_Plugin API 在 1.x 全系可用）。
 */

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

class AiSlot_Plugin implements Typecho_Plugin_Interface
{
    const VERSION = '0.1.0';

    /**
     * 启用插件：挂载头部输出钩子，用于加载嵌入脚本。
     * 注意：不依赖 contentEx 钩子（1.3 在部分主题下不触发），
     * 槽位插入由主题模板显式调用 AiSlot_Plugin::slot() 完成。
     */
    public static function activate()
    {
        Typecho_Plugin::factory('Widget_Archive')->header = __CLASS__ . '::renderHeader';
        return _t('ai-slot 已启用：请在插件设置中填写交付端点，并在主题模板中调用 AiSlot_Plugin::slot()');
    }

    public static function deactivate()
    {
    }

    /**
     * 插件配置面板。
     */
    public static function config(Typecho_Widget_Helper_Form $form)
    {
        $defaultSrc = new Typecho_Widget_Helper_Form_Element_Text(
            'defaultSrc', null, '',
            _t('默认交付端点'),
            _t('必须是 HTTPS；仅放行 127.0.0.1/localhost 的 HTTP 用于本机联调。主题模板未传端点时使用此处。')
        );
        $form->addInput($defaultSrc);

        $refreshInterval = new Typecho_Widget_Helper_Form_Element_Text(
            'refreshInterval', null, '60',
            _t('默认轮询间隔（秒）'),
            _t('0 表示不轮询。')
        );
        $form->addInput($refreshInterval);

        $freshOnly = new Typecho_Widget_Helper_Form_Element_Radio(
            'freshOnly', ['1' => _t('开启（推荐）'), '0' => _t('关闭')], '1',
            _t('fresh-only'),
            _t('内容过期或拉取失败时回退到原始内容。')
        );
        $form->addInput($freshOnly);
    }

    public static function personalConfig(Typecho_Widget_Helper_Form $form)
    {
    }

    /** 交付端点必须是 HTTPS；仅放行 127.0.0.1/localhost 的 HTTP。 */
    public static function validateSrc($url)
    {
        if (!is_string($url) || $url === '') {
            return '';
        }
        $scheme = parse_url($url, PHP_URL_SCHEME);
        if ($scheme === 'https') {
            return $url;
        }
        if ($scheme === 'http' && preg_match('#^http://(127\.0\.0\.1|localhost)(:\d+)?/#', $url)) {
            return $url;
        }
        return '';
    }

    /** 读取插件配置（含默认值）。 */
    public static function options()
    {
        $cfg = Helper::options()->plugin('AiSlot');
        return [
            'defaultSrc'      => isset($cfg->defaultSrc) ? $cfg->defaultSrc : '',
            'refreshInterval' => isset($cfg->refreshInterval) ? (int) $cfg->refreshInterval : 60,
            'freshOnly'       => !isset($cfg->freshOnly) || (string) $cfg->freshOnly !== '0',
        ];
    }

    /**
     * 头部输出：加载嵌入脚本（含 <ai-slot> 自定义元素定义与 5 个起步组件）。
     * 由 activate() 注册的 Widget_Archive::header 钩子触发。
     */
    public static function renderHeader($header, $archive)
    {
        $scriptUrl = Helper::options()->pluginUrl . '/AiSlot/assets/ai-slot-embed.js';
        echo $header;
        echo '<script type="module" src="' . htmlspecialchars($scriptUrl, ENT_QUOTES, 'UTF-8') . '"></script>' . "\n";
    }

    /**
     * 统一的槽位输出，主题模板在需要的位置调用：
     *
     *   <?php AiSlot_Plugin::slot('hero', '', '<h2>原始兜底内容</h2>'); ?>
     *
     * @param string $name     槽位标识（仅保留字母数字、连字符、下划线）
     * @param string $src      交付端点（HTTPS；空字符串使用插件设置的默认端点）
     * @param string $fallback 原始兜底 HTML（由主题作者提供，视为可信模板内容）
     * @param int    $refresh  轮询间隔秒数；<0 表示继承插件设置，0 表示不轮询
     * @param bool|null $freshOnly null 表示继承插件设置
     */
    public static function slot($name = 'hero', $src = '', $fallback = '', $refresh = -1, $freshOnly = null)
    {
        $opts = self::options();

        $src = self::validateSrc($src);
        if ($src === '') {
            $src = self::validateSrc($opts['defaultSrc']);
        }

        $name = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $name);
        if ($name === '') {
            $name = 'hero';
        }

        // 未配置端点时原样输出兜底内容，页面行为与未装插件一致
        if ($src === '') {
            echo $fallback;
            return;
        }

        $refresh = (int) $refresh;
        if ($refresh < 0) {
            $refresh = $opts['refreshInterval'];
        }
        $fresh = $freshOnly === null ? $opts['freshOnly'] : (bool) $freshOnly;

        $attrs = 'name="' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . '" src="'
            . htmlspecialchars($src, ENT_QUOTES, 'UTF-8') . '"';
        if ($fresh) {
            $attrs .= ' fresh-only';
        }
        if ($refresh > 0) {
            $attrs .= ' refresh-interval="' . (int) $refresh . '"';
        }

        echo '<ai-slot ' . $attrs . '>' . $fallback . '</ai-slot>';
    }
}
