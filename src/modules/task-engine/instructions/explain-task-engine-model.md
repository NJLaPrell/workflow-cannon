<!--
agentCapsule|v=1|command=explain-task-engine-model|module=task-engine|schema_only=pnpm exec wk run explain-task-engine-model --schema-only '{}'
-->

# explain-task-engine-model

Return a single JSON explainer for Task Engine model variants and lifecycle behavior.

## Usage

```bash
workspace-kit run explain-task-engine-model '{}'
```

## Arguments

None.

## Returns

`data` includes:

- `variants`: execution-task and wishlist-item required/optional fields and planning inclusion.
- `planningBoundary`: confirms execution queues are tasks-only.
- `executionTaskLifecycle`: allowed actions per task status (`proposed`, `ready`, `in_progress`, `blocked`, `completed`, `cancelled`).
