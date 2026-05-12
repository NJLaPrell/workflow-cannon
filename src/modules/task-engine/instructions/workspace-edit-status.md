<!--
agentCapsule|v=1|command=workspace-edit-status|module=task-engine|schema_only=pnpm exec wk run workspace-edit-status --schema-only '{}'
-->

# workspace-edit-status

Read-only: parse **`workspace-edit.json`** under git common-dir and return **`present` / `active` / `staleOrInvalid`** plus the full **`document`** when valid.

The additive **`leaseStatus`** object is the stable extension/agent vocabulary:

- **`lease-free`**: no lease file exists.
- **`lease-held-by-me`**: an active lease is held by the supplied **`agentSessionId`**.
- **`lease-held-by-other`**: an active lease is held by a different session, or no caller session was supplied.
- **`stale-invalid`**: a lease file exists but is expired, malformed, unreadable, or otherwise invalid.

When a holder is known, **`leaseStatus.holder`** includes **`agentSessionId`**, **`taskId`**, and **`expiresAt`**. **`heldByCaller`** is **`true`**, **`false`**, or **`null`** when no caller session was supplied.

## Usage

```
pnpm exec wk run workspace-edit-status '{}'
pnpm exec wk run workspace-edit-status '{"agentSessionId":"sess-1"}'
```
