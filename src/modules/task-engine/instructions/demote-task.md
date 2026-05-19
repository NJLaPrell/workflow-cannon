<!--
agentCapsule|v=1|command=demote-task|module=task-engine|schema_only=pnpm exec wk run demote-task --schema-only '{}'
-->

# demote-task

Intent wrapper around `run-transition` with action `demote` (`ready` → `proposed`).

## Usage

```
workspace-kit run demote-task '{"taskId":"T400","expectedPlanningGeneration":1,"policyApproval":{"confirmed":true,"rationale":"needs re-triage"}}'
```

## Arguments

Same as `start-task` / `complete-task`.
