<!--
agentCapsule|v=1|command=archive-task|module=task-engine|schema_only=pnpm exec wk run archive-task --schema-only '{}'
-->

# archive-task

Archive a task without deleting it from history.

## Usage

```
workspace-kit run archive-task '{"taskId":"T400"}'
```

## Arguments

- `taskId` (string, required): task to archive.
- `actor` (string, optional): actor identifier.
