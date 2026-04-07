# migrate-task-persistence

Offline import from legacy **task** JSON into SQLite. Runtime execution uses SQLite only (**v0.40+**); `sqlite-to-json` was removed — use **`backup-planning-sqlite`** for a portable `.db` copy. Wishlist intake lives only as SQLite **`wishlist_intake`** task rows (no standalone wishlist JSON).

## Usage

```
workspace-kit run migrate-task-persistence '{"direction":"json-to-sqlite"}'
workspace-kit run migrate-task-persistence '{"direction":"json-to-unified-sqlite"}'
workspace-kit run migrate-task-persistence '{"direction":"sqlite-blob-to-relational"}'
```

## Arguments

- `direction` (required): `json-to-sqlite`, `json-to-unified-sqlite`, or `sqlite-blob-to-relational` (in-place: copy **`task_store_json`** task bodies into **`task_engine_tasks`** and set **`relational_tasks=1`**).
- `dryRun` (optional): `true` to report paths and counts without writing (supported for all directions, including **`sqlite-blob-to-relational`**).
- `force` (optional): `true` to overwrite an existing SQLite file.

Paths come from effective config: `tasks.storeRelativePath` and `tasks.sqliteDatabaseRelativePath` (default `.workspace-kit/tasks/workspace-kit.db`).

Kit default is `tasks.persistenceBackend: sqlite`. Setting `tasks.persistenceBackend` to `json` is rejected by config validation (**v0.40+**).
