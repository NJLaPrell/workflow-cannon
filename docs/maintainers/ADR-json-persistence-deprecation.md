# ADR: JSON task persistence opt-out — removal (0.x execution)

## Status

**Executed in v0.40.0** — runtime JSON persistence and **`tasks.persistenceBackend: "json"`** are removed; config validation rejects **`json`**. Legacy JSON on disk is **import-only** via **`migrate-task-persistence`** (`json-to-sqlite` / `json-to-unified-sqlite`). **`sqlite-to-json`** export was removed; use **`backup-planning-sqlite`** for a portable `.db` copy.

## Context

Maintainers wanted a **single long-term persistence story** (unified SQLite with **`PRAGMA user_version`**, module state, online backup) while honoring **R003/R008** (compatibility and documented migration before breaking changes). **v0.39.0** added migrations, doctor checks, and deprecation **direction**; **v0.40.0** executes removal in **0.x** semver.

## Decision

1. **v0.40.0** — **`openPlanningStores`** is SQLite-only; improvement and agent-behavior module state **save** to **`workspace_module_state`** only (legacy JSON files may still be **read once** for migration).
2. **Config** — **`tasks.persistenceBackend`** **`allowedValues`**: **`sqlite`** only; explicit **`json`** fails **`config-invalid`** with a migration pointer.
3. **Commands** — **`get-kit-persistence-map`** returns structured paths for agents; **`migrate-wishlist-intake`** requires an existing planning SQLite DB (after **`json-to-sqlite`** if needed).
4. **Migration contract** — **`docs/maintainers/runbooks/json-to-sqlite-one-shot-upgrade.md`**, **`task-persistence-operator.md`**, **`migrate-task-persistence`** instruction.

## Consequences

- **Positive:** One runtime path; fewer dual-backend tests; clearer operator story.
- **Negative:** Consumers on JSON must migrate or pin a release before **v0.40.0**; exotic platforms still need a working **`better-sqlite3`** build.
- **Related:** [`ADR-sqlite-default-persistence.md`](./ADR-sqlite-default-persistence.md), [`ADR-task-sqlite-persistence.md`](./ADR-task-sqlite-persistence.md), [`runbooks/task-persistence-operator.md`](./runbooks/task-persistence-operator.md).
