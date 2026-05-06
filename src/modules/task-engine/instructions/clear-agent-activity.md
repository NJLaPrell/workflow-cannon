<!--
agentCapsule|v=1|command=clear-agent-activity|module=task-engine|schema_only=pnpm exec wk run clear-agent-activity --schema-only '{}'
-->

# clear-agent-activity

Clear the current live dashboard status lease for an agent/session so `dashboard-summary.agentStatus` can fall back to derived status.

## Usage

```
workspace-kit run clear-agent-activity '{}'
```

Optional filters: `activityId`, `agentId`, `sessionId`, and `taskId`. Without filters, the command clears the default current lease for the resolved actor/session.

Use after completing, pausing, cancelling, or discarding work that previously recorded a live activity. Side-effect callers should treat failures as best-effort and continue the underlying workflow.