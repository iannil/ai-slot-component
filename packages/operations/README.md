# @ai-slot/operations

服务端私有包，提供版本状态校验与本地单写者文件库。需要 Node.js 22 或更新版本。`openFileStore(directory)` 在目录中维护 `state.json` 和独占的 `writer.lock`，事务把草稿、审批、发布记录、指针及幂等回执作为一个快照提交。当前边界为 64 MiB 和 1000 条发布记录；只支持本地具备原子 rename 语义的文件系统，不支持 NFS、云同步目录或多个服务实例。

事务按调用顺序执行，读取也进入同一队列。提交先校验完整引用关系，再写同目录临时文件、同步文件、rename 到 `state.json`，最后同步目录。`beforeRename` 失败不会改变旧快照；rename 后失败返回 `commit_unknown`，该句柄停止后续写入。调用方应通过幂等回执核对提交结果，不能把该错误视为明确失败并盲目重试。

## 人工恢复

1. 停止唯一服务，备份整个存储目录（包括 `state.json`、临时文件及 `writer.lock`）。
2. 核对 `writer.lock` 中的 PID 与随机 nonce，并确认原服务进程确已退出；不要按锁文件年龄自动抢占。
3. 管理员人工移走残留的 `writer.lock`，重新调用 `openFileStore`。启动会在解析前检查快照大小，并用 `assertState` 校验结构、hash 和所有引用；损坏快照会拒绝启动，不会重置为空库。
4. 用幂等键查询对应回执确认发布是否已经落盘，再决定后续业务动作。

`fault` 注入选项只供故障测试使用，不是业务配置。

## 草稿、发布与公开投递

`createOperations(store, env)` 是治理和交付的统一入口。`listSlots(actor)` 只列出有 `read` 授权且存在策略的槽位；`readSlot(actor, slotId)` 只返回该槽位的发布指针与草稿。`previewDraft` 和 `getStatus` 同样需要本槽位的 `read` 授权。草稿建立时校验树、来源与线上基线，将内容写成以 SHA-256 寻址的不可变 artifact；预览的 `previous` 固定到草稿创建时的版本。批准再次核对哈希、基线、来源及组件契约，且有效期最多 15 分钟并不得超过来源期限。

一次完整的操作顺序如下，其中发布和回滚都需要批准人重新审核内容哈希与有效期：

1. `createDraft(actor, { slotId, tree, baseRevision, sourceVersion })` 建立草稿。
2. `previewDraft(actor, draft.id)` 查看草稿、artifact 哈希和基线差异。
3. `approveDraft(actor, { draftId, artifactHash, expiresAt })` 批准该草稿。
4. `publishDraft(actor, { draftId, artifactHash, expectedRevision, idempotencyKey })` 原子发布，并取得新 revision 回执。
5. `deliver(slotId)` 公开交付当前版本；它不接受管理员身份，也不会返回草稿、批准人或来源凭据。
6. 需要回滚时，`prepareRollback(actor, { slotId, targetRevision, expectedRevision })` 将历史 artifact 建成新的回滚草稿。
7. 再次 `previewDraft` 和 `approveDraft`，审核这份回滚草稿。
8. `rollbackSlot(actor, { draftId, artifactHash, expectedRevision, idempotencyKey })` 发布新的 revision，而非移动指针回旧编号。

`deliver` 返回版本 1 的 JSON：`{ version, slot, tree, meta: { revision, artifactHash, sourceVersion, expiresAt } }`。`expiresAt` 是 artifact 中的 Unix 毫秒时间。所有响应均使用 `Cache-Control: no-store`。已知槽位没有可读发布内容，或当前来源、组件契约、有效期校验失败时，返回 `503 { "error": "ai_unavailable" }`，由页面保留原始内容；未知槽位返回 404。来源读取抛出的异常会统一转成 `source_unavailable`，来源数据本身不合法仍是 `source_invalid`，公开响应不会暴露这些内部细节。

`getStatus(actor, slotId)` 返回 `{ desiredRevision, readableRevision, browserObservation }`。`desiredRevision` 来自发布指针，即使当前来源失效也保留；`readableRevision` 只有通过同一实时可读性检查才有值；`browserObservation` 固定为 `null`，因为服务端没有浏览器渲染观测。每次交付都会重读外部来源，外部来源与文件事务不能跨系统原子锁定，因此不承诺来源在校验后永不变化。此包是单站点参考实现，不负责任意事实语义验证或金融促销自动审批。
