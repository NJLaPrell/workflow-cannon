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
| `workspaceStatus` | `{ currentKitPhase, activeFocus, lastUpdated }` or file-missing yields `null` |
| `stateSummary` | Task counts by status + `total` (same shape as `get-next-actions`) |
| `proposedImprovementsSummary` | `{ schemaVersion: 1, count, top }` — `top` is up to 15 **proposed** tasks that count as improvements (`type: improvement` or `imp-*` id); **not** included in `readyQueueTop` or `suggestedNext` until promoted to `ready` |
| `readyQueueTop` | Up to 15 ready tasks (id, title, priority, phase) |
| `readyQueueCount` | Full ready queue length |
| `readyQueueBreakdown` | `{ schemaVersion: 1, improvement, other }` — split of the ready queue (`improvement` = `type: improvement` or `imp-*` id; `other` = remainder; wishlist intake never appears in the ready queue) |
| `blockedSummary` | `{ count, top }` where `top` is up to 15 blocking analysis rows |
| `suggestedNext` | First **ready** task after priority sort, or `null` when the ready queue is empty (proposed work does not appear here) |
| `planningSession` | Shallow `build-plan` session snapshot for the dashboard, or `null` when no session file |
| `blockingAnalysis` | Full blocking analysis list |
| `wishlist.openTop` | Up to 15 **open** wishlist items (`{ id, title }`); W### namespace, separate from tasks until `convert-wishlist` |
