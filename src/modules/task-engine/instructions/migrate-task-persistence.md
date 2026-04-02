# migrate-task-persistence

Offline import from legacy JSON task/wishlist files into SQLite. Runtime execution uses SQLite only (**v0.40+**); `sqlite-to-json` was removed — use **`backup-planning-sqlite`** for a portable `.db` copy.

## Usage

```
workspace-kit run migrate-task-persistence '{"direction":"json-to-sqlite"}'
workspace-kit run migrate-task-persistence '{"direction":"json-to-unified-sqlite"}'
```

## Arguments

- `direction` (required): `json-to-sqlite` or `json-to-unified-sqlite`.
- `dryRun` (optional): `true` to report paths and counts without writing.
- `force` (optional): `true` to overwrite an existing SQLite file.

Paths come from effective config: `tasks.storeRelativePath`, `tasks.wishlistStoreRelativePath`, and `tasks.sqliteDatabaseRelativePath` (default `.workspace-kit/tasks/workspace-kit.db`).

Kit default is `tasks.persistenceBackend: sqlite`. Setting `tasks.persistenceBackend` to `json` is rejected by config validation (**v0.40+**).
