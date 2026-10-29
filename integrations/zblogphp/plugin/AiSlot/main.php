<?php
/**
 * ai-slot 配置页（后台「插件管理 → ai-slot → 配置」）。
 */
require '../../../zb_system/function/c_system_base.php';
require '../../../zb_system/function/c_system_admin.php';

$zbp->Load();
$action = 'root';
if (!$zbp->CheckRights($action)) {
    $zbp->ShowError(6);
    die();
}
if (!$zbp->CheckPlugin('AiSlot')) {
    $zbp->ShowError(48);
    die();
}

$blogtitle = 'ai-slot';

// 保存配置
if (count($_POST) > 0) {
    if (function_exists('CheckIsRefererValid')) {
        CheckIsRefererValid();
    }
    $src = AiSlot_ValidateSrc(trim(GetVars('default_src', 'POST')));
    $zbp->Config('AiSlot')->default_src = $src;
    $zbp->Config('AiSlot')->refresh_interval = min(86400, max(0, (int) GetVars('refresh_interval', 'POST')));
    $zbp->Config('AiSlot')->fresh_only = GetVars('fresh_only', 'POST') ? '1' : '0';
    $zbp->SaveConfig('AiSlot');
    $zbp->SetHint('good', '配置已保存');
    Redirect('./main.php');
}

$opts = AiSlot_Options();

require $blogpath . 'zb_system/admin/admin_header.php';
require $blogpath . 'zb_system/admin/admin_top.php';
?>
<div id="divMain">
  <div class="divHeader"><?php echo $blogtitle; ?></div>
  <div class="SubMenu"></div>
  <div id="divMain2">
    <form method="post" action="main.php">
      <?php if (function_exists('CheckIsRefererValid')) {
          echo '<input type="hidden" name="csrfToken" value="' . $zbp->GetCSRFToken() . '"/>';
      } ?>
      <table class="tableFull tableBorder">
        <tr>
          <th style="width:200px"><label for="default_src">默认交付端点</label></th>
          <td>
            <input type="url" id="default_src" name="default_src" style="width:420px"
                   value="<?php echo htmlspecialchars($opts['default_src'], ENT_QUOTES, 'UTF-8'); ?>"
                   placeholder="https://delivery.example/ai-render/hero"/>
            <p>必须是 HTTPS；仅放行 127.0.0.1/localhost 的 HTTP 用于本机联调。主题模板未传端点时使用此处。</p>
          </td>
        </tr>
        <tr>
          <th><label for="refresh_interval">默认轮询间隔（秒）</label></th>
          <td>
            <input type="number" id="refresh_interval" name="refresh_interval" min="0" max="86400"
                   value="<?php echo (int) $opts['refresh_interval']; ?>"/>
            <p>0 表示不轮询。</p>
          </td>
        </tr>
        <tr>
          <th>fresh-only</th>
          <td>
            <label><input type="checkbox" name="fresh_only" value="1" <?php echo $opts['fresh_only'] ? 'checked' : ''; ?>/>
            内容过期或拉取失败时回退到原始内容（推荐开启）</label>
          </td>
        </tr>
      </table>
      <p><input type="submit" class="button" value="保存"/></p>
    </form>
    <h3>使用方法</h3>
    <p>在主题模板（如 default/index.php、single.php）需要的位置插入：</p>
    <pre>{AiSlot_Slot('hero', '', '&lt;h2&gt;原始兜底内容&lt;/h2&gt;')}</pre>
    <p>或在 PHP 中直接调用 <code>AiSlot_Slot('hero', '', '...')</code>。参数依次为：槽位标识、端点（空串用上方默认）、兜底 HTML、轮询秒数（-1 继承设置）、fresh-only（null 继承设置）。</p>
  </div>
</div>
<?php
require $blogpath . 'zb_system/admin/admin_footer.php';
RunTime();
