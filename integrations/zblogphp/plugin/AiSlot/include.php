<?php
/**
 * ai-slot：把存量页面区域变成 AI 内容的安全上线通道。
 * AI 返回结构化组件树 JSON（绝不返回 HTML），校验通过后渲染为真实组件；
 * 失败、超时或校验不过时静默回退原始内容。
 *
 * 目录约定：zb_users/plugin/AiSlot/include.php（id 与目录名一致，首字母大写）。
 * 兼容 Z-BlogPHP 1.7+。
 */

// 注册插件；ActivePlugin_* 在插件启用时被调用
RegisterPlugin('AiSlot', 'ActivePlugin_AiSlot');

/**
 * 启用时挂载钩子：向前台 <head> 注入嵌入脚本。
 */
function ActivePlugin_AiSlot()
{
    Add_Filter_Plugin('Filter_Plugin_Index_Begin', 'AiSlot_Index_Begin');
}

function InstallPlugin_AiSlot()
{
}

function UninstallPlugin_AiSlot()
{
}

/**
 * 向前台页面 <head> 追加嵌入脚本
 * （含 <ai-slot> 自定义元素定义与 5 个起步组件）。
 */
function AiSlot_Index_Begin()
{
    global $zbp;
    $scriptUrl = $zbp->host . 'zb_users/plugin/AiSlot/assets/ai-slot-embed.js';
    $zbp->header .= '<script type="module" src="' . htmlspecialchars($scriptUrl, ENT_QUOTES, 'UTF-8') . '"></script>' . "\r\n";
}

/** 交付端点必须是 HTTPS；仅放行 127.0.0.1/localhost 的 HTTP 用于本机联调。 */
function AiSlot_ValidateSrc($url)
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
function AiSlot_Options()
{
    global $zbp;
    $cfg = $zbp->Config('AiSlot');
    return [
        'default_src'      => $cfg->HasKey('default_src') ? $cfg->default_src : '',
        'refresh_interval' => $cfg->HasKey('refresh_interval') ? (int) $cfg->refresh_interval : 60,
        'fresh_only'       => !$cfg->HasKey('fresh_only') || (string) $cfg->fresh_only !== '0',
    ];
}

/**
 * 统一的槽位输出，主题模板在需要的位置调用：
 *
 *   {AiSlot_Slot('hero', '', '<h2>原始兜底内容</h2>')}
 *
 * 或在 PHP 模板中直接调用 AiSlot_Slot('hero', '', '...')。
 *
 * @param string $name     槽位标识（仅保留字母数字、连字符、下划线）
 * @param string $src      交付端点（HTTPS；空字符串使用插件设置的默认端点）
 * @param string $fallback 原始兜底 HTML（由主题作者提供，视为可信模板内容）
 * @param int    $refresh  轮询间隔秒数；<0 表示继承插件设置，0 表示不轮询
 * @param bool|null $freshOnly null 表示继承插件设置
 */
function AiSlot_Slot($name = 'hero', $src = '', $fallback = '', $refresh = -1, $freshOnly = null)
{
    $opts = AiSlot_Options();

    $src = AiSlot_ValidateSrc($src);
    if ($src === '') {
        $src = AiSlot_ValidateSrc($opts['default_src']);
    }

    $name = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $name);
    if ($name === '') {
        $name = 'hero';
    }

    // 未配置端点时原样输出兜底内容，页面行为与未装插件一致
    if ($src === '') {
        return $fallback;
    }

    $refresh = (int) $refresh;
    if ($refresh < 0) {
        $refresh = $opts['refresh_interval'];
    }
    $fresh = $freshOnly === null ? $opts['fresh_only'] : (bool) $freshOnly;

    $attrs = 'name="' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . '" src="'
        . htmlspecialchars($src, ENT_QUOTES, 'UTF-8') . '"';
    if ($fresh) {
        $attrs .= ' fresh-only';
    }
    if ($refresh > 0) {
        $attrs .= ' refresh-interval="' . (int) $refresh . '"';
    }

    return '<ai-slot ' . $attrs . '>' . $fallback . '</ai-slot>';
}
