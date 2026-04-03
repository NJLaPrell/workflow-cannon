# get-next-actions

Get prioritized next-action suggestions based on the current task state.

## Usage

```
workspace-kit run get-next-actions '{}'
workspace-kit run get-next-actions '{"queueNamespace":"default"}'
```

## Arguments

| Field | Type | Description |
| --- | --- | --- |
| `queueNamespace` | string (optional) | When set, only tasks with matching **`metadata.queueNamespace`** are used (missing/empty metadata → **`default`**). See **`docs/maintainers/ADR-task-queue-namespace.md`**. |

Response includes **`queueNamespace`**: the filter applied, or **`null`** when unfiltered.

## Returns

A `NextActionSuggestion` object containing:

- `readyQueue`: Ready tasks (excluding wishlist intake) sorted by **priority** (P1 first), then **task id** as a tie-break. Tasks whose `dependsOn` are not all **`completed`** appear **after** runnable ready tasks (dependency-blocked ready work is secondary).
- `suggestedNext`: The first runnable ready task in that ordering, or `null` if no ready task can start (empty queue or every ready task is blocked by incomplete dependencies).
- `stateSummary`: Count of tasks in each state
- `blockingAnalysis`: Which blocked tasks are waiting on what, sorted by blocking count (most-blocked first)

The response **`data`** also includes **`planningGeneration`** (integer) when using SQLite planning persistence — monotonic optimistic-lock generation for the unified planning row.

## Agent Usage

Use this command to decide what to work on next without manually opening the raw task store (default SQLite `.workspace-kit/tasks/workspace-kit.db`; JSON `.workspace-kit/tasks/state.json` only when opted in / legacy). The `suggestedNext` field points at work that is **ready and dependency-runnable**, not merely highest priority among blocked-by-deps tasks.
