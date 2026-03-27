# update-task

Update mutable task fields without changing lifecycle state.

## Usage

```
workspace-kit run update-task '{"taskId":"T400","updates":{"title":"Updated title"}}'
```

## Arguments

- `taskId` (string, required): task to update.
- `updates` (object, required): mutable fields only.
- `actor` (string, optional): actor identifier.

Immutable fields (`id`, `createdAt`, `status`) are rejected.
