# Task Engine Module

Phase 1 core module for structured task lifecycle management.

## Capabilities

- **Task schema**: Typed `TaskEntity` with status, priority, dependencies, scope, and acceptance criteria
- **Lifecycle transitions**: Six states (`proposed`, `ready`, `in_progress`, `blocked`, `completed`, `cancelled`) with guard-validated transitions
- **Guard system**: Pluggable `TransitionGuard` hooks with built-in `state-validity` and `dependency-check` guards
- **Auto-unblock**: Dependents automatically move `blocked → ready` when all deps complete
- **Persistence**: File-backed JSON store at `.workspace-kit/tasks/state.json` with atomic writes
- **Evidence**: Every transition produces a timestamped `TransitionEvidence` record
- **TASKS.md generation**: Generates a read-only `docs/maintainers/TASKS.md` from engine state
- **Import**: One-time parser imports existing TASKS.md into the engine's JSON state
- **Next-action suggestions**: Priority-sorted ready queue with blocking chain analysis

## Commands

| Command | Description |
| --- | --- |
| `run-transition` | Execute a validated task status transition |
| `get-task` | Retrieve a single task by ID |
| `list-tasks` | List tasks with optional status/phase filters |
| `get-ready-queue` | Get ready tasks sorted by priority |
| `import-tasks` | One-time import from TASKS.md |
| `generate-tasks-md` | Generate read-only TASKS.md from engine state |
| `get-next-actions` | Get prioritized next-action suggestions |

## Architecture

```
index.ts          Module registration + onCommand dispatch
types.ts          Core type definitions
transitions.ts    Allowed transition map, guards, TransitionValidator
store.ts          File-backed JSON TaskStore
service.ts        TransitionService (orchestrates transitions + auto-unblock)
generator.ts      TASKS.md markdown generator
importer.ts       TASKS.md parser for one-time import
suggestions.ts    Next-action suggestion engine
instructions/     Markdown instruction files for each command
```
