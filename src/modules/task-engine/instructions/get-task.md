<!--
agentCapsule|v=1|command=get-task|module=task-engine|schema_only=pnpm exec wk run get-task --schema-only '{}'
-->

# get-task

Retrieve a single task by ID from the Task Engine store.

## Usage

```
workspace-kit run get-task '{"taskId":"T184"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | string | yes | The task ID to retrieve |
| `historyLimit` | number | no | Max transition log entries to return (default `50`, cap `200`) |

## Returns

`TaskEntity` as `task`, plus `recentTransitions` (newest-first evidence for this `taskId`), and `allowedActions`: `{ action, targetStatus }[]` from the task engine transition map (for UI menus).
