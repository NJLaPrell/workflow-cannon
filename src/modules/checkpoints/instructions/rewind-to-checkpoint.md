# rewind-to-checkpoint

**Tier B (sensitive):** pass JSON **`policyApproval`**.

Destructive git operations:

- **`stash`**: `git stash apply <secondaryRef>` (conflicts possible).
- **`head`**: `git reset --hard <gitHeadSha>`.

Refuses when the manifest touches **`node_modules/`**, **`vendor/`**, or a **`.gitmodules`** path. Refuses on dirty worktree unless **`force`: true**.

## Usage

```
workspace-kit run rewind-to-checkpoint '{"checkpointId":"ckpt_...","force":true,"policyApproval":{"confirmed":true,"rationale":"operator rewind"}}'
```

## Arguments

| Field | Type | Notes |
| --- | --- | --- |
| `checkpointId` | string | Required. |
| `force` | boolean | Allow rewind with dirty tree (still runs guardrails above). |
| `policyApproval` | object | Required. |
