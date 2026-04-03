# Plan: Extension dashboard parity (task engine + SQLite UX)

**Status:** Active (Phase 16)  
**Tasks:** `T342`–`T344` (see task-engine state)

## Context

The Cursor extension (`extensions/cursor-workflow-cannon`) already loads task data through the Task Engine (`dashboard-summary`, `list-tasks`, `get-task`, `run-transition`) rather than reading `.workspace-kit/tasks/state.json` directly. Two gaps remain:

1. **Auto-refresh** — `StateWatcher` only watches `state.json` and `config.json`. When `tasks.persistenceBackend` is `sqlite`, mutations update the SQLite file (default `.workspace-kit/tasks/workspace-kit.db`), so the UI may stay stale until manual refresh.
2. **Dashboard richness** — `dashboard-summary` already returns wishlist counts, blocked analysis, and ready-queue previews; the webview only shows a minimal subset (phase, focus, status counts, suggested next, last updated). Phase 21 adds **`planningSession`** (in-flight `build-plan` summary + resume CLI) when `.workspace-kit/planning/build-plan-session.json` exists; the webview should stay aligned with that payload field.

A third item is **sequenced after engine work**: **`list-tasks` filters** (Phase 16 `T337`) enable the extension to pass `phase` / `type` / etc. Extension wiring is tracked as **`T344`** and **`dependsOn` `T337`**.

## Goals

| Goal | Approach |
| --- | --- |
| Reliable live updates under SQLite | Resolve effective task persistence settings (same semantics as kit config), add a filesystem watcher on the SQLite path when backend is `sqlite`, keep existing JSON watchers for `json` backend. |
| Dashboard matches engine contract | Render wishlist summary, blocked summary, and ready-queue preview from the existing `dashboard-summary` payload; preserve narrow-sidebar readability. |
| Filtered lists when API exists | After `T337`, pass supported filter args from tree/commands and align docs with `AGENT-CLI-MAP`. |

## Non-goals

- Replacing file-based maintainer templates under `tasks/*.md` (unchanged by design).
- Changing Task Engine contracts solely for the extension (`T337` owns filter semantics).

## Implementation order (suggested)

1. **`T342`** — Can land independently; unblocks accurate UX for SQLite adopters.
2. **`T343`** — Independent; improves operator visibility without backend changes.
3. **`T344`** — Start after **`T337`** completes (or in parallel once filter shapes are frozen).

## Exit criteria

- `T342`–`T344` marked **completed** in task-engine state with evidence (PR, tests, or documented manual checks per acceptance criteria).
- `pnpm run build` and extension package checks pass per `RELEASING.md` / extension maintainer workflow.

## References

- Dashboard provider: `extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts`
- State watcher: `extensions/cursor-workflow-cannon/src/runtime/state-watcher.ts`
- `dashboard-summary` handler: `src/modules/task-engine/index.ts`
- Config keys: `tasks.persistenceBackend`, `tasks.sqliteDatabaseRelativePath` (see task-engine `config.md`)
