# get-next-actions

Get prioritized next-action suggestions based on the current task state.

## Usage

```
workspace-kit run get-next-actions '{}'
```

## Arguments

None required.

## Returns

A `NextActionSuggestion` object containing:

- `readyQueue`: Tasks in `ready` state sorted by priority (P1 first)
- `suggestedNext`: The highest-priority ready task, or null if queue is empty
- `stateSummary`: Count of tasks in each state
- `blockingAnalysis`: Which blocked tasks are waiting on what, sorted by blocking count (most-blocked first)

## Agent Usage

Use this command to decide what to work on next without manually inspecting .workspace-kit/tasks/state.json. The `suggestedNext` field gives you the single best task to start.
