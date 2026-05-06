<!--
agentCapsule|v=1|command=set-agent-activity|module=task-engine|schema_only=pnpm exec wk run set-agent-activity --schema-only '{}'
-->

# set-agent-activity

Set a short-lived live dashboard status lease. This is for high-signal workflow boundaries only; do not call it from read-only polling commands.

## Usage

```
workspace-kit run set-agent-activity '{"kind":"working_task","taskId":"T400","command":"run-transition"}'
```

Common kinds: `planning`, `working_task`, `blocked`, `validating`, `reviewing_item`, `reviewing_pr`, `releasing`, `awaiting_policy_approval`, and `awaiting_human_gate`.

Optional fields: `label`, `agentId`, `sessionId`, `activityId`, `taskId`, `command`, `phaseKey`, `prNumber`, `version`, `details`, and `ttlSeconds`. If `label` is omitted, workspace-kit generates a short label from structured fields. TTL defaults to 10 minutes and is clamped between 30 seconds and 1 hour.

Failures are explicit for this command. Callers that are recording activity as a side effect should treat failures as best-effort and continue the underlying workflow.