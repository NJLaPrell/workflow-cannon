# ADR: Task store `schemaVersion` migration policy

## Status

Accepted (**v0.30.0**).

## Context

JSON and SQLite-backed task documents carry **`schemaVersion`**. Previously only **`1`** was accepted on read; any bump required hand edits or a hard failure.

## Decision

1. **Supported read versions** — **`1`** and **`2`**. Version **`2`** is currently a **no-op forward** label: required fields match **`1`** (same `tasks`, `transitionLog`, `lastUpdated`, optional `mutationLog`). Loaders **normalize to `schemaVersion: 1`** in memory; saves write **`1`** until a future release explicitly bumps the writer.
2. **Migration hook** — **`normalizeTaskStoreDocumentFromUnknown`** in **`src/modules/task-engine/task-store-migration.ts`** is the single entry point for JSON file load, SQLite blob parse, **`migrate-task-persistence`**, and **`doctor`** validation of embedded task JSON.
3. **Future bumps** — Additive changes should migrate **load → normalize → save** with tests for idempotency and a short entry in **`docs/maintainers/workbooks/task-engine-workbook.md`**. Breaking changes require a named **`workspace-kit run`** migration command and changelog migration notes.

## Consequences

- **Positive:** Room for additive schema evolution without silent data loss; doctor and runtime share one parser.
- **Negative:** Wishlist documents remain **`schemaVersion: 1`** only until a separate policy extends them.
