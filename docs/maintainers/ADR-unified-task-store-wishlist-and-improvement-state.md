# ADR: Unified task store for wishlist; improvement operational state separate from `tasks[]`

## Status

Accepted (Phase 24 planning).

## Context

Today the kit persists **wishlist** items in a dedicated **Wishlist** namespace with ids `W###` (`WishlistStoreDocument`), while **tasks** use strict `T###` ids (`TaskStoreDocument`). SQLite mode stores two JSON columns (`task_store_json`, `wishlist_store_json`). Planning and CLI flows cross both stores.

The **improvement** module mixes concerns: human-facing work is already modeled as Task Engine tasks (`type: "improvement"`), while **ingestion and pipeline mechanics** (cursors, retry queues, bounded-run bookkeeping) live in a separate operational artifact (e.g. `.workspace-kit/improvement/state.json`). That split is healthy logically but spans multiple persistence shapes and paths.

Maintainers want **one primary intake surface** for durable work items (tasks only), **without** folding improvement **pipeline** state into the task row model.

## Decision

### 1. Wishlist ids and storage (Option B)

- **Do not** keep `W###` as first-class ids after migration.
- **Migrate** every wishlist item to a **new `T###` task** allocated by the normal task id rules.
- Preserve provenance in **task `metadata`**, e.g. `legacyWishlistId: "W1"` (exact key name to be fixed in implementation; must be stable and documented in TERMS / strict validation notes).
- Represent wishlist-origin work with an explicit **task type** or equivalent machine-readable discriminator agreed in Phase 24 implementation (so queries can filter “wishlist backlog” vs execution queue without resurrecting `W###`).

### 2. Reasonable unification (improvement)

- Prefer **one persistence backend** per workspace configuration (e.g. unified SQLite planning DB already used for module state in Phase 18).
- **Do not** model improvement **pipeline / ingest operational state** as ordinary rows in `tasks[]`. Keep a **separate logical document** (dedicated table row or registered module-state blob) owned by the improvement module for cursors, retries, and similar mechanics.
- **Do** keep human-governed improvement **work items** as Task Engine tasks (`type: "improvement"`) where that already matches the product contract.

### 3. Backwards compatibility

- **No** long-term dual-read of legacy wishlist artifacts after the migration has been run for a workspace.
- **No** requirement to accept new `W###` ids post-migration; callers migrate forward once.

## Migration story (one-time)

**Audience:** maintainers and automated upgrade/migrate commands.

**Preconditions**

- Backup workspace kit state (JSON files and/or SQLite DB) before running migration.
- Workspace on a kit version that ships the migration command (Phase 24 deliverable).

**Steps (ordered)**

1. **Read** legacy wishlist payload from the configured backend (JSON `wishlist.json` and/or SQLite `wishlist_store_json`).
2. **For each** wishlist item, **create** a task with a new `T###` id, carrying `metadata.legacyWishlistId` (or chosen key) and fields mapped from the wishlist record per the implementation mapping table.
3. **Rewrite** persistence to **drop** the dedicated wishlist store:
   - JSON: remove or empty the wishlist file and stop writing it.
   - SQLite: **transactionally** remove the `wishlist_store_json` column or stop populating it (exact schema change is an implementation detail; must leave a single coherent task document row).
4. **Relocate** improvement **operational** state into the unified module-state row for improvement (if not already there), without merging that blob into `task_store_json.tasks`.
5. **Validate** with `workspace-kit doctor` and task-engine strict validation; run test/parity suite for the release.

**Idempotency**

- The migration is intended to run **once** per workspace. Implementation **should** detect already-migrated workspaces (e.g. absence of legacy wishlist data + presence of tasks carrying `legacyWishlistId`) and **no-op** or **fail closed with a clear code**—maintainers choose explicit `force` only if we add it later.

**Failure**

- If migration fails mid-transaction (SQLite), roll back and leave legacy artifacts untouched.
- If partial JSON writes occurred, restore from backup; do not leave a workspace in a half-migrated state without documented recovery.

## Consequences

- **Positive:** Single id namespace (`T###`) for durable work; simpler mental model for agents and dashboards; wishlist provenance still auditable via metadata; improvement pipeline state stays out of the task lifecycle graph.
- **Negative:** Breaking change for any external tool that assumed `W###` ids or a separate wishlist file; requires a coordinated release note and one-time operator action.
- **Follow-up:** Update CLI map, TERMS, extension/dashboard filters, parity fixtures, and `convert-wishlist` semantics to operate on tasks-only intake.

## Related

- `docs/maintainers/ADR-task-sqlite-persistence.md` (prior dual-column JSON decision—superseded for wishlist by this ADR after migration).
- Phase 18 unified SQLite / module state registration (storage mechanism for improvement operational document).
