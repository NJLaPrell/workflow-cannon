# Task Engine Module

Phase 1 core module for structured task lifecycle management.

## Capabilities

- **Task schema**: Typed `TaskEntity` with status, priority, dependencies, scope, and acceptance criteria
- **Lifecycle transitions**: Six states (`proposed`, `ready`, `in_progress`, `blocked`, `completed`, `cancelled`) with guard-validated transitions
- **Guard system**: Pluggable `TransitionGuard` hooks with built-in `state-validity` and `dependency-check` guards
- **Auto-unblock**: Dependents automatically move `blocked → ready` when all deps complete
- **Persistence**: File-backed JSON store at `.workspace-kit/tasks/state.json` with atomic writes
- **Evidence**: Every transition produces a timestamped `TransitionEvidence` record
- **Next-action suggestions**: Priority-sorted ready queue with blocking chain analysis
- **Wishlist (ideation)**: Separate namespace `W###` persisted at `.workspace-kit/wishlist/state.json`, with strict intake and `convert-wishlist` into phased `T###` tasks (see `docs/maintainers/runbooks/wishlist-workflow.md`)
- **Run API schemas**: Versioned command argument/response contracts in `schemas/task-engine-run-contracts.schema.json` (kept in sync with command registration by `scripts/check-task-engine-run-contracts.mjs`)

## Commands

| Command | Description |
| --- | --- |
| `run-transition` | Execute a validated task status transition |
| `get-task` | Retrieve a single task by ID |
| `list-tasks` | List tasks with optional status/phase filters |
| `get-ready-queue` | Get ready tasks sorted by priority |
| `get-next-actions` | Get prioritized next-action suggestions |
| `create-wishlist` / `list-wishlist` / `get-wishlist` / `update-wishlist` | Wishlist ideation (no task phase) |
| `convert-wishlist` | Promote a wishlist item into one or more tasks; closes wishlist as `converted` |

## Architecture

```
index.ts          Module registration + onCommand dispatch
types.ts          Core type definitions
transitions.ts    Allowed transition map, guards, TransitionValidator
store.ts          File-backed JSON TaskStore
wishlist-store.ts File-backed JSON WishlistStore
service.ts        TransitionService (orchestrates transitions + auto-unblock)
suggestions.ts    Next-action suggestion engine
instructions/     Markdown instruction files for each command
```

## Concurrency semantics

- `TaskStore` is designed for single-workspace use with atomic file replace on save (`write tmp` -> `rename`).
- Multi-writer behavior is best-effort: concurrent writers do not produce partial JSON, but last-writer-wins can overwrite another writer's in-memory view.
- `transitionLog` and `tasks` updates are therefore deterministic for one active writer process; cross-process orchestration should serialize writes through one `workspace-kit` command path.
- Policy traces (`.workspace-kit/policy/traces.jsonl`) append one JSON line per event; concurrent appends must remain line-delimited JSON, but ordering between processes is not guaranteed.
