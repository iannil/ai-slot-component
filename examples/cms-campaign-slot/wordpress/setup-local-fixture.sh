#!/usr/bin/env bash
set -euo pipefail

# 只创建本参考验收专用的 ai-slot-i1-* 资源；已有同名容器时拒绝覆盖。
for name in ai-slot-i1-db ai-slot-i1-wp; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    printf '%s 已存在，拒绝覆盖\n' "$name" >&2
    exit 1
  fi
done
mkdir -p /tmp/ai-slot-i2-tls
chmod 700 /tmp/ai-slot-i2-tls
openssl rand -hex 32 > /tmp/ai-slot-i2-tls/db-password
openssl rand -hex 32 > /tmp/ai-slot-i2-tls/db-root-password
openssl rand -base64 24 > /tmp/ai-slot-i2-tls/wp-password
openssl rand -base64 24 > /tmp/ai-slot-i2-tls/wp-owner-password
openssl rand -hex 32 > /tmp/ai-slot-i2-tls/owner-token
openssl rand -hex 32 > /tmp/ai-slot-i2-tls/agent-token
chmod 600 /tmp/ai-slot-i2-tls/*password /tmp/ai-slot-i2-tls/*token

docker network create ai-slot-i1-net >/dev/null
docker volume create ai-slot-i1-db >/dev/null
docker volume create ai-slot-i1-wp >/dev/null
docker run -d --name ai-slot-i1-db --network ai-slot-i1-net \
  -v ai-slot-i1-db:/var/lib/mysql \
  -e MARIADB_ROOT_PASSWORD="$(cat /tmp/ai-slot-i2-tls/db-root-password)" \
  -e MARIADB_DATABASE=wordpress -e MARIADB_USER=wp \
  -e MARIADB_PASSWORD="$(cat /tmp/ai-slot-i2-tls/db-password)" mariadb:11.4 >/dev/null
docker run -d --name ai-slot-i1-wp --network ai-slot-i1-net \
  -p 127.0.0.1:18881:80 -v ai-slot-i1-wp:/var/www/html \
  -e WORDPRESS_DB_HOST=ai-slot-i1-db:3306 -e WORDPRESS_DB_USER=wp \
  -e WORDPRESS_DB_PASSWORD="$(cat /tmp/ai-slot-i2-tls/db-password)" \
  -e WORDPRESS_DB_NAME=wordpress wordpress:php8.3-apache >/dev/null

wp() {
  docker run --rm --network ai-slot-i1-net -v ai-slot-i1-wp:/var/www/html \
    -e WORDPRESS_DB_HOST=ai-slot-i1-db:3306 -e WORDPRESS_DB_USER=wp \
    -e WORDPRESS_DB_PASSWORD="$(cat /tmp/ai-slot-i2-tls/db-password)" \
    -e WORDPRESS_DB_NAME=wordpress wordpress:cli-php8.3 wp "$@"
}
for attempt in $(seq 1 60); do
  if docker exec ai-slot-i1-wp test -f /var/www/html/wp-config.php &&
     docker exec -e MYSQL_PWD="$(cat /tmp/ai-slot-i2-tls/db-password)" ai-slot-i1-db mariadb -h 127.0.0.1 -u wp wordpress -e "SELECT 1" >/dev/null 2>&1; then break; fi
  sleep 1
done
wp core install --url=http://127.0.0.1:18881 --title=AI-SLOT-LOCAL-I1 \
  --admin_user=ai_slot_fixture_owner \
  --admin_password="$(cat /tmp/ai-slot-i2-tls/wp-owner-password)" \
  --admin_email=fixture@example.invalid --skip-email >/dev/null
wp rewrite structure '/%postname%/' >/dev/null
id=$(wp post create --post_type=page --post_status=publish \
  --post_title='AI-SLOT接入测试-I1' --post_content='' --porcelain)
if [[ "$id" != 4 ]]; then
  printf '测试页面应为 ID 4，实得 %s\n' "$id" >&2
  exit 1
fi
wp user create ai_slot_i2_admin editor@example.invalid \
  --role=administrator --user_pass="$(cat /tmp/ai-slot-i2-tls/wp-password)" >/dev/null

docker exec ai-slot-i1-wp php -r '
require "/var/www/html/wp-load.php";
update_post_meta(4, "_ai_slot_campaign", ["approved"=>true, "title"=>"产品介绍", "price"=>"¥99", "link"=>"https://example.com/", "expiresAt"=>(time()+3600)*1000, "internal"=>"SECRET_INTERNAL"]);
'
docker exec ai-slot-i1-wp mkdir -p /var/www/html/wp-content/plugins/ai-slot-campaign/assets
docker cp examples/cms-campaign-slot/wordpress/ai-slot-campaign.php ai-slot-i1-wp:/var/www/html/wp-content/plugins/ai-slot-campaign/ai-slot-campaign.php
docker cp examples/cms-campaign-slot/wordpress/assets/ai-slot.js ai-slot-i1-wp:/var/www/html/wp-content/plugins/ai-slot-campaign/assets/ai-slot.js
wp plugin activate ai-slot-campaign >/dev/null
wp post update 4 --post_content='[ai_slot_campaign endpoint="https://127.0.0.1:4195/ai-render/hero" registry="https://127.0.0.1:4195/registry.json"]' >/dev/null
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /tmp/ai-slot-i2-tls/key.pem -out /tmp/ai-slot-i2-tls/cert.pem \
  -days 1 -subj '/CN=127.0.0.1' -addext 'subjectAltName=IP:127.0.0.1' \
  >/tmp/ai-slot-i2-tls/openssl.log 2>&1
printf '专用 WordPress 夹具已就绪；临时凭据位于 /tmp/ai-slot-i2-tls（未输出）。\n'
