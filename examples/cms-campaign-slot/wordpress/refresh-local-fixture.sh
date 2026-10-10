#!/usr/bin/env bash
set -euo pipefail

# 仅续期本地参考站中已创建的测试页面；不会创建、批准或修改客户内容。
container=${AI_SLOT_WP_CONTAINER:-ai-slot-i1-wp}
post_id=${AI_SLOT_WP_FIXTURE_ID:-4}
if [[ ! "$post_id" =~ ^[1-9][0-9]*$ ]]; then
  printf '测试页面 ID 无效\n' >&2
  exit 1
fi

/usr/local/bin/docker exec -e AI_SLOT_WP_FIXTURE_ID="$post_id" "$container" php -r '
require "/var/www/html/wp-load.php";
$id = (int) getenv("AI_SLOT_WP_FIXTURE_ID");
$post = get_post($id);
if (!$post || $post->post_type !== "page" || $post->post_title !== "AI-SLOT接入测试-I1") {
    fwrite(STDERR, "测试页面身份不符\n");
    exit(1);
}
$facts = get_post_meta($id, "_ai_slot_campaign", true);
if (!is_array($facts) || ($facts["approved"] ?? null) !== true) {
    fwrite(STDERR, "测试事实未批准\n");
    exit(1);
}
$facts["expiresAt"] = (time() + 3600) * 1000;
update_post_meta($id, "_ai_slot_campaign", $facts);
echo "本地测试事实已续期 1 小时\n";
'
