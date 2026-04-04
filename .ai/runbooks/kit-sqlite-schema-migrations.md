# Kit SQLite schema versioning and migrations

**Audience:** maintainers extending workspace-kit SQLite surfaces. **Single shared entrypoint:** `prepareKitSqliteDatabase` in `src/core/state/workspace-kit-sqlite.ts`.

## Delegation graph

| Open path | Calls `prepareKitSqliteDatabase` | Notes |
| --- | --- | --- |
| Planning / task persistence (`SqliteDualPlanningStore`) | Yes | Default consumer for `.workspace-kit/tasks/*.db` layout |
| Unified module state (`UnifiedStateDb`) | Yes | Same `user_version` story as planning when paths share the kit DDL |
| Doctor / diagnostics | Reads `PRAGMA user_version` via `readKitSqliteUserVersion` | Surfaces **Kit SQLite schema (PRAGMA user_version): N** |

Do **not** add a second ad-hoc migration runner for the same files. If a new SQLite file must exist:

1. Open with `better-sqlite3` (or the kit’s existing adapter pattern).
2. Call **`prepareKitSqliteDatabase(db)`** immediately after construction.
3. Bump **`KIT_SQLITE_USER_VERSION`** only when you add a **sequential** step in **`migrateKitSqliteSchema`** (forward-only, idempotent re-open).

## Version semantics

- **`KIT_SQLITE_USER_VERSION`** — exported constant; must match the highest applied migration in `migrateKitSqliteSchema`.
- **`PRAGMA user_version`** — SQLite’s built-in stamp; set only inside the migration helper after DDL succeeds.
- Legacy **JSON task files** (e.g. `.workspace-kit/tasks/state.json`) are **import-only** for `migrate-task-persistence`; they are **not** a second schema registry (see **`docs/maintainers/runbooks/task-persistence-operator.md`**).

## Tests

- Fresh DB: `prepareKitSqliteDatabase` creates baseline tables and sets `user_version`.
- Idempotent: second call is a no-op (see `test/workspace-kit-sqlite.test.mjs`).
- Upgrade fixtures: when adding a migration, add a test that opens an on-disk DB at version *N−1* and lands on *N*.

## Related work

Reconciles Phase 39 **T527** and Phase 41 **T541** with a single documented story; future DDL extends **`migrateKitSqliteSchema`** only.

**v3 (Phase 44):** `workspace_planning_state.planning_generation` — optimistic concurrency counter; see **`docs/maintainers/ADR-planning-generation-optimistic-concurrency.md`**.
