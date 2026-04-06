# list-checkpoints

Read-only: list checkpoint rows from **`kit_task_checkpoints`**.

## Usage

```
workspace-kit run list-checkpoints '{}'
workspace-kit run list-checkpoints '{"taskId":"T100","limit":20}'
```

## Arguments

| Field | Type | Notes |
| --- | --- | --- |
| `taskId` | string | Optional filter. |
| `limit` | number | Default 100, max 500. |
