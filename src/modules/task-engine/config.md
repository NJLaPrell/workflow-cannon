# Task Engine Config

- `storeRelativePath`: Legacy path to task JSON used only by **`migrate-task-persistence`** when importing. Default: `.workspace-kit/tasks/state.json`
- `wishlistStoreRelativePath`: Legacy path to wishlist JSON used by **`migrate-task-persistence`** / **`migrate-wishlist-intake`** when importing. Default: `.workspace-kit/wishlist/state.json`
- `persistenceBackend`: **`sqlite` only** (**v0.40+**). The **task** document is read/written from `sqliteDatabaseRelativePath` (`task_store_json`; legacy installs may still have a second wishlist column until **`migrate-wishlist-intake`** runs).
- `sqliteDatabaseRelativePath`: SQLite file path for planning + unified module state. Default: `.workspace-kit/tasks/workspace-kit.db`
- `strictValidation`: Optional runtime strict mode (default `false`). When `true`, task mutations validate the active task set before persistence and fail with `strict-task-validation-failed` on invalid task records.
- `transitions.strict`: Enforce strict lifecycle transitions (default: `true`)
- `defaultTaskType`: Default task type label for new tasks (default: `workspace-kit`)
- `autoUnblock`: Automatically unblock dependents when a task completes (default: `true`)
