# list-tasks

List tasks from the Task Engine store with optional filters.

## Usage

```
workspace-kit run list-tasks '{}'
workspace-kit run list-tasks '{"status":"ready"}'
workspace-kit run list-tasks '{"phase":"Phase 1 task engine core"}'
workspace-kit run list-tasks '{"type":"improvement","category":"reliability","tags":["ui","sqlite"]}'
workspace-kit run list-tasks '{"metadataFilters":{"owner.team":"platform","risk.level":"high"}}'
workspace-kit run list-tasks '{"phaseKey":"28","status":"ready"}'
workspace-kit run list-tasks '{"includeQueueHints":true,"status":"ready"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | no | Filter by task status |
| `phase` | string | no | Filter by exact `task.phase` string |
| `phaseKey` | string | no | Filter by stable phase key (`task.phaseKey` or inferred from `task.phase`, e.g. `28`) |
| `type` | string | no | Filter by task type (for example `improvement`) |
| `category` | string | no | Filter by `metadata.category` |
| `tags` | string or string[] | no | Filter by `metadata.tags` (all tags must match) |
| `metadataFilters` | object | no | Safe metadata path filters; keys must match `segment(.segment)*` |
| `includeArchived` | boolean | no | Include archived tasks when `true` |
| `includeQueueHints` | boolean | no | When `true`, adds `queueHintRows` (same order as `tasks`) with `phaseAligned`, `blockedByDependencies`, `unmetDependencies` |

## Returns

Object with `tasks` (array of `TaskEntity`), `count`, and `scope`. When `includeQueueHints` is true, `queueHintRows` is included. Default output shape is unchanged when the flag is omitted.
