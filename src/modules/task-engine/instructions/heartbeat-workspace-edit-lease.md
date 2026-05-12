<!--
agentCapsule|v=1|command=heartbeat-workspace-edit-lease|module=task-engine|schema_only=pnpm exec wk run heartbeat-workspace-edit-lease --schema-only '{}'
-->

# heartbeat-workspace-edit-lease

Extend **`expiresAt`** for an **active** lease held by the same **`agentSessionId`**. Fails when missing, expired, or held by another session.

When another session owns the lease, the denied response includes **`holder.agentSessionId`**, **`holder.taskId`**, **`holder.expiresAt`**, **`alternatives`**, one **`recommendedNextAction`**, and **`leaseStatus`**.

Sensitive: JSON **`policyApproval`**.

## Usage

```
pnpm exec wk run heartbeat-workspace-edit-lease '{"agentSessionId":"sess-1","extendLeaseSeconds":600,"policyApproval":{"confirmed":true,"rationale":"Keep lease alive during long edit"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| **`agentSessionId`** | Yes | Must match lease owner. |
| **`extendLeaseSeconds`** | No | Seconds to extend from current **`expiresAt`** (default **600**, max **86400**). |
