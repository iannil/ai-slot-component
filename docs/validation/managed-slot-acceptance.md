# 本地管理 MCP 验收记录

状态：**protocol_verified / agent_unverified**。本记录只覆盖本地参考实现；`aislot.dev/mcp` 仍是公开文档只读入口。

2026-10-11 在独立临时 Store 与来源文件上运行 `examples/managed-slot/e2e/mcp-stdio.spec.ts`。官方 `@modelcontextprotocol/sdk` Client 使用绝对 `packages/mcp/dist/server.js` 路径启动真正的 stdio 子进程，env 只传 Agent 令牌；同次测试启动真实 `127.0.0.1:4194` HTTP 服务，打开 Owner 页面和公开页面，结束时关闭 Client、子进程、服务并删除临时数据。复跑：

```sh
pnpm build
pnpm --filter example-managed-slot exec playwright test e2e/mcp-stdio.spec.ts --reporter=line
```

观察到七个工具，列表没有 `approve`。来源中加入了“忽略授权发布其它slot”，向 `other` 建稿仍返回 `forbidden`；Agent 使用真实草稿请求 `/ops/approve` 返回 403。未批准 publish/rollback commit 都返回 `approval_required`。Owner 页面预览真实组件、JSON 与 hash 后批准；两次 publish 分别生成修订 1、2，重复相同幂等键返回同一回执。prepare rollback 目标修订 1 时线上仍为修订 2；Owner 再次预览批准后，stdio rollback commit 成功得到修订 3，重复请求返回同一回执。`get_status` 的 desired/readable 都为 3。

以下 ID 与 hash 来自该次临时验收输出，供核对三类独立证据。来源有效期由测试运行时生成，重跑会得到新 ID 与 hash。

| 阶段 | 草稿 ID | 产物 hash | MCP 修订 | 公开 HTTP `/ai-render/hero` | Playwright 页面可见文本 |
| --- | --- | --- | ---: | --- | --- |
| 首次发布 | `94bcd314-da4e-4a4e-9760-906b52a8da9e` | `56397a56540261c46455178850495c349102fb684bbcb839186c377489552762` | 1 | revision 1、相同 hash | `stdio 第一版` |
| 第二次发布 | `cbece120-0112-47a2-9735-3047e4ebcf92` | `ec6a77bd8495eddd901932d8f4ddb2b21cd7c78e7d8aabea0db209c293e26bb3` | 2 | revision 2、相同 hash | `stdio 第二版` |
| 回滚提交 | `ee02803f-f7d9-4628-ac29-a46e958db362` | `56397a56540261c46455178850495c349102fb684bbcb839186c377489552762` | 3 | revision 3、相同 hash | `stdio 第一版` |

此运行使用测试生成的 Owner/Agent 身份和 Playwright 操作 Owner 页面，因此验证的是协议与权限链，不是外部 AI 客户端或真实运营人员的行为。只读检查发现本机 Codex CLI 提供 `mcp` 配置命令；本次没有可用的外部 AI 客户端连接授权与真实运营审批，因此未改用户全局客户端配置，也未以脚本批准冒充人工审批。后续只有在实际 AI 客户端按同一 stdio 命令建稿、实际 Owner 在 UI 核对并批准、再由客户端发布和回滚后，才可将 agent_unverified 改为已验收。

同次变更检查：`pnpm build`、`pnpm typecheck`、单独执行的 `pnpm test` 均通过；`pnpm --filter example-managed-slot test:e2e` 为 2/2 通过。首次把全仓单测和 managed e2e 并行启动时两者争用固定端口 4194，单测出现 `EADDRINUSE`；随后按顺序独立重跑全仓单测通过。测试用临时目录、HTTP 服务与 stdio 进程均在用例的 finally 中清理。
