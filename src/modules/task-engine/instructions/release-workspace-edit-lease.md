<!--
agentCapsule|v=1|command=release-workspace-edit-lease|module=task-engine|schema_only=pnpm exec wk run release-workspace-edit-lease --schema-only '{}'
-->

# release-workspace-edit-lease

Remove the lease file when the caller is the holder, or when **`recoverStaleLease:true`** and the lease is **expired** (stale recovery).

When release is denied because another active session owns the lease, the response includes **`holder.agentSessionId`**, **`holder.taskId`**, **`holder.expiresAt`**, **`alternatives`**, one **`recommendedNextAction`**, and **`leaseStatus`**.

Sensitive: JSON **`policyApproval`**.

## Usage

```
pnpm exec wk run release-workspace-edit-lease '{"agentSessionId":"sess-1","policyApproval":{"confirmed":true,"rationale":"Edit finished"}}'
pnpm exec wk run release-workspace-edit-lease '{"recoverStaleLease":true,"policyApproval":{"confirmed":true,"rationale":"Clear expired orphan lease"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| **`agentSessionId`** | One of | Required unless **`recoverStaleLease`**. |
| **`recoverStaleLease`** | One of | When **`true`**, removes **expired** leases even if caller is not the recorded holder. Refused while lease is still active. |
