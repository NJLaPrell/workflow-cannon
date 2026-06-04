<!--
agentCapsule|v=1|command=dashboard-terminal-rows|module=task-engine|schema_only=pnpm exec wk run dashboard-terminal-rows --schema-only '{}'
-->

# dashboard-terminal-rows

Retrieve terminal task rows (completed/cancelled) for a given phase or overall.

## Usage

```
workspace-kit run dashboard-terminal-rows '{"status":"completed","phaseKey":"81","limit":25}'
workspace-kit run dashboard-terminal-rows '{"status":"cancelled","limit":50}'
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
