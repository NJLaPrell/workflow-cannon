<!--
agentCapsule|v=1|command=reject-improvement|module=task-engine|schema_only=pnpm exec wk run reject-improvement --schema-only '{}'
-->

# reject-improvement

Intent wrapper around `run-transition` with action `reject` (`proposed` → `cancelled`).

## Usage

```
workspace-kit run reject-improvement '{"taskId":"T400","expectedPlanningGeneration":1,"policyApproval":{"confirmed":true,"rationale":"duplicate / out of scope"}}'
```

## Arguments

Same as `start-task` / `complete-task`.
