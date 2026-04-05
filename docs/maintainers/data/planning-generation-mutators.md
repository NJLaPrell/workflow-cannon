# Planning-generation mutators (operator matrix)

Maintainer inventory: `workspace-kit run` commands that **bump** `workspace_planning_state.planning_generation` via `SqliteDualPlanningStore.withTransaction` / `persistSync`, or that **must** honor `tasks.planningGenerationPolicy` when mutating the unified SQLite row.

## CLI prelude (`planning-generation-required`)

When `tasks.planningGenerationPolicy` is **`require`**, the CLI runs an early check (before module dispatch) for commands listed in **`schemas/planning-generation-cli-prelude.json`**. Handlers may still enforce the same policy for **conditional** mutators (e.g. `build-plan` only when `persistTasks` / wishlist finalize paths write).

## Task-engine (unified task / wishlist document)

- `run-transition`, `create-task`, `create-task-from-plan`, `update-task`
- `archive-task`, `add-dependency`, `remove-dependency`
- `assign-task-phase`, `clear-task-phase`
- `update-wishlist`, `convert-wishlist`, `create-wishlist`
- `update-workspace-phase-snapshot`
- `backfill-task-feature-links`, `backup-planning-sqlite`
- `migrate-task-persistence`, `migrate-wishlist-intake`

## Improvement (task writes)

- `generate-recommendations` (non–`dryRun` paths that persist tasks)
- `ingest-transcripts` when it runs generate after sync

## Subagents / team execution (kit tables + planning bump)

- `register-subagent`, `retire-subagent`, `spawn-subagent`, `message-subagent`, `close-subagent-session`
- `register-assignment`, `submit-assignment-handoff`, `block-assignment`, `reconcile-assignment`, `cancel-assignment`

## Planning module

- `build-plan` when `outputMode` is `tasks` / wishlist finalize paths call `sqliteDual.withTransaction` (see module handler; not in CLI prelude because many branches are read-only)

## Explicit non-mutators (examples)

- Read-only task-engine commands: `list-tasks`, `get-task`, `get-next-actions`, `queue-health`, `dashboard-summary`, `agent-session-snapshot`, `replay-queue-snapshot`, …
- `document-project` / `generate-document` / agent-behavior profile commands: file or module-local state; **no** unified planning generation bump on the paths above.
