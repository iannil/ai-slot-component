# AI-SLOT 后续交付最终统一修复报告

日期：2026-10-11。基线 `f455f1f`；依据[最终广审](final-review.md)。本波仅处理 F1、F2、V 写侧容量回归及 M1/M2/M3；未重跑整仓浏览器矩阵。代码仍在隔离分支，整合、推送和新版 SDK 发布不属于本报告的完成证据。

## 逐项结果

| Finding | 修改文件 | 修复及回归 |
| --- | --- | --- |
| F1 持久层误限 props 字符串 | `packages/operations/src/state.ts`、`state.test.ts`、`drafts.test.ts`、`examples/cms-campaign-slot/source.test.mjs` | JSON 内容字符串可以为空或超过 200；元数据/标识符仍走非空及 200 限制，对象键仍严校。注册表允许的空标题及允许域 221/2048 字符链接经真实 FileStore 建稿、关闭重开、预览、批准、发布成功；CMS 来源 2048 接受、2049 拒绝。没有缩短 CMS 2048 合同。 |
| F2 来源读取期间批准到期 | `packages/operations/src/publishing.ts`、`publishing.test.ts` | `assertCurrentArtifact` 的异步读取返回后、写 release/pointer/idempotency 前再次检查批准期限。可控 Promise 与时钟分别覆盖 publish、rollback commit；到期时返回 `approval_expired`，与原状态全量相等。成功收据到期后同参数重试仍返回旧收据且只有一条 release。 |
| V 写侧 64MiB | `packages/operations/src/file-store.test.ts` | 构造 1100 个结构与 hash 均合法、每棵树约 62KiB 的 artifact，使快照超过 64MiB。事务返回 `storage_limit`；旧 `state.json` 字节完全一致，当前读取与关闭重开后读取均等于旧状态。保留既有 1000 release 限制及启动读侧大文件检查。 |
| M1 清理链 | `examples/managed-slot/e2e/mcp-stdio.spec.ts` | Client 和浏览器页关闭分别尝试，服务关闭不会被前一个失败跳过；确认服务关闭后才删除目录。若主测试已失败则保留原异常并另记清理错误；仅清理失败时抛聚合异常。 |
| M2 browserText | 同上 | 首版、次版与回滚各自在 `toHaveText` 后立即从真实 DOM 读取 `innerText()`；本次日志首版“stdio 第一版”、次版“stdio 第二版”、回滚“stdio 第一版”。历史日志仍按原始性质保留。 |
| M3 英文 README | `README.md` | live/onConnect 说明改为英文，保留连接时可核对和不保证访客同时生效的原意。 |

## 命令与实际输出

所有命令使用 Node 24 PATH `/Users/rong.zhu/.nvm/versions/node/v24.14.0/bin`。测试及构建在隔离工作区执行，固定 4194 端口先以 `lsof -nP -iTCP:4194 -sTCP:LISTEN` 检查为空；未停止其他进程。

1. 修改实现前：`pnpm --filter @ai-slot/operations exec vitest run src/state.test.ts src/publishing.test.ts src/file-store.test.ts`，25 passed / 4 failed。F1 空/长 props 和 V 写侧先得到 `corrupt_state`；F2 publish、rollback 的 Promise 误成功。
2. 修改后：同一定向命令，3 files / 29 tests passed。
3. `pnpm --filter @ai-slot/operations test`，7 files / 64 tests passed；包含真实 FileStore 重启、两种链接长度、两种审批竞争与写侧容量测试。
4. `pnpm --filter @ai-slot/operations build`，ESM 与 DTS build success；`pnpm --filter @ai-slot/operations typecheck`，`tsc --noEmit` 退出 0。
5. `pnpm --filter example-cms-campaign-slot exec vitest run source.test.mjs`，1 file / 7 tests passed。
6. `pnpm --filter example-managed-slot exec playwright test e2e/mcp-stdio.spec.ts --workers=1`，1 passed；官方 MCP Client 通过真实 stdio、HTTP、Owner 页面、浏览器发布及回滚。新 `STDIO_ACCEPTANCE_EVIDENCE` 含每阶段实际 DOM 文本及 revision 1/2/3。
7. `git diff --check`，无空白错误。

首次未提权运行 Vitest 时，沙箱拒绝 Vite 在受管工作区创建临时配置文件（EPERM）；随后用获准的工作区写权限运行上述红绿测试。该环境错误不计为产品测试失败。

## 自审与边界

复核了状态 JSON 遍历和显式元数据字段的分工：`json` 仍拒绝非 JSON 值、稀疏数组、非普通原型和循环，键仍要求非空且不超过 200；artifact hash 与引用完整性仍校验。树 64KiB 由 `validateArtifact` 在建稿和异步来源复核中执行，FileStore 保留 64MiB 快照及 1000 release 上限。批准重检位于所有异步来源检查之后、首次状态写入之前；幂等收据分支仍先核对授权并直接返回已提交结果。stdio 日志的文本由各阶段独立读取，清理失败不会遮盖先前的主断言错误。

当前剩余关注点依[最终广审](final-review.md)裁决：R1 预期 stderr 噪声、固定 4194 端口碰撞、I 色彩变量提示可后续；G 重试重复通知符合当前契约；WordPress 证据只覆盖所测主题的 body DOM。R3 npm 最新 01:41 `npm whoami` 仍 E401，系控制器记录，本波未重试认证或发布。M 仍为 `protocol_verified / agent_unverified`，I 仍无真实客户试点。未改写或补造既有验收日志，也未宣称隔离分支已整合推送。
