# Task Engine Module

Phase 1 core module for structured task lifecycle management.

## Capabilities

- **Task schema**: Typed `TaskEntity` with status, priority, dependencies, scope, acceptance criteria, optional `phaseKey` for stable phase audits, and human `phase` labels
- **Lifecycle transitions**: Six states (`proposed`, `ready`, `in_progress`, `blocked`, `completed`, `cancelled`) with guard-validated transitions (including **`demote`**: `ready` → `proposed`; see `instructions/run-transition.md`)
- **Guard system**: Pluggable `TransitionGuard` hooks with built-in `state-validity` and `dependency-check` guards
- **Auto-unblock**: Dependents automatically move `blocked → ready` when all deps complete
- **Persistence**: Config-driven — **SQLite** only (`tasks.persistenceBackend: sqlite`); document blob **`task_store_json`** or relational **`task_engine_tasks`** after **`migrate-task-persistence`** **`sqlite-blob-to-relational`** (**v0.41+**); see `config.md`, `persistence/planning-open.ts`, `persistence/sqlite-dual-planning.ts`, maintainer ADR **`ADR-relational-sqlite-task-store.md`**
- **Related kit tables**: Subagent registry (**`user_version` ≥ 6**) and team assignments (**`user_version` ≥ 7**) live in the same unified DB; see **`get-kit-persistence-map`** and **`docs/maintainers/ADR-team-execution-v1.md`**
- **Evidence**: Every transition produces a timestamped `TransitionEvidence` record
- **Next-action suggestions**: Priority-sorted ready queue with blocking chain analysis
- **Wishlist (ideation)**: Legacy `W###` path and **`wishlist_intake`** tasks; see maintainer runbooks
- **Run API schemas**: Versioned command argument/response contracts in `schemas/task-engine-run-contracts.schema.json` (kept in sync with command registration by `scripts/check-task-engine-run-contracts.mjs`)

## Commands

| Command | Description |
| --- | --- |
| `run-transition` | Execute a validated task status transition |
| `get-task` | Retrieve a single task by ID |
| `list-tasks` | List tasks with optional status/phase filters |
| `get-ready-queue` | Get ready tasks sorted by priority |
| `get-next-actions` | Get prioritized next-action suggestions (optional `queueNamespace` filter) |
| `queue-git-alignment` | Read-only heuristic: git HEAD vs last transition; stale `in_progress` hints |
| `replay-queue-snapshot` | Read-only replay of next-actions against frozen `tasks[]` or snapshot file |
| `queue-health` | Read-only ready-queue audit (phase alignment + unmet `dependsOn` on ready tasks) |
| `dashboard-summary` | Cockpit JSON for UIs (includes maintainer status snapshot) |
| `create-wishlist` / `list-wishlist` / `get-wishlist` / `update-wishlist` | Wishlist ideation (no task phase) |
| `convert-wishlist` | Promote a wishlist item into one or more tasks; closes wishlist as `converted` |

## Public API boundary

- **Stable for cross-module use:** import planning persistence and shared types from **`src/core/planning/index.js`** (facade) rather than deep `task-engine` internals when possible.
- **Task-engine barrel (`src/modules/index.ts`):** re-exports selected symbols (`taskEngineModule`, `TaskStore`, wishlist helpers, …) for CLI wiring and integrators — see **`docs/maintainers/module-build-guide.md` → Barrel export policy**.
- **Internals:** `task-engine-internal.ts` holds module registration and `onCommand` dispatch; shared mutation/idempotency helpers live in **`mutation-utils.ts`**; `index.ts` is the package-facing export surface.

## Architecture

```
index.ts                 Re-exports module + shared types/helpers
task-engine-internal.ts  Registration + onCommand dispatch
mutation-utils.ts        Idempotency digests, metadata path reads, conversion helpers
types.ts                 Core type definitions
transitions.ts           Allowed transition map, guards, TransitionValidator
service.ts               TransitionService (orchestrates transitions + auto-unblock)
suggestions.ts           Next-action suggestion engine
persistence/             Task + wishlist stores, SQLite dual store, migrations, kit map runtimes
wishlist/                Wishlist types, validation, intake helpers, wishlist command handler
dashboard/               Maintainer status YAML + dashboard-summary data builders
queue/                   Queue health, git alignment, snapshot replay helpers
instructions/            Markdown instruction files for each command
```

## Concurrency semantics

- `TaskStore` is designed for single-workspace use with atomic file replace on save (`write tmp` -> `rename`) when using JSON files; SQLite uses transactional updates via the planning store.
- Multi-writer behavior is best-effort: concurrent writers do not produce partial JSON, but last-writer-wins can overwrite another writer's in-memory view.
- `transitionLog` and `tasks` updates are therefore deterministic for one active writer process; cross-process orchestration should serialize writes through one `workspace-kit` command path.
- Policy traces (`.workspace-kit/policy/traces.jsonl`) append one JSON line per event; concurrent appends must remain line-delimited JSON, but ordering between processes is not guaranteed.
