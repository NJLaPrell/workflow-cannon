<!--
agentCapsule|v=1|command=claim-workspace-edit-lease|module=task-engine|schema_only=pnpm exec wk run claim-workspace-edit-lease --schema-only '{}'
-->

# claim-workspace-edit-lease

Claim or **renew** the workspace edit lease file at **`$GIT_COMMON_DIR/workflow-cannon/leases/workspace-edit.json`** using a temp file plus atomic rename. Refuses when another **`agentSessionId`** holds a **non-expired** lease.

Sensitive: pass JSON **`policyApproval`** (see `.ai/POLICY-APPROVAL.md`).

## Usage

```
pnpm exec wk run claim-workspace-edit-lease '{"agentSessionId":"sess-1","leaseTtlSeconds":1800,"policyApproval":{"confirmed":true,"rationale":"Taking edit lease before mutating files"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| **`agentSessionId`** | Yes | Caller session identifier; must match holder to renew. |
| **`taskId`** | No | Optional task id for audit metadata. |
| **`leaseTtlSeconds`** | No | TTL in seconds from now (default **1800**, max **86400**). |

## Response

Returns **`workspace-edit-lease-claimed`** or **`workspace-edit-lease-renewed`** with **`data.lease`** and **`leaseFilePath`**, or **`workspace-edit-lease-held`** when denied.

Denied responses include compact recovery metadata: **`holder.agentSessionId`**, **`holder.taskId`**, **`holder.expiresAt`**, **`alternatives`**, **`recommendedNextAction`**, and **`leaseStatus`**. They do not ask agents to reload broad instructions or poll aggressively.
