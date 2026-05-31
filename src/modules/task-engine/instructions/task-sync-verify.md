<!--
agentCapsule|v=1|command=task-sync-verify|module=task-engine|schema_only=pnpm exec wk run task-sync-verify --schema-only '{}'
-->

# task-sync-verify

Read-only integrity verification for canonical **task-state** git layout (manifest digests, snapshot content hashes, event sequence continuity, parent chain, schema/kind admission).

## Usage

```
pnpm exec wk run task-sync-verify '{}'
pnpm exec wk run task-sync-verify '{"source":"local","layoutRoot":"."}'
pnpm exec wk run task-sync-verify '{"source":"git","branch":"workflow-cannon/task-state"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | no | `auto` (default), `local`, or `git`. |
| `branch` | string | no | Git branch when using git/auto (default `workflow-cannon/task-state`). |
| `layoutRoot` | string | no | Workspace-relative root containing `task-state/` for local verification. |

## Returns

- `task-sync-verify-passed` — no findings.
- `task-sync-verify-failed` — `data.findings[]` with stable codes including `event-sequence-gap`, `event-parent-mismatch`, `manifest-digest-mismatch`, `snapshot-content-digest-mismatch`, `event-unsupported-schema-version`.

## Notes

- Read-only — no `policyApproval` required.
- Recovery alias: **`task-state-verify`** (same argv; prefer **`task-sync-verify`** for new scripts).
