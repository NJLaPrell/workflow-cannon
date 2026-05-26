<!--
agentCapsule|v=1|command=rebuild-task-state-cache|module=task-engine|schema_only=pnpm exec wk run rebuild-task-state-cache --schema-only '{}'
-->

# rebuild-task-state-cache

Rebuild the **disposable** local SQLite task projection from the canonical **git-backed** task-state event log (JSONL). Does not mutate the event log; rewrites relational task rows, transition/mutation evidence tables, and `kit_task_state_projection_meta`.

## Usage

```
pnpm exec wk run rebuild-task-state-cache '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"preview rebuild"}}'
pnpm exec wk run rebuild-task-state-cache '{"policyApproval":{"confirmed":true,"rationale":"rebuild after cache delete"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dryRun` | boolean | no | When `true`, validate/admit/replay only; no SQLite writes. |
| `eventLogRelativePath` | string | no | Override log path (default `.workspace-kit/tasks/task-state-events.jsonl`). |
| `policyApproval` | object | yes (live) | JSON approval for sensitive rebuild. |

## Returns

`data` includes `eventCount`, `taskCount`, log counts, `appliedSequence`, `sourceCommit` (from `git rev-parse HEAD` when available), and `projectionMeta` after a live rebuild.

## Notes

- Events must pass `admitTaskStateEventStream` (schema, lifecycle, idempotency).
- Missing log file is treated as an empty stream (clears projection when not dry-run).
- Prefer `backup-planning-sqlite` before destructive recovery experiments.
