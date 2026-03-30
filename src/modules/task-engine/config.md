# Task Engine Config

- `storeRelativePath`: Path to the task store JSON file when `persistenceBackend` is `json`. Default: `.workspace-kit/tasks/state.json` (used only when opting out of SQLite)
- `wishlistStoreRelativePath`: Legacy path to the **old** wishlist JSON file (pre–Phase 24). Used only by **`migrate-wishlist-intake`** and **`migrate-task-persistence`** when reading legacy rows. Default: `.workspace-kit/wishlist/state.json`
- `persistenceBackend`: `sqlite` (default) or `json` (explicit opt-out). When `sqlite`, the **task** document is read/written from `sqliteDatabaseRelativePath` (`task_store_json`; legacy installs may still have a second wishlist column until **`migrate-wishlist-intake`** runs).
- `sqliteDatabaseRelativePath`: SQLite file path when `persistenceBackend` is `sqlite`. Default: `.workspace-kit/tasks/workspace-kit.db`
- `strictValidation`: Optional runtime strict mode (default `false`). When `true`, task mutations validate the active task set before persistence and fail with `strict-task-validation-failed` on invalid task records.
- `transitions.strict`: Enforce strict lifecycle transitions (default: `true`)
- `defaultTaskType`: Default task type label for new tasks (default: `workspace-kit`)
- `autoUnblock`: Automatically unblock dependents when a task completes (default: `true`)
