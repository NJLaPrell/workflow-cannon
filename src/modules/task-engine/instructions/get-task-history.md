# get-task-history

Retrieve merged transition and mutation history for one task.

## Usage

```
workspace-kit run get-task-history '{"taskId":"T400","limit":50}'
```

## Arguments

- `taskId` (string, required): task ID.
- `limit` (number, optional): max records, default 50, capped at 500.
