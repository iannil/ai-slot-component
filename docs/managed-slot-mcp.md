# 本地参考管理 MCP

`@ai-slot/mcp` 是受控内容交付参考服务的本机 stdio 管理入口，连接 `127.0.0.1:4194`。它只暴露 `list_slots`、`read_slot`、`create_draft`、`preview_draft`、`publish_draft`、`get_status`、`rollback_slot` 七个工具。Agent 令牌对应的主体只能操作授权的 `hero` 槽位，不能调用批准端点。`publish_draft` 与 `rollback_slot` 的 commit 阶段都由服务端验证 Owner 批准、产物哈希、基线修订和幂等键；prepare 回滚只创建草稿。

`@ai-slot/mcp@0.1.0` 已公开发布（实验性，Node >=22）。也可先 `npm install @ai-slot/mcp`，让客户端启动安装目录的 `node_modules/.bin/ai-slot-management-mcp`，并通过进程环境传入 Agent 令牌；npm 包不会启动下面的 HTTP 服务。

先按[示例说明](../examples/managed-slot/README.md)构建并启动本地 HTTP 服务。MCP 客户端启动命令中的路径须换成本机的绝对路径，且只给 stdio 进程传 Agent 令牌；Owner 令牌只用于独立的 `/admin.html` 页面，不传给 Agent。示例配置形状：

```json
{
  "mcpServers": {
    "ai-slot-management-local": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/ai-slot-component/packages/mcp/dist/server.js"],
      "env": { "AI_SLOT_AGENT_TOKEN": "本机 Agent 令牌" }
    }
  }
}
```

服务端地址固定为 `http://127.0.0.1:4194`。发布前 Agent 创建并预览草稿，Owner 在 `/admin.html` 独立核对可见组件、JSON、hash 和基线并批准。Agent 随后以相同 draftId/hash/expectedRevision 发布，读取 `get_status` 并核对公开 `/ai-render/hero` 和页面。回滚同样经过 `rollback_slot` prepare、新草稿预览、Owner 批准、commit。来源过期或发生变化时公开页面退回原始内容。

本地真实 stdio/HTTP/浏览器协议验收及复跑方法见[验收记录](validation/managed-slot-acceptance.md)。当前状态是 **protocol_verified / agent_unverified**：官方 SDK Client 已连接真实 stdio 子进程；尚无外部 AI 客户端执行生成与工具调用、也无真实运营人员审批记录。因此只称“本地参考管理 MCP 可用”，不称 AI 自主闭环或远程生产管理上线。MCP 不提供调度，也不替代 HTTP 管理接口的本机地址、令牌和 Owner 授权。
