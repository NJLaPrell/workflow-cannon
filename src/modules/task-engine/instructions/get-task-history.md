<!--
agentCapsule|v=1|command=get-task-history|module=task-engine|schema_only=pnpm exec wk run get-task-history --schema-only '{}'
-->

# get-task-history

Retrieve merged transition and mutation history for one task.

## Usage

```
workspace-kit run get-task-history '{"taskId":"T400","limit":50}'
```

## Arguments

- `taskId` (string, required): task ID.
- `limit` (number, optional): max records, default 50, capped at 500.
