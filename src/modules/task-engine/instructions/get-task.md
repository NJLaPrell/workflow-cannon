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

## Returns

Full `TaskEntity` object including status, priority, dependencies, scope, and acceptance criteria.
