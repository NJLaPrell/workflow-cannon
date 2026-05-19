<!--
agentCapsule|v=1|command=accept-improvement|module=task-engine|schema_only=pnpm exec wk run accept-improvement --schema-only '{}'
-->

# accept-improvement

Intent wrapper around `run-transition` with action `accept` (`proposed` → `ready`). Use for **`type: improvement`** (and other intake types) without memorizing lifecycle action names.

## Usage

```
workspace-kit run accept-improvement '{"taskId":"T400","expectedPlanningGeneration":1,"policyApproval":{"confirmed":true,"rationale":"promote improvement to ready"}}'
```

## Arguments

Same as `start-task` / `complete-task`. Intake guards on `accept` still apply (`resolve-task-intake-policy` when enforcement is on).
