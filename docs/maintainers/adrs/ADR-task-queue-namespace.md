# ADR: Task queue namespace (`metadata.queueNamespace`)

## Status

Accepted — Phase 35 spike (**`T513`**).

## Context

Some teams want **filtered** ready-queue views (e.g. squad A vs squad B) without a second priority system. The task engine already has a single global ordering (priority, id).

## Decision

- Optional string field **`metadata.queueNamespace`** on execution tasks.
- Tasks **without** the field (or empty string) belong to namespace **`default`**.
- **`get-next-actions`** and **`get-ready-queue`** accept optional JSON arg **`queueNamespace`**. When set, only tasks in that namespace are considered for `readyQueue`, `suggestedNext`, `stateSummary`, and `blockingAnalysis` for that call.
- Ordering **within** a namespace is unchanged: **P1 → P2 → P3**, then stable tie-break.

## Consequences

- **Cross-namespace `dependsOn`:** if task **A** (namespace `alpha`) depends on task **B** in another namespace, **B** is not visible in the filtered task set — blocking analysis may be **wrong** until deps are shared or both tasks use a compatible namespace. Prefer shared deps in **`default`** or duplicate visibility via **`list-tasks`**.
- **Dashboard / `queue-health`:** unfiltered unless extended later; this ADR covers the **`queueNamespace`** spike on **next-actions** surfaces only.
- **No second source of truth** for priority: namespace is a **partition**, not a parallel ranking.

## References

- **`src/modules/task-engine/suggestions.ts`** — `getTaskQueueNamespace`, `filterTasksByQueueNamespace`, `getNextActions` options.
- **`docs/maintainers/runbooks/planning-workflow.md`** — estimate pack (**`T523`**) uses separate metadata keys.
