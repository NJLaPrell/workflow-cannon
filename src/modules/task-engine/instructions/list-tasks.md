# list-tasks

List tasks from the Task Engine store with optional filters.

## Usage

```
workspace-kit run list-tasks '{}'
workspace-kit run list-tasks '{"status":"ready"}'
workspace-kit run list-tasks '{"phase":"Phase 1 task engine core"}'
workspace-kit run list-tasks '{"type":"improvement","category":"reliability","tags":["ui","sqlite"]}'
workspace-kit run list-tasks '{"metadataFilters":{"owner.team":"platform","risk.level":"high"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | no | Filter by task status |
| `phase` | string | no | Filter by phase grouping |
| `type` | string | no | Filter by task type (for example `improvement`) |
| `category` | string | no | Filter by `metadata.category` |
| `tags` | string or string[] | no | Filter by `metadata.tags` (all tags must match) |
| `metadataFilters` | object | no | Safe metadata path filters; keys must match `segment(.segment)*` |
| `includeArchived` | boolean | no | Include archived tasks when `true` |

## Returns

Array of `TaskEntity` objects matching the filters. Returns all tasks if no filters are provided.
