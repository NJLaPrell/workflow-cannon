# ADR: Planning SQLite optimistic concurrency (`planning_generation`)

## Status

Accepted — implemented in **v0.44.0** (Phase 44).

## Context

The unified planning SQLite database (tasks + wishlist envelope + relational task rows) is a single read-modify-write surface. Concurrent writers (humans, agents, scripts) can overwrite each other’s commits (**lost updates**) even with WAL mode, because SQLite does not provide row-level application locks across processes.

## Decision

1. **One monotonic integer** `planning_generation` on `workspace_planning_state`, bumped on **every** planning mutation that goes through `SqliteDualPlanningStore` transactional persist paths.
2. **Reads** expose **`planningGeneration`** on task-engine read APIs (`get-task`, `list-tasks`, `get-next-actions`, `dashboard-summary`, etc.).
3. **Mutations** accept optional **`expectedPlanningGeneration`**. When present and not equal to the stored value before the transaction, the operation fails with **`planning-generation-mismatch`** (client should re-read and retry).
4. **Default:** Omitting **`expectedPlanningGeneration`** preserves **last-writer-wins** behavior for legacy scripts.
5. **Enforcement policy** (`planningGenerationPolicy`: off / warn / require) is **Phase 45** work (**`T581`**) — this ADR defines field names and storage only.

## Non-goals

- Multi-machine or network filesystem SQLite — **single working copy** only; operators follow existing SQLite consumer runbooks.

## Consequences

- **Kit SQLite `user_version` 3** migration adds `planning_generation INTEGER NOT NULL DEFAULT 0`.
- Consumers that want strong consistency pass **`expectedPlanningGeneration`** on every mutating `workspace-kit run` after reading **`planningGeneration`** from the prior response.
- **`T581`** will wire **`planningGenerationPolicy`** and doctor visibility without changing the additive JSON shape introduced here.

## References

- `src/core/state/workspace-kit-sqlite.ts` — migrations
- `src/modules/task-engine/sqlite-dual-planning.ts` — persist + `withTransaction`
- `docs/maintainers/runbooks/kit-sqlite-schema-migrations.md`
