# list-tasks

List tasks from the Task Engine store with optional filters.

## Usage

```
workspace-kit run list-tasks '{}'
workspace-kit run list-tasks '{"status":"ready"}'
workspace-kit run list-tasks '{"phase":"Phase 1 task engine core"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | no | Filter by task status |
| `phase` | string | no | Filter by phase grouping |

## Returns

Array of `TaskEntity` objects matching the filters. Returns all tasks if no filters are provided.
