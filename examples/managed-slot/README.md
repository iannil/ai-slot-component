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

管理接口均为 JSON `POST /ops/*`，请求带 `Authorization: Bearer <令牌>`。owner 可读、建草稿、批准、发布、回滚；agent 不能批准。公开接口为 `/registry.json`、`/ai-render/hero` 与 `/ai-invalidate?slot=hero`。管理请求限制 64 KiB，拒绝跨源请求和非本机 Host。此服务没有绕过批准的发布入口。
