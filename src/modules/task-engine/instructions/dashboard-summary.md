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
| `readyQueueTop` | Up to 15 ready tasks (id, title, priority, phase) |
| `readyQueueCount` | Full ready queue length |
| `blockedSummary` | `{ count, top }` where `top` is up to 15 blocking analysis rows |
| `suggestedNext` | Slim task summary or `null` |
| `blockingAnalysis` | Full blocking analysis list |
