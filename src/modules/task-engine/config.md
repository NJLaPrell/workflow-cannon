# Task Engine Config

- `storeRelativePath`: Path to the task store JSON file when `persistenceBackend` is `json`. Default: `.workspace-kit/tasks/state.json`
- `wishlistStoreRelativePath`: Path to the wishlist JSON file when `persistenceBackend` is `json`. Default: `.workspace-kit/wishlist/state.json`
- `persistenceBackend`: `json` (default) or `sqlite`. When `sqlite`, both tasks and wishlist are read/written from `sqliteDatabaseRelativePath`.
- `sqliteDatabaseRelativePath`: SQLite file path when `persistenceBackend` is `sqlite`. Default: `.workspace-kit/tasks/workspace-kit.db`
- `strictValidation`: Optional runtime strict mode (default `false`). When `true`, task mutations validate the active task set before persistence and fail with `strict-task-validation-failed` on invalid task records.
- `transitions.strict`: Enforce strict lifecycle transitions (default: `true`)
- `defaultTaskType`: Default task type label for new tasks (default: `workspace-kit`)
- `autoUnblock`: Automatically unblock dependents when a task completes (default: `true`)
