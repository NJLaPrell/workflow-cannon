# Task persistence operator map (SQLite-only runtime)

Single place to answer: **where is data?**, **how do I import legacy JSON?**, and **how do I recover?**

## 1) Effective layout (**v0.40+**)

1. Run **`workspace-kit doctor`** (passes when contract files and persistence checks succeed).
2. Read **`Effective task persistence: sqlite`** and the DB path on the next line.
3. For a machine-readable map: **`workspace-kit run get-kit-persistence-map '{}'`**.

**`.workspace-kit/config.json`**: do not set **`tasks.persistenceBackend`** to **`json`** (rejected). Default is **sqlite** when omitted.

## 2) Paths

| Role | Location | Config keys |
| --- | --- | --- |
| **Runtime** task + wishlist documents | SQLite: **`tasks.sqliteDatabaseRelativePath`** or default **`.workspace-kit/tasks/workspace-kit.db`** — row **`workspace_planning_state`**; optional relational layout **`task_engine_tasks`** after **`migrate-task-persistence`** **`sqlite-blob-to-relational`** | `tasks.sqliteDatabaseRelativePath` |
| **Legacy import only** | Task JSON: **`tasks.storeRelativePath`** or default **`.workspace-kit/tasks/state.json`**; wishlist JSON: **`tasks.wishlistStoreRelativePath`** or default **`.workspace-kit/wishlist/state.json`** | Used by **`migrate-task-persistence`** only |
| **Module state** (improvement, agent-behavior, …) | Same SQLite file as planning: **`workspace_module_state`** | `tasks.sqliteDatabaseRelativePath` |

## 3) Recovery and moves

- **Missing SQLite file** when backend is sqlite: run **`workspace-kit run migrate-task-persistence`** with **`direction: "json-to-sqlite"`** (see command instruction), or create a fresh DB via migration from JSON; **`doctor`** errors include this hint.
- **Native addon will not load** (sqlite backend): **`docs/maintainers/runbooks/native-sqlite-consumer-install.md`**.
- **Export / portability**: **`backup-planning-sqlite`** for a **`.db`** copy; **`migrate-task-persistence`** imports **`json-to-sqlite`** / **`json-to-unified-sqlite`**, or upgrades blob-only SQLite to relational rows via **`sqlite-blob-to-relational`** (**`sqlite-to-json`** removed in **v0.40.0**). Take a backup before **`sqlite-blob-to-relational`**.
- **Blessed hot backup**: **`workspace-kit run backup-planning-sqlite`** with **`outputPath`** — uses SQLite’s online backup API (prefer over copying **`.db`** while writers are active). See **`json-to-sqlite-one-shot-upgrade.md`** for ordering with migrations.
- **Integrity**: **`workspace-kit doctor`** runs **`PRAGMA quick_check`** on the planning DB when SQLite is configured; failures link **`native-sqlite-consumer-install.md`**.
- **Optimistic lock**: **`tasks.planningGenerationPolicy`** (**`off`** / **`warn`** / **`require`**) controls whether mutating commands must include **`expectedPlanningGeneration`** (see **`doctor`** summary line and **`ADR-planning-generation-optimistic-concurrency.md`**). Maintainer clones often use **`require`**; published package default remains **`off`**.
- **Schema version**: **`PRAGMA user_version`** is owned by the kit (**`prepareKitSqliteDatabase`** / **`migrateKitSqliteSchema`** — see **`docs/maintainers/runbooks/kit-sqlite-schema-migrations.md`**). **`doctor`** persistence lines include **`Kit SQLite schema (PRAGMA user_version): N`** when the file exists; **`list-module-states`** returns **`kitSqliteUserVersion`**. New or legacy files may show **`0`** until the first read/write open runs migrations (**v0.39.0+**).
- **Concurrency**: Kit DB connections set **`busy_timeout`** (10s) to reduce flakes when **`doctor`** and **`run`** overlap; avoid long manual locks on the same file.

## 3b) One-shot JSON → SQLite

See **`docs/maintainers/runbooks/json-to-sqlite-one-shot-upgrade.md`**.

## 4) Parity expectations

Maintainers validate SQLite paths via tests and **`pnpm run parity`**; avoid hand-editing the DB except documented recovery.

## Related ADRs

- [`ADR-sqlite-default-persistence.md`](../ADR-sqlite-default-persistence.md)
- [`ADR-task-sqlite-persistence.md`](../ADR-task-sqlite-persistence.md)
- [`ADR-task-store-sqlite-document-model.md`](../ADR-task-store-sqlite-document-model.md)
- [`ADR-relational-sqlite-task-store.md`](../ADR-relational-sqlite-task-store.md)
- [`ADR-native-sqlite-consumer-distribution.md`](../ADR-native-sqlite-consumer-distribution.md)
- [`ADR-json-persistence-deprecation.md`](../ADR-json-persistence-deprecation.md)
