# Task persistence operator map (SQLite default vs JSON opt-out)

Single place to answer: **which backend am I on?**, **where is data?**, and **how do I recover?**

## 1) Determine effective backend

1. Run **`workspace-kit doctor`** (passes when contract files and persistence checks succeed).
2. Read the line starting with **`Effective task persistence:`**:
   - **`sqlite`** — unified DB file (default).
   - **`json`** — separate task + wishlist JSON files.

You can also inspect **`.workspace-kit/config.json`**: **`tasks.persistenceBackend`** is **`sqlite`** (default when omitted) or **`json`**.

## 2) Paths

| Backend | Task + wishlist data | Config keys |
| --- | --- | --- |
| **sqlite** | DB: **`tasks.sqliteDatabaseRelativePath`** or default **`.workspace-kit/tasks/workspace-kit.db`** | `tasks.persistenceBackend`, `tasks.sqliteDatabaseRelativePath` |
| **json** | Tasks: **`tasks.storeRelativePath`** or default **`.workspace-kit/tasks/state.json`**; wishlist: **`tasks.wishlistStoreRelativePath`** or default **`.workspace-kit/wishlist/state.json`** | `tasks.persistenceBackend`, `tasks.storeRelativePath`, `tasks.wishlistStoreRelativePath` |

## 3) Recovery and moves

- **Missing SQLite file** when backend is sqlite: run **`workspace-kit run migrate-task-persistence`** with **`direction: "json-to-sqlite"`** (see command instruction), or create a fresh DB via migration from JSON; **`doctor`** errors include this hint.
- **Native addon will not load** (sqlite backend): **`docs/maintainers/runbooks/native-sqlite-consumer-install.md`**.
- **Export / portability**: **`migrate-task-persistence`** supports **`sqlite-to-json`** and **`json-to-sqlite`** (see instruction docs for `force` / `dryRun`).
- **Blessed hot backup**: **`workspace-kit run backup-planning-sqlite`** with **`outputPath`** — uses SQLite’s online backup API (prefer over copying **`.db`** while writers are active). See **`json-to-sqlite-one-shot-upgrade.md`** for ordering with migrations.
- **Integrity**: **`workspace-kit doctor`** runs **`PRAGMA quick_check`** on the planning DB when SQLite is configured; failures link **`native-sqlite-consumer-install.md`**.
- **Schema version**: **`PRAGMA user_version`** is owned by the kit (centralized migrations on write). **`doctor`** persistence lines include **`Kit SQLite schema (PRAGMA user_version): N`** when the file exists; **`list-module-states`** returns **`kitSqliteUserVersion`**. New or legacy files may show **`0`** until the first read/write open runs migrations (**v0.39.0+**).
- **Concurrency**: Kit DB connections set **`busy_timeout`** (10s) to reduce flakes when **`doctor`** and **`run`** overlap; avoid long manual locks on the same file.

## 3b) One-shot JSON → SQLite

See **`docs/maintainers/runbooks/json-to-sqlite-one-shot-upgrade.md`**.

## 4) Parity expectations

Maintainers validate both backends via tests and **`pnpm run parity`** where applicable; consumers should pick one backend per workspace and avoid hand-editing stores except documented recovery.

## Related ADRs

- [`ADR-sqlite-default-persistence.md`](../ADR-sqlite-default-persistence.md)
- [`ADR-task-sqlite-persistence.md`](../ADR-task-sqlite-persistence.md)
- [`ADR-task-store-sqlite-document-model.md`](../ADR-task-store-sqlite-document-model.md)
- [`ADR-native-sqlite-consumer-distribution.md`](../ADR-native-sqlite-consumer-distribution.md)
- [`ADR-json-persistence-deprecation.md`](../ADR-json-persistence-deprecation.md)
