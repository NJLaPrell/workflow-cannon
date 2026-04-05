# ADR: Relational SQLite rows for task bodies (Phase 41)

## Status

Accepted (**v0.41.0**).

## Context

[`ADR-task-store-sqlite-document-model.md`](./ADR-task-store-sqlite-document-model.md) locked a **document-first** task blob (`task_store_json`) for flexibility and parity with the JSON opt-out backend. That remains valid for **JSON persistence** and for **legacy SQLite** rows until operators migrate.

As the queue grew, whole-document parse/stringify cost and lack of indexable columns (status, `phase_key`, queue namespace) limited operability without changing the on-disk contract.

## Decision

1. **Introduce a first-class relational layout** in the unified planning SQLite file:
   - Table **`task_engine_tasks`**: one row per `TaskEntity` with typed columns, JSON overflow columns for arrays, optional promoted columns (`queue_namespace`, `evidence_key`, `evidence_kind`), and **`metadata_json`** for remaining metadata.
   - Envelope row **`workspace_planning_state` id=1** gains **`transition_log_json`**, **`mutation_log_json`**, and **`relational_tasks`** (0 = blob mode, 1 = relational mode). Wishlist remains JSON in **`wishlist_store_json`** when **`legacy-dual`** shape exists; otherwise unchanged wishlist handling.
2. **No silent upgrade**: moving from blob-only to relational requires an explicit **`migrate-task-persistence`** direction **`sqlite-blob-to-relational`** (with **`dryRun`** / normal backup guidance). Fresh databases created on **v0.41.0+** may ship with **`relational_tasks=0`** until migrated; new installs after migration code may default to relational after first successful migration only — **default remains blob until operator runs migrate** to preserve surprise-free upgrades.
3. **Semver**: Shipped as **minor** (**`v0.41.0`**): additive schema and command; existing blob-only workspaces keep working until they opt into relational migration.
4. **Determinism and reversibility** (`.ai/PRINCIPLES`): migration runs in a transaction; row counts vs in-memory task list are validated; operators should use **`backup-planning-sqlite`** before migrate.

## Relationship to prior ADR

- **Supersedes** document-first SQLite as the **recommended** long-term shape **after** **`sqlite-blob-to-relational`**; the document-first ADR remains historical context and governs **JSON file** persistence.
- **Cross-links**: [`ADR-task-store-sqlite-document-model.md`](./ADR-task-store-sqlite-document-model.md), [`task-persistence-operator.md`](../runbooks/task-persistence-operator.md), **`PRAGMA user_version`** (**`workspace-kit-sqlite.ts`**).

## Consequences

- **Positive:** Index-friendly filters; smaller hot writes potential; clearer doctor diagnostics for table presence.
- **Negative:** Two SQLite layouts to test (blob vs relational); migration step required for existing DBs.
- **Rollback:** Restore from **`backup-planning-sqlite`**; no automatic down-migration to blob-only in this release.
