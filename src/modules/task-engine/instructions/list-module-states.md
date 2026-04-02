# list-module-states

List all rows currently stored in unified SQLite module state.

## Usage

```
workspace-kit run list-module-states '{}'
```

## Notes

- Reads from the unified SQLite database path resolved from `tasks.sqliteDatabaseRelativePath`.
- Response **`data`** includes **`rows`** (module state) and **`kitSqliteUserVersion`** (`PRAGMA user_version` when the DB file exists, else `null`).
- Intended for migration diagnostics and verification.
