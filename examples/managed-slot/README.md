# 受控内容交付参考服务

本示例运行在 Node.js 22+ 的本机 `127.0.0.1:4194`。一个文件 Store 是唯一写者；公开页面只读取当前已发布且仍有效的内容，私有管理请求经令牌映射成固定权限主体。

先构建 workspace 包，再生成两个不同的随机令牌并启动：

```sh
pnpm build
export AI_SLOT_OWNER_TOKEN="$(openssl rand -hex 32)"
export AI_SLOT_AGENT_TOKEN="$(openssl rand -hex 32)"
pnpm --filter example-managed-slot start
```

令牌只保存在服务端环境和本机管理客户端中，不能写入网页、仓库或公共目录。可用 `AI_SLOT_DATA_DIR` 指定持久状态目录；默认位于用户缓存目录。`source.json` 是手工维护的来源快照，更新时须修改版本、价格事实和有效期。来源到期、读取失败或形状无效时，公开投递降级为原始内容。服务停止后状态保留，若异常退出留下 `writer.lock`，须由管理员确认无写者后手工移走。

管理接口均为 JSON `POST /ops/*`，请求带 `Authorization: Bearer <令牌>`。owner 可读、建草稿、批准、发布、回滚；agent 不能批准。公开接口为 `/registry.json`、`/ai-render/hero` 与 `/ai-invalidate?slot=hero`。管理请求限制 64 KiB，拒绝跨源请求、缺失 Host 和非本机 Host。失效通道最多同时接受 64 个订阅，每条流最多保留 1 帧待消费消息；慢客户端被断开后由重连核对当前版本。此服务没有绕过批准的发布入口。

浏览器打开 `/admin.html`，输入 owner 令牌后创建草稿，再预览真实 DOM 组件及并列 JSON；批准仅绑定最后一次成功预览的草稿、产物哈希与基线，发布须另点一次。准备回滚也会产生新草稿，必须再次预览、批准和提交。令牌只留在当前页面的模块内存中，刷新后重新输入。管理页的 320/768/1280 像素切换可用键盘操作。

公开 `/index.html` 使用 `live fresh-only`，在来源不可读或过期时显示中性原始内容。`/registry.json` 与浏览器 `/registry.mjs` 来自同一服务端注册表；新增组件需同步审查组件映射、URL 策略与渲染器版本。运行端到端测试：`pnpm --filter example-managed-slot test:e2e`。测试自动创建临时 Store 与来源文件；需要手动隔离来源时，可通过服务端变量 `AI_SLOT_SOURCE_FILE` 指定快照路径。

## 本地 MCP 管理入口

`@ai-slot/mcp` 的 stdio 子进程使用绝对路径 `packages/mcp/dist/server.js`，仅接收 `AI_SLOT_AGENT_TOKEN`，并固定连接本服务的 `127.0.0.1:4194`。工具不含 approve；Owner 在 `/admin.html` 独立预览和批准后，Agent 才可发布或提交回滚。配置与边界见[管理 MCP 说明](../../docs/managed-slot-mcp.md)。

`pnpm --filter example-managed-slot test:e2e` 中的 `mcp-stdio.spec.ts` 通过官方 Client 启动实际子进程，使用临时 Store/来源与真实 HTTP 服务，核对工具发现、授权、批准、发布、幂等、回滚和浏览器文本。它是可复跑的协议验收；外部 AI 客户端与真实人工运营的连接仍待单独验收。
