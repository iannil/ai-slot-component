# 本地参考管理 MCP

`@ai-slot/mcp` 是受控内容交付参考服务的本机 stdio 管理入口，连接 `127.0.0.1:4194`。它只暴露 `list_slots`、`read_slot`、`create_draft`、`preview_draft`、`publish_draft`、`get_status`、`rollback_slot` 七个工具。Agent 令牌对应的主体只能操作授权的 `hero` 槽位，不能调用批准端点。`publish_draft` 与 `rollback_slot` 的 commit 阶段都由服务端验证 Owner 批准、产物哈希、基线修订和幂等键；prepare 回滚只创建草稿。

`@ai-slot/mcp@0.1.3` 已公开发布（实验性，Node >=22）。也可先 `npm install @ai-slot/mcp`，让客户端启动安装目录的 `node_modules/.bin/ai-slot-management-mcp`，并通过进程环境传入 Agent 令牌；npm 包不会启动下面的 HTTP 服务。

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

本地真实 stdio/HTTP/浏览器协议验收及复跑方法见[验收记录](validation/managed-slot-acceptance.md)。2026-10-21 已使用真实 Claude Code 客户端连接公开 npm 包，完成模型生成、建稿、预览、未审批拒发、用户人工批准后发布、幂等重试及公开浏览器显示核验，详见[本轮客户端记录](validation/2026-10-21-claude-code-mcp.md)。真实客户端与人工审批结合的回滚流程仍待验收，因此只称“本地参考管理 MCP 可用”，不称 AI 自主闭环或远程生产管理上线。MCP 不提供调度，也不替代 HTTP 管理接口的本机地址、令牌和 Owner 授权。

## Claude Code 快速开始

需要 Node.js 22+、pnpm、已登录的 Claude Code，以及两个终端。本流程使用公开 npm 包，参考 HTTP 服务仍从本仓库启动；官方 Registry 收录不会自动启动该服务。

### 1. 准备独立参考服务（终端 A，仓库根目录）

```bash
pnpm install
pnpm build
export AI_SLOT_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ai-slot-quickstart.XXXXXX")"
export AI_SLOT_DATA_DIR="$AI_SLOT_TEST_DIR/state"
export AI_SLOT_SOURCE_FILE="$AI_SLOT_TEST_DIR/source.json"
export AI_SLOT_OWNER_TOKEN="$(openssl rand -hex 32)"
export AI_SLOT_AGENT_TOKEN="$(openssl rand -hex 32)"
unset AI_SLOT_CMS_URL AI_SLOT_PUBLIC_ORIGIN
node --input-type=module <<'JS'
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.AI_SLOT_SOURCE_FILE, JSON.stringify({
  id: 'cms', version: 's1', expiresAt: Date.now() + 60 * 60 * 1000,
  data: { price: '¥99' }
}));
JS
pnpm --filter example-managed-slot start
```

启动脚本要求先设置两个不同且不少于 32 字符的令牌，缺失时会在打印地址前退出。启动后保持终端 A 运行；先通过 `printf '%s' "$AI_SLOT_AGENT_TOKEN" | pbcopy` 把 Agent 令牌交给终端 B 的隐藏输入，再打开 `http://127.0.0.1:4194/admin.html` 填入 Owner 令牌（可用同样方式先复制到密码管理器）。不要把令牌贴进 AI 对话；Owner 令牌只能进入人工管理页，不传入 Claude Code 的父进程。若 4194 端口被占用，先确认已有服务的用途；不要同时启动两个参考服务。测试来源有效期为一小时，超期后内容会回退；更新来源时必须更新版本并重新建稿审批。

### 2. 安装并连接公开包（终端 B，Bash）

```bash
export AI_SLOT_CLIENT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ai-slot-client.XXXXXX")"
cd "$AI_SLOT_CLIENT_DIR"
npm install --ignore-scripts @ai-slot/mcp@0.1.3
unset AI_SLOT_OWNER_TOKEN
read -r -s -p '粘贴终端 A 的 Agent 令牌，然后回车: ' AI_SLOT_AGENT_TOKEN
printf '\n'
export AI_SLOT_AGENT_TOKEN
claude mcp add --transport stdio --scope local ai-slot-management-local -- \
  "$(command -v node)" "$AI_SLOT_CLIENT_DIR/node_modules/@ai-slot/mcp/dist/server.js"
claude mcp list
claude
```

这里将配置限定在临时客户端目录，令牌经环境继承，不写进 MCP 配置或命令参数。以后重新启动 Claude Code 时，需要重新设置 Agent 令牌。在 Claude Code 中通过 `/mcp` 检查连接；工具权限提示按实际操作授权。

### 3. 给 Agent 明确的建稿任务

以下来源值只适用于上面刚创建的示例快照；实际项目必须使用真实来源的值。首次操作空槽位时，当前读取工具不返回来源版本或组件定义，不能要求 Agent 猜测。

```text
使用 ai-slot-management-local 管理本地 hero 槽位。
操作者已确认来源为 cms，sourceVersion=s1，价格为 ¥99。
允许的组件树格式：
{"component":"card","props":{"title":"待生成","price":"¥99","link":"https://example.com/product"}}
先读取槽位与当前修订；为空时基线为 0。
生成一条简短中文商品介绍，保持价格与链接不变，创建草稿并预览。
返回 draftId、artifactHash、baseRevision 和候选内容，等待我人工批准。
不要尝试审批，也不要提前发布。
```

### 4. 人工批准，再交给 Agent 发布

打开 `http://127.0.0.1:4194/admin.html`，填写 Owner 令牌、Agent 返回的草稿 ID 与基线修订，点击“预览”，核对候选 DOM、JSON 和 hash 后点击“批准”。此步骤只批准，发布由 Agent 执行。

```text
我已在 Owner 页面批准刚才预览的草稿。
请用该草稿的 draftId、artifactHash 和 baseRevision（作为 expectedRevision）
调用 publish_draft，选择一个新的幂等键；重试同一请求时保持参数与键完全一致。
成功后读取 get_status 并报告修订。如果批准过期或版本冲突，停止并报告，不自行审批。
```

检查 `http://127.0.0.1:4194/index.html` 的实际显示，以及 `/ai-render/hero` 的 revision/hash。`get_status.browserObservation` 为 null 不能证明浏览器已渲染。完成试用后在终端 A 按 Ctrl-C 停止服务，退出客户端，并清空剪贴板中残留的令牌。
