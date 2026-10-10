# WordPress 内容槽位参考接入

本例为自有 WordPress 页面提供一个可撤回的短代码。WordPress 插件只公开已批准事实和输出原始兜底壳；浏览器从公开 HTTPS `/registry.json` 获取注册表，校验后才将壳升级为 `<ai-slot>`。浏览器脚本只使用 `textContent` 写 AI 文本。运营草稿、批准、发布、回滚继续使用 `example-managed-slot` 的私有 Operations 接口，不把管理令牌放进页面。

## 构建与接入

运行 `pnpm install && pnpm build`；其中 `pnpm --filter example-cms-campaign-slot build` 使用锁定的 esbuild 0.27.7 生成 `wordpress/assets/ai-slot.js`。把 `wordpress/ai-slot-campaign.php` 与构建出的 `assets/ai-slot.js` 按相同目录结构安装成 WordPress 插件并启用。页面添加：

```text
[ai_slot_campaign endpoint="https://delivery.example/ai-render/hero" registry="https://delivery.example/registry.json"]
```

两个 URL 必须是公开 HTTPS，且同源。部署者为交付服务设置 `AI_SLOT_PUBLIC_ORIGIN=https://cms.example`，只给 `/registry.json` 与 `/ai-render/hero` 的允许宿主 Origin 返回 CORS；私有 `/ops/*` 始终没有跨源许可。交付服务仍只监听本机 `127.0.0.1:4194`，公网 HTTPS 反代须固定上游 Host 为 `127.0.0.1:4194`，并单独限制私有路由。公开注册表只给 `registry`、`registryVersion`、`rendererVersion`、`allowedOrigins`；链接仍受同一份服务端 policy 的 origin 清单约束。页面 CSP 需允许同源插件模块的 `script-src` 和交付域的 `connect-src`。若不具备公开 HTTPS 交付端点，不应把本地演示称为生产兼容。

插件初次安装和页面短代码添加需要宿主发布。此后，**已部署注册表和渲染器契约内**的已批准内容更新，可经 Operations 发布并由浏览器 60 秒轮询看到，无需重新打包宿主页面。此参考包默认不用 `live`；新组件或链接策略升级仍需审查和重新部署。编辑器里管理的是短代码文本；前台与预览页才运行槽位。WordPress 返回的 HTML 不会交给 AI 渲染器消费。脚本、注册表、来源或交付失败时，页面保留中性原始内容。

## 本机可复跑验收

使用隔离的 WordPress 测试容器 `ai-slot-i1-wp`、MariaDB 容器 `ai-slot-i1-db`、网络 `ai-slot-i1-net` 与各自同名卷，WordPress 监听 `127.0.0.1:18881`。可在专用资源不存在时先运行 `pnpm --filter example-cms-campaign-slot build`，再运行 `bash examples/cms-campaign-slot/wordpress/setup-local-fixture.sh`；脚本只创建上述固定名称的容器、卷、网络，准备公开测试页面 ID 4、批准事实、只读插件、临时编辑器账号及一天有效的本地自签证书，临时凭据写在 `/tmp/ai-slot-i2-tls` 且不回显。已存在同名容器时会拒绝覆盖。需要续期可运行 `bash examples/cms-campaign-slot/wordpress/refresh-local-fixture.sh`。I1 页面事实 URL 末尾必须带 `/`。这套资源只用于本机参考验收；不要连接客户站点。

1. 若未用上述 setup 脚本，可在构建后把插件和 `assets/ai-slot.js` 复制到测试容器 `/var/www/html/wp-content/plugins/ai-slot-campaign/`，激活新路径插件，页面正文加入上面的短代码，其中两个 URL 分别用 `https://127.0.0.1:4195/ai-render/hero`、`https://127.0.0.1:4195/registry.json`。建立专用临时 WordPress 编辑器账号 `ai_slot_i2_admin`。
2. setup 脚本已在 `/tmp/ai-slot-i2-tls` 生成仅一天有效、SAN 为 `IP:127.0.0.1` 的自签证书和独立随机 owner/agent 令牌；使用空数据目录，运行：

   ```sh
   AI_SLOT_CMS_URL=http://127.0.0.1:18881/wp-json/ai-slot/v1/campaign/4/ \
   AI_SLOT_PUBLIC_ORIGIN=https://127.0.0.1:18882 \
   AI_SLOT_DATA_DIR=/tmp/ai-slot-i2-store \
   AI_SLOT_OWNER_TOKEN="$(cat /tmp/ai-slot-i2-tls/owner-token)" \
   AI_SLOT_AGENT_TOKEN="$(cat /tmp/ai-slot-i2-tls/agent-token)" \
   node examples/cms-campaign-slot/wordpress/local-managed-demo.mjs
   ```

   这个辅助程序通过真实私有草稿、批准、发布接口发布一条参考内容。令牌仅放在本机进程环境。
3. 运行 `AI_SLOT_TLS_KEY=/tmp/ai-slot-i2-tls/key.pem AI_SLOT_TLS_CERT=/tmp/ai-slot-i2-tls/cert.pem node examples/cms-campaign-slot/wordpress/local-tls-proxy.mjs`。其两个 HTTPS 入口分别是 WordPress `18882` 与交付 `4195`，只监听 `127.0.0.1`。浏览器验收仅在 Playwright context 设置 `ignoreHTTPSErrors`，不修改系统信任或全局 TLS 校验。
4. 运行 `AI_SLOT_WP_PASSWORD="$(cat /tmp/ai-slot-i2-tls/wp-password)" pnpm --filter example-cms-campaign-slot test:host`。脚本检查前台、编辑器、预览、320/768/1280、键盘链接、脚本与 CSP 阻断、503、同页 registry 冲突、CMS 暂停和恢复；CMS 暂停有 `finally` 自动恢复。验收脚本假设前述专用站和端点已运行。`pnpm --filter example-cms-campaign-slot test:host-dom` 在同一真实 WordPress 文档中门控插件模块，精确比较授权槽位和插件 script 之外的完整 body DOM，并将无秘密摘要写到 `docs/validation/assets/cms-campaign/outside-dom-before-after.json`。

撤回时先把页面短代码改回静态片段，确认前台不再加载 `ai-slot.js`；再停用插件、删除临时编辑器账号、撤销并删除本机令牌、停止交付服务与 TLS 代理。若整个本地参考站不再使用，仅删除上述专用两个容器、两个卷和网络。不要按镜像名批量删除容器。撤回不会创建额外 CMS 文章或事实副本；Operations 的临时 Store 也应删除。

## 验收图像

真实 WordPress 7.1.3 / Twenty Twenty-Five 1.5 参考站的公开前台截屏：[1280px](../../docs/validation/assets/cms-campaign/front-1280.png)、[320px](../../docs/validation/assets/cms-campaign/front-320.png)、[撤回后](../../docs/validation/assets/cms-campaign/withdrawn.png)。[DOM 摘要](../../docs/validation/assets/cms-campaign/browser-dom.json)与[槽位外 DOM 增强前后精确比对](../../docs/validation/assets/cms-campaign/outside-dom-before-after.json)只含公开页面结构与文字或摘要；后台登录和编辑器 DOM 未留存。

本地资源全部结束后，明确按名称执行 `docker rm -f ai-slot-i1-wp ai-slot-i1-db`、`docker volume rm ai-slot-i1-wp ai-slot-i1-db`、`docker network rm ai-slot-i1-net`，再删除 `/tmp/ai-slot-i2-store` 与 `/tmp/ai-slot-i2-tls`。
