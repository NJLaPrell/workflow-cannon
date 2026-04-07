# Task Engine Config

- `storeRelativePath`: Legacy path to task JSON used only by **`migrate-task-persistence`** when importing. Default: `.workspace-kit/tasks/state.json`
- `persistenceBackend`: **`sqlite` only** (**v0.40+**). The **task** document is read/written from `sqliteDatabaseRelativePath`: either **`task_store_json`** only (**`relational_tasks=0`**) or relational **`task_engine_tasks`** + envelope columns after **`migrate-task-persistence`** **`sqlite-blob-to-relational`** (**v0.41+**). A legacy **`wishlist_store_json`** column (if present) is collapsed into **`wishlist_intake`** tasks when the planning store opens.
- `sqliteDatabaseRelativePath`: SQLite file path for planning + unified module state. Default: `.workspace-kit/tasks/workspace-kit.db`
- `strictValidation`: Optional runtime strict mode (default `false`). When `true`, task mutations validate the active task set before persistence and fail with `strict-task-validation-failed` on invalid task records.
- `transitions.strict`: Enforce strict lifecycle transitions (default: `true`)
- `defaultTaskType`: Default task type label for new tasks (default: `workspace-kit`)
- `autoUnblock`: Automatically unblock dependents when a task completes (default: `true`)
