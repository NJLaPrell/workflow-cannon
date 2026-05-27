<!--
agentCapsule|v=1|command=task-state-verify|module=task-engine|schema_only=pnpm exec wk run task-state-verify --schema-only '{}'
-->

# task-state-verify

Read-only integrity verification for canonical **task-state** git layout (manifest digests, snapshot content hashes, event sequence continuity, parent chain, schema/kind admission).

## Usage

```
pnpm exec wk run task-state-verify '{}'
pnpm exec wk run task-state-verify '{"source":"local","layoutRoot":"."}'
pnpm exec wk run task-state-verify '{"source":"git","branch":"workflow-cannon/task-state"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | no | `auto` (default), `local`, or `git`. |
| `branch` | string | no | Git branch when using git/auto (default `workflow-cannon/task-state`). |
| `layoutRoot` | string | no | Workspace-relative root containing `task-state/` for local verification. |

## Returns

- `task-state-verify-passed` — no findings.
- `task-state-verify-failed` — `data.findings[]` with stable codes including `event-sequence-gap`, `event-parent-mismatch`, `manifest-digest-mismatch`, `snapshot-content-digest-mismatch`, `event-unsupported-schema-version`.

## Notes

- Read-only — no `policyApproval` required.
