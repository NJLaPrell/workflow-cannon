# migrate-task-persistence

Offline migration between JSON task/wishlist files and a single SQLite database that stores both documents.

## Usage

```
workspace-kit run migrate-task-persistence '{"direction":"json-to-sqlite"}'
workspace-kit run migrate-task-persistence '{"direction":"json-to-unified-sqlite"}'
workspace-kit run migrate-task-persistence '{"direction":"sqlite-to-json","force":true}'
```

## Arguments

- `direction` (required): `json-to-sqlite`, `json-to-unified-sqlite`, or `sqlite-to-json`.
- `dryRun` (optional): `true` to report paths and counts without writing.
- `force` (optional): `true` to overwrite an existing SQLite file or JSON export targets.

Paths come from effective config: `tasks.storeRelativePath`, `tasks.wishlistStoreRelativePath`, and `tasks.sqliteDatabaseRelativePath` (default `.workspace-kit/tasks/workspace-kit.db`).

Kit default is `tasks.persistenceBackend: sqlite` (v0.25+). After `json-to-sqlite`, you do **not** need to set `sqlite` unless you previously pinned `json`. To stay on JSON files, set `tasks.persistenceBackend` to `json` in `.workspace-kit/config.json`.
