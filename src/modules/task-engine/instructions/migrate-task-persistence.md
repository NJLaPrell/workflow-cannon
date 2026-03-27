# migrate-task-persistence

Offline migration between JSON task/wishlist files and a single SQLite database that stores both documents.

## Usage

```
workspace-kit run migrate-task-persistence '{"direction":"json-to-sqlite"}'
workspace-kit run migrate-task-persistence '{"direction":"sqlite-to-json","force":true}'
```

## Arguments

- `direction` (required): `json-to-sqlite` or `sqlite-to-json`.
- `dryRun` (optional): `true` to report paths and counts without writing.
- `force` (optional): `true` to overwrite an existing SQLite file or JSON export targets.

Paths come from effective config: `tasks.storeRelativePath`, `tasks.wishlistStoreRelativePath`, and `tasks.sqliteDatabaseRelativePath` (default `.workspace-kit/tasks/workspace-kit.db`).

After `json-to-sqlite`, set `tasks.persistenceBackend` to `sqlite` in workspace config so the engine uses the database.
