# @ai-slot/operations

**English** | [简体中文](https://github.com/iannil/ai-slot-component/blob/master/packages/operations/README_zh-CN.md)

An experimental public server-side package that provides version-state validation and a local single-writer file store. The 0.x API and persisted format do not yet guarantee compatibility across versions. Requires Node.js 22 or later. `openFileStore(directory)` maintains `state.json` and an exclusive `writer.lock` in the directory. Transactions commit drafts, approvals, publication records, pointers, and idempotency receipts as a single snapshot. The current limits are 64 MiB and 1,000 publication records. Only local filesystems with atomic rename semantics are supported; NFS, cloud-synced directories, and multiple service instances are not supported.

## Installation

```bash
npm install @ai-slot/operations
```

Import `openFileStore` and `createOperations`; the workflow is described below. A complete runnable reference service is available at [`examples/managed-slot`](https://github.com/iannil/ai-slot-component/tree/master/examples/managed-slot).

## Transactions and manual recovery

Transactions execute in call order, and reads enter the same queue. A commit first validates all references, then writes a temporary file in the same directory, syncs the file, renames it to `state.json`, and finally syncs the directory. A failure at `beforeRename` leaves the previous snapshot unchanged. A failure after rename returns `commit_unknown`, and the handle stops accepting further writes. Callers should check the idempotency receipt to determine the commit outcome, rather than treating this error as a definitive failure and retrying blindly.

1. Stop the sole service and back up the entire storage directory, including `state.json`, temporary files, and `writer.lock`.
2. Check the PID and random nonce in `writer.lock` and confirm that the original service process has exited. Do not automatically take over a lock based on its age.
3. Have an administrator manually move the leftover `writer.lock` out of the directory, then call `openFileStore` again. Startup checks the snapshot size before parsing and uses `assertState` to validate the structure, hashes, and all references. A corrupt snapshot prevents startup; it is never reset to an empty store.
4. Look up the corresponding receipt using the idempotency key to confirm whether the publication was persisted before deciding on the next business action.

The `fault` injection option is for fault testing only, not application configuration.

## Drafts, publication, and public delivery

`createOperations(store, env)` is the unified entry point for governance and delivery. `listSlots(actor)` lists only slots with a policy for which the actor has `read` permission. `readSlot(actor, slotId)` returns only that slot's publication pointer and drafts. `previewDraft` and `getStatus` also require `read` permission for the slot. Draft creation validates the tree, source, and live baseline, then stores the content as an immutable artifact addressed by SHA-256. The preview's `previous` is pinned to the version at draft creation. Approval rechecks the hash, baseline, source, and component contract. Approval validity is limited to 15 minutes and must not extend beyond the source's expiry.

A complete workflow follows. Both publication and rollback require the approver to review the content hash and expiry again:

1. `createDraft(actor, { slotId, tree, baseRevision, sourceVersion })` creates a draft.
2. `previewDraft(actor, draft.id)` shows the draft, artifact hash, and differences from the baseline.
3. `approveDraft(actor, { draftId, artifactHash, expiresAt })` approves the draft.
4. `publishDraft(actor, { draftId, artifactHash, expectedRevision, idempotencyKey })` publishes atomically and returns a receipt for the new revision.
5. `deliver(slotId)` publicly delivers the current version. It accepts no administrator identity and returns no drafts, approver information, or source credentials.
6. To roll back, `prepareRollback(actor, { slotId, targetRevision, expectedRevision })` creates a new rollback draft from a historical artifact.
7. Run `previewDraft` and `approveDraft` again to review the rollback draft.
8. `rollbackSlot(actor, { draftId, artifactHash, expectedRevision, idempotencyKey })` publishes a new revision rather than moving the pointer back to an old revision number.

`deliver` returns version 1 JSON: `{ version, slot, tree, meta: { revision, artifactHash, sourceVersion, expiresAt } }`. `expiresAt` is the Unix timestamp in milliseconds stored in the artifact. All responses use `Cache-Control: no-store`. A known slot with no readable published content, or whose current source, component contract, or expiry fails validation, returns `503 { "error": "ai_unavailable" }`, allowing the page to retain its original content. Unknown slots return 404. Exceptions thrown while reading the source are normalized to `source_unavailable`; invalid source data still produces `source_invalid`. Public responses do not expose these internal details.

`getStatus(actor, slotId)` returns `{ desiredRevision, readableRevision, browserObservation }`. `desiredRevision` comes from the publication pointer and is retained even when the current source becomes invalid. `readableRevision` is populated only if the same live readability checks pass. `browserObservation` is always `null` because the server has no observation of browser rendering. Every delivery rereads the external source. An external source and a file transaction cannot be locked atomically across systems, so this package does not guarantee that the source remains unchanged after validation. This is a single-site reference implementation; it does not provide arbitrary factual or semantic verification, or automatic approval of financial promotions.

## Validation status and scope

This package does not start an HTTP service automatically or provide support for multiple instances or tenant isolation. Protocol and scripted validation have passed; validation with real operators and customer pilots has not yet been completed. Back up state before upgrading. Automatic migration of historical experimental snapshots is not guaranteed.
