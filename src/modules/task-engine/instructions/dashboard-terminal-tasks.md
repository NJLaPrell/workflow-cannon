<!--
agentCapsule|v=1|command=dashboard-terminal-tasks|module=task-engine|schema_only=pnpm exec wk run dashboard-terminal-tasks --schema-only '{}'
-->

# dashboard-terminal-tasks

Retrieve terminal task rows (completed/cancelled) for a given phase or overall (focused lazy-loading command).

## Usage

```
workspace-kit run dashboard-terminal-tasks '{"status":"completed","phaseKey":"81","limit":25}'
workspace-kit run dashboard-terminal-tasks '{"status":"cancelled","limit":50}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | yes | Filter by terminal status (`completed` or `cancelled`) |
| `phaseKey` | string | no | Stable phase key filter (use `__no_phase__` for tasks with no phase) |
| `limit` | number | no | Maximum number of tasks to return (default 50) |
| `cursor` | string | no | Pagination cursor token |

## Returns

Object with `tasks`, `count`, and optional `nextCursor` for paginated fetching of terminal tasks.
