# ADR: Workflow Cannon State Backend Merge Surface (v1)

## Status

Accepted (Phase 137, T100193)

## Context

Task-state data currently lives in SQLite for runtime operations, while canonical git/event-log flows continue to evolve. We need an explicit bridge that supports:

- isolated proposal work that can run in parallel without mutating the visible checkout by default,
- deterministic export artifacts suitable for future branch-level merging,
- continued runtime performance from SQLite as a cache/projection layer.

## Decision

1. Introduce **isolated proposal artifacts** as first-class records under git common-dir metadata (`workflow-cannon/proposals`), including:
   - base/proposal branch,
   - worktree path,
   - task ids,
   - changed-file tracking,
   - validation evidence,
   - linked task mutation intents.
2. Surface proposal workflow through explicit actions/commands:
   - `View Diff`
   - `Apply`
   - `Open PR`
   - `Discard`
3. Add deterministic export command output for state-branch prep:
   - sorted snapshot JSON (`task-state-snapshot.sorted.json`),
   - append-only ordered event JSONL (`task-state-events.append-only.jsonl`).
4. Treat SQLite as **runtime cache + fast query surface**, while exported snapshot/event artifacts form the future **merge and replay boundary** for a `workflow-cannon/state` backend.

## Consequences

- Parallel implementation work is explicit and recoverable (no hidden background edits).
- State export artifacts are reproducible and machine-mergeable.
- Task mutation intents remain the worker-to-authority handoff primitive and are now linked from proposal metadata.
- Future state backend migration can focus on branch/replay semantics while retaining SQLite for local read/write speed.

## Follow-ons

- Add extension-native proposal cards/actions that call the new task-engine commands directly.
- Add optional authority policy checks requiring proposal validation evidence before apply/PR paths.
- Add CI checks for deterministic export drift when state schema changes.
