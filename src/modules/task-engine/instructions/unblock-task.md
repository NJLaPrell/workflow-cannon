<!--
agentCapsule|v=1|command=unblock-task|module=task-engine|schema_only=pnpm exec wk run unblock-task --schema-only '{}'
-->

# unblock-task

Intent wrapper around `run-transition` with action `unblock` (`blocked` → `ready`).

## Usage

```
workspace-kit run unblock-task '{"taskId":"T400","expectedPlanningGeneration":1,"policyApproval":{"confirmed":true,"rationale":"dependency cleared"}}'
```

## Arguments

Same as `start-task` / `complete-task`.
