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
