# generate-tasks-md

Generate a read-only `docs/maintainers/TASKS.md` from the Task Engine state.

## Usage

```
workspace-kit run generate-tasks-md '{}'
workspace-kit run generate-tasks-md '{"outputPath":"docs/maintainers/TASKS.md"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `outputPath` | string | no | Output path for generated TASKS.md (defaults to `docs/maintainers/TASKS.md`) |

## Behavior

Reads task state from the engine store and produces a formatted markdown file matching the existing TASKS.md section structure (status markers, dependency fields, phase groupings). This is a write-only output — not a round-trip.

## Returns

Object with `outputPath` and `taskCount`.
