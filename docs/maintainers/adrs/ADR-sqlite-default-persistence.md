# ADR: SQLite as default task and wishlist persistence

## Status

Accepted (**v0.25.0**).

## Context

`tasks.persistenceBackend` defaulted to `json`, so new workspaces and agents had to discover `.workspace-kit/tasks/state.json` and opt into SQLite. Maintainers wanted **one primary persistence story** aligned with Phase 15/18/24 (SQLite planning DB + unified module state) and better defaults for tooling that watches the DB path.

## Decision

1. **Kit default** — `tasks.persistenceBackend` is **`sqlite`** in `KIT_CONFIG_DEFAULTS` and config metadata. Default DB path remains `.workspace-kit/tasks/workspace-kit.db`.
2. **Opt-out** — Set **`tasks.persistenceBackend: "json"`** in project (or user) config to keep file-based task + wishlist stores.
3. **Breaking change (semver minor in 0.x)** — Upgrading without migration: if only JSON stores exist and no DB, operators must run **`workspace-kit run migrate-task-persistence`** with `direction: "json-to-sqlite"` (or pin `json`) before relying on task data. **`workspace-kit doctor`** fails closed when SQLite is configured and the DB file is missing.

## Consequences

- **Positive:** Greenfield workspaces and tests exercise the same path as SQLite-first maintainers; unified module state (improvement, agent-behavior) aligns with the default backend without extra config.
- **Negative:** Consumers on JSON-only layouts must migrate or pin `json` once when upgrading.
- **Related:** [`ADR-task-sqlite-persistence.md`](./ADR-task-sqlite-persistence.md) (mechanism); [`ADR-unified-task-store-wishlist-and-improvement-state.md`](./ADR-unified-task-store-wishlist-and-improvement-state.md) (wishlist/improvement split).
