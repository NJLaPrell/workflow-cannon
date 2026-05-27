<!--
agentCapsule|v=1|command=task-state-snapshot|module=task-engine|schema_only=pnpm exec wk run task-state-snapshot --schema-only '{}'
-->

# task-state-snapshot

Create a point-in-time snapshot of the SQLite task projection on the canonical `workflow-cannon/task-state` branch.

## Usage

```
pnpm exec wk run task-state-snapshot '{"dryRun":true}'
pnpm exec wk run task-state-snapshot '{"policyApproval":{"confirmed":true,"rationale":"create snapshot"}}'
```
