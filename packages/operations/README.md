# @ai-slot/operations

服务端私有包，提供版本状态校验与本地单写者文件库。需要 Node.js 22 或更新版本。`openFileStore(directory)` 在目录中维护 `state.json` 和独占的 `writer.lock`，事务把草稿、审批、发布记录、指针及幂等回执作为一个快照提交。当前边界为 64 MiB 和 1000 条发布记录；只支持本地具备原子 rename 语义的文件系统，不支持 NFS、云同步目录或多个服务实例。

事务按调用顺序执行，读取也进入同一队列。提交先校验完整引用关系，再写同目录临时文件、同步文件、rename 到 `state.json`，最后同步目录。`beforeRename` 失败不会改变旧快照；rename 后失败返回 `commit_unknown`，该句柄停止后续写入。调用方应通过幂等回执核对提交结果，不能把该错误视为明确失败并盲目重试。

## 人工恢复

1. 停止唯一服务，备份整个存储目录（包括 `state.json`、临时文件及 `writer.lock`）。
2. 核对 `writer.lock` 中的 PID 与随机 nonce，并确认原服务进程确已退出；不要按锁文件年龄自动抢占。
3. 管理员人工移走残留的 `writer.lock`，重新调用 `openFileStore`。启动会在解析前检查快照大小，并用 `assertState` 校验结构、hash 和所有引用；损坏快照会拒绝启动，不会重置为空库。
4. 用幂等键查询对应回执确认发布是否已经落盘，再决定后续业务动作。

`fault` 注入选项只供故障测试使用，不是业务配置。

## 草稿与批准

`createOperations(store, env)` 当前提供 `listSlots`、`readSlot`、`createDraft`、`previewDraft`、`approveDraft`。调用者必须通过槽位授权；`read` 权限才能列出槽位、查看草稿或预览。草稿建立时校验树、来源与线上基线，将内容写成以 SHA-256 寻址的不可变 artifact；预览的 `previous` 固定到草稿创建时的版本。批准再次核对哈希、基线、来源及组件契约，且有效期最多 15 分钟并不得超过来源期限。草稿和批准均不会改动公开指针。发布、回滚及交付由后续阶段实现。
