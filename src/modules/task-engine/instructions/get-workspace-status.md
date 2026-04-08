# get-workspace-status

Read the singleton **`kit_workspace_status`** row from unified kit SQLite (requires **`PRAGMA user_version` ≥ 10**).

## Usage

```
workspace-kit run get-workspace-status '{}'
```

## Arguments

None.

## Response

- **`workspaceStatus`**: parsed row (revision, phase scalars, narrative fields, list JSON) or **`null`** when the table is absent.
- **`kitSqliteUserVersion`**: SQLite schema version for the planning database path.

See **`.ai/runbooks/workspace-status-sqlite.md`**.
