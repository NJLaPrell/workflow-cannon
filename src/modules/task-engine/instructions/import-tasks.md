# import-tasks

One-time import of tasks from the current TASKS.md markdown file into the Task Engine JSON store.

## Usage

```
workspace-kit run import-tasks '{}'
workspace-kit run import-tasks '{"sourcePath":"docs/maintainers/TASKS.md"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `sourcePath` | string | no | Path to TASKS.md file (defaults to `docs/maintainers/TASKS.md`) |

## Behavior

Parses the markdown TASKS.md format, extracting task IDs, statuses, priorities, dependencies, scope, and acceptance criteria. After import, the engine's JSON state becomes the source of truth and TASKS.md becomes a generated read-only view.

## Returns

Import summary: `imported` count, `skipped` count, and any `errors` encountered during parsing.
