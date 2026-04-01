# ADR: Task store shape in SQLite (document-first)

## Status

Accepted (**v0.30.0**).

## Context

Task and wishlist rows in **`workspace_planning_state`** store **`task_store_json`** / **`wishlist_store_json`** blobs (`TaskStoreDocument` / `WishlistStoreDocument`), not normalized task tables. That implies native SQLite operational cost without relational query benefits for arbitrary task fields.

## Decision

1. **Stay document-first** for the execution task store and wishlist artifact in SQLite for the foreseeable horizon. Hot paths remain load → mutate in memory → persist whole document; this preserves schema flexibility for task metadata and matches the JSON opt-out backend’s mental model.
2. **Do not add new undocumented SQLite column shapes** without updating **`workspace-kit doctor`** and maintainer ADRs. Table shape variants (**`legacy-dual`** vs **`task-only`**) stay explicit in code (`sqlite-dual-planning.ts`) and migration commands.
3. **If we normalize later**, it will be a **semver-minor (0.x)** migration with an explicit command, backup guidance, and parity tests for both backends — not an silent auto-migration.

## Consequences

- **Positive:** One load/save story shared with JSON persistence; fewer cross-table consistency bugs for rich task fields.
- **Negative:** Large stores pay full JSON parse/stringify; concurrency remains last-writer semantics for the blob (documented elsewhere).
- **Rollback:** Operators can export via **`migrate-task-persistence`** (**`sqlite-to-json`**) and downgrade config only after reading migration notes in **`docs/maintainers/runbooks/task-persistence-operator.md`**.
