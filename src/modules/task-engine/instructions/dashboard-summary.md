# dashboard-summary

Return a single JSON payload for dashboard / cockpit UIs: task counts, ready-queue preview, blocked summary, suggested next task, and (when present) a shallow parse of `docs/maintainers/data/workspace-kit-status.yaml`.

Read-only. Does not mutate workspace state.

## Usage

```
workspace-kit run dashboard-summary '{}'
```

## Arguments

Optional JSON object; accepts standard invocation `config` overlay only (no extra fields required).

## Returns

`data` includes:

| Field | Description |
| --- | --- |
| `schemaVersion` | Always `1` for this contract |
| `taskStoreLastUpdated` | ISO timestamp from task store document |
| `workspaceStatus` | `{ currentKitPhase, nextKitPhase, activeFocus, lastUpdated, blockers[], pendingDecisions[], nextAgentActions[] }` shallow-parse from `workspace-kit-status.yaml`; file-missing yields `null` |
| `stateSummary` | Task counts by status + `total` (same shape as `get-next-actions`) |
| `proposedImprovementsSummary` | `{ schemaVersion: 1, count, top, phaseBuckets }` — `top` is up to 15 **proposed** improvement tasks globally; `phaseBuckets` mirrors the Tasks sidebar: ordered **current** / **next** phase (from maintainer YAML, including **0-count** slots), then other phase keys, then **Not Phased**; each bucket has `{ schemaVersion: 1, phaseKey, label, count, top }` where bucket `top` is up to 15 preview rows |
| `proposedExecutionSummary` | Same `phaseBuckets` shape for **proposed** non-improvement, non-wishlist tasks |
| `readyImprovementsSummary` | `{ schemaVersion: 1, count, top, phaseBuckets }` for the ready **improvement** slice |
| `readyExecutionSummary` | `{ schemaVersion: 1, count, top, phaseBuckets }` for the rest of the ready queue |
| `readyQueueTop` | Up to 15 ready tasks (id, title, priority, phase) |
| `readyQueueCount` | Full ready queue length |
| `readyQueueBreakdown` | `{ schemaVersion: 1, improvement, other }` — split of the ready queue (`improvement` = `type: improvement` or legacy `imp-*` id; `other` = remainder; wishlist intake never appears in the ready queue) |
| `blockedSummary` | `{ count, top, phaseBuckets }` — `top` is up to 15 blocking analysis rows; `phaseBuckets` groups those rows by the **blocked task’s** phase (same ordering as above) |
| `completedSummary` | `{ schemaVersion: 1, count, top, phaseBuckets }` — **completed** tasks only; same `phaseBuckets` ordering as the Tasks sidebar / ready queues; `top` is up to 15 global preview rows (operator UIs may collapse this section by default) |
| `cancelledSummary` | Same shape as `completedSummary` for **cancelled** tasks |
| `suggestedNext` | First **ready** task after priority sort, or `null` when the ready queue is empty (proposed work does not appear here) |
| `planningSession` | Shallow `build-plan` session snapshot for the dashboard, or `null` when no session file |
| `blockingAnalysis` | Full blocking analysis list |
| `dependencyOverview` | `{ schemaVersion: 1, activeTaskCount, includedTaskCount, edgeCount, truncated, perfNote, nodes, edges, mermaidFlowchart, criticalPathReady }` — active-task dependency subgraph aligned with `get-dependency-graph` edge direction (`from` depends on `to`); degrades when there are many active tasks (see `perfNote`) |
| `wishlist.openTop` | Up to 15 **open** wishlist items (`{ id, title }`); W### namespace, separate from tasks until `convert-wishlist` |
