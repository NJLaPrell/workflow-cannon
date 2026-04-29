<!--
agentCapsule|v=1|command=backup-planning-sqlite|module=task-engine|schema_only=pnpm exec wk run backup-planning-sqlite --schema-only '{}'
-->

# backup-planning-sqlite

Online backup of the configured planning SQLite database (`tasks.sqliteDatabaseRelativePath` or default `.workspace-kit/tasks/workspace-kit.db`) using the native SQLite backup API (`better-sqlite3`). Use this instead of raw file copies while kit commands may write to the DB.

## Usage

```
workspace-kit run backup-planning-sqlite '{"outputPath":"artifacts/planning-backup.db"}'
```

Absolute `outputPath` is allowed. Relative paths resolve from the workspace root.

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `outputPath` | string | yes | Destination file for the backup (created/overwritten). |

## Notes

- Requires `tasks.persistenceBackend` **sqlite** and an existing database file (same preconditions as `workspace-kit doctor` for SQLite).
- For audit bundles, `scripts/export-evidence-bundle.mjs` may include the live DB path; for a consistent snapshot under write load, run this command first into a path under `artifacts/`, then zip.
