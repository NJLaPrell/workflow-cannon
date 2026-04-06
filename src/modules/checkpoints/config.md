# Checkpoints module configuration

Checkpoints persist in unified **kit SQLite** (`tasks.sqliteDatabaseRelativePath`) when **`PRAGMA user_version` ≥ 9**.

## Related workspace keys

- **`kit.autoCheckpoint`** — opt-in snapshot before selected `workspace-kit run` commands (see `.ai/adrs/ADR-task-linked-checkpoints-v1.md`).
