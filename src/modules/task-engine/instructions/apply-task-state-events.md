<!--
agentCapsule|v=1|command=apply-task-state-events|module=task-engine|schema_only=pnpm exec wk run apply-task-state-events --schema-only '{}'
-->

# apply-task-state-events

Incrementally apply canonical task-state events from the JSONL log that are **newer than** `kit_task_state_projection_meta.applied_sequence`. No-ops when the projection is already current.

## Usage

```
pnpm exec wk run apply-task-state-events '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"preview tail apply"}}'
pnpm exec wk run apply-task-state-events '{"policyApproval":{"confirmed":true,"rationale":"apply new events"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dryRun` | boolean | no | Preview tail apply without SQLite writes. |
| `eventLogRelativePath` | string | no | Override log path (default `.workspace-kit/tasks/task-state-events.jsonl`). |
| `policyApproval` | object | yes (live) | JSON approval for sensitive apply. |

## Returns

- `task-state-events-already-current` when `applied_sequence` equals the log tail (no planning generation bump).
- `task-state-events-applied` when one or more tail events were applied (projection meta updated once).
- `task-state-projection-ahead-of-log` when metadata is ahead of the log (run `rebuild-task-state-cache`).

## Notes

- Tail events are admitted against the prior stream (sequence ≤ stored cursor) before apply.
- Full relational persist is used for the merged document after tail replay.
