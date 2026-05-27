<!--
agentCapsule|v=1|command=task-state-hydrate|module=task-engine|schema_only=pnpm exec wk run task-state-hydrate --schema-only '{}'
-->

# task-state-hydrate

Materialize canonical task-state history from git into `.workspace-kit/tasks/task-state-events.jsonl` and rebuild the disposable SQLite projection.

## Usage

```
pnpm exec wk run task-state-hydrate '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"preview hydrate"}}'
pnpm exec wk run task-state-hydrate '{"policyApproval":{"confirmed":true,"rationale":"hydrate from origin"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dryRun` | boolean | no | Preview segment/event counts without writes. |
| `fetch` | boolean | no | Default **true** — `git fetch origin <branch>` before read. |
| `branch` | string | no | Override branch (default `workflow-cannon/task-state`). |
| `eventLogRelativePath` | string | no | Local JSONL path override. |
| `policyApproval` | object | yes (live) | JSON approval for hydrate writes. |

## Returns

- `task-state-hydrated` — JSONL written + `rebuild-task-state-cache` succeeded.
- `task-state-branch-missing` — no resolvable ref (fetch may help).
- `task-state-fetch-failed` — fetch requested but failed.

## Notes

- Never call from dashboard render paths — use **`task-state-status`** for read-only sync checks.
