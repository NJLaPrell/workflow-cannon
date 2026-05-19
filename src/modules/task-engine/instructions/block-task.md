<!--
agentCapsule|v=1|command=block-task|module=task-engine|schema_only=pnpm exec wk run block-task --schema-only '{}'
-->

# block-task

Intent wrapper around `run-transition` with action `block`.

## Usage

```
workspace-kit run block-task '{"taskId":"T400","expectedPlanningGeneration":1,"policyApproval":{"confirmed":true,"rationale":"blocked on external dependency"}}'
```

## Arguments

Same as `start-task` / `complete-task` (`taskId`, `expectedPlanningGeneration`, `clientMutationId`, `actor`, `policyApproval`).
