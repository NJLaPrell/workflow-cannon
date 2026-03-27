# create-task

Create a task record through the Task Engine persistence path.

## Usage

```
workspace-kit run create-task '{"id":"T400","title":"My task","status":"proposed"}'
```

## Arguments

- `id` (string, required): `T<number>` task ID.
- `title` (string, required): task title.
- `status` (string, optional): `proposed` or `ready` (default `proposed`).
- Optional task fields: `type`, `priority`, `dependsOn`, `unblocks`, `phase`, `metadata`, `ownership`, `approach`, `technicalScope`, `acceptanceCriteria`, `actor`.

Known type guardrails:

- For `type: "improvement"`, Task Engine validates non-empty `acceptanceCriteria` and `technicalScope`.
- Violations return stable error code `invalid-task-type-requirements`.
