# ADR: Planning SQLite optimistic concurrency (`planning_generation`)

## Status

Accepted — storage + optional token in **v0.44.0** (Phase 44); enforcement policy + maintainer **`require`** default in **v0.45.0** (Phase 45).

## Context

The unified planning SQLite database (tasks + wishlist envelope + relational task rows) is a single read-modify-write surface. Concurrent writers (humans, agents, scripts) can overwrite each other’s commits (**lost updates**) even with WAL mode, because SQLite does not provide row-level application locks across processes.

## Decision

1. **One monotonic integer** `planning_generation` on `workspace_planning_state`, bumped on **every** planning mutation that goes through `SqliteDualPlanningStore` transactional persist paths.
2. **Reads** expose **`planningGeneration`** on task-engine read APIs (`get-task`, `list-tasks`, `get-next-actions`, `dashboard-summary`, etc.).
3. **Mutations** accept optional **`expectedPlanningGeneration`**. When present and not equal to the stored value before the transaction, the operation fails with **`planning-generation-mismatch`** (client should re-read and retry).
4. **Default:** Omitting **`expectedPlanningGeneration`** preserves **last-writer-wins** behavior for legacy scripts.
5. **Enforcement policy** — config **`tasks.planningGenerationPolicy`**: **`off`** (published default; omit token → last-writer-wins), **`warn`** (omit allowed; **`planningGenerationPolicyWarnings`** on success payloads), **`require`** (omit → **`planning-generation-required`**). **Doctor** prints the effective policy. Shipped **v0.45.0** / **`T581`**.

## Non-goals

- Multi-machine or network filesystem SQLite — **single working copy** only; operators follow existing SQLite consumer runbooks.

## Consequences

- **Kit SQLite `user_version` 3** migration adds `planning_generation INTEGER NOT NULL DEFAULT 0`.
- Consumers that want strong consistency pass **`expectedPlanningGeneration`** on every mutating `workspace-kit run` after reading **`planningGeneration`** from the prior response.
- **`clientMutationId`** idempotent **replay** paths do not re-persist and **do not** require **`expectedPlanningGeneration`** under **`require`** (documented in **`AGENT-CLI-MAP.md`**; tests in **`task-engine.test.mjs`**) — **`T584`**.

## Appendix: per-task SQL vs full-document persist (**`T580`**)

Relational **`task_engine_tasks`** rows could allow narrower **`UPDATE`**s instead of rewriting the full task envelope on every mutation, reducing blast radius for large queues. **Recommendation (Phase 45 research):** keep the current unified generation counter and transactional snapshot persist until a dedicated task profiles a measured win; splitting generations per sub-store would complicate the single optimistic-lock story. Revisit if envelope size or contention shows up in operator evidence.

## References

- `src/core/state/workspace-kit-sqlite.ts` — migrations
- `src/modules/task-engine/sqlite-dual-planning.ts` — persist + `withTransaction`
- `docs/maintainers/runbooks/kit-sqlite-schema-migrations.md`
