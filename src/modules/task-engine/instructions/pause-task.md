<!--
agentCapsule|v=1|command=pause-task|module=task-engine|schema_only=pnpm exec wk run pause-task --schema-only '{}'
-->

# pause-task

Intent wrapper around `run-transition` with action `pause` (`in_progress` → `ready`).

## Usage

```
workspace-kit run pause-task '{"taskId":"T400","expectedPlanningGeneration":1,"policyApproval":{"confirmed":true,"rationale":"pause for review"}}'
```

## Arguments

Same as `start-task` / `complete-task`.
