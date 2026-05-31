<!--
agentCapsule|v=1|command=task-sync-hydrate|module=task-engine|schema_only=pnpm exec wk run task-sync-hydrate --schema-only '{}'
-->

# task-sync-hydrate

Materialize canonical task-state history from git into `.workspace-kit/tasks/task-state-events.jsonl` and rebuild the disposable SQLite projection.

## Usage

```
pnpm exec wk run task-sync-hydrate '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"preview hydrate"}}'
pnpm exec wk run task-sync-hydrate '{"policyApproval":{"confirmed":true,"rationale":"hydrate from origin"}}'
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

- `task-sync-hydrated` — JSONL written + `rebuild-task-sync-cache` succeeded.
- `task-sync-branch-missing` — no resolvable ref (fetch may help).
- `task-sync-fetch-failed` — fetch requested but failed.

## Notes

- Never call from dashboard render paths — use **`task-sync-status`** for read-only sync checks.
- Recovery alias: **`task-state-hydrate`** (same argv and policy; prefer **`task-sync-hydrate`** for new scripts).
