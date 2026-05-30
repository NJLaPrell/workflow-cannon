<!--
agentCapsule|v=1|command=task-sync-snapshot|module=task-engine|schema_only=pnpm exec wk run task-sync-snapshot --schema-only '{}'
-->

# task-sync-snapshot

Create a point-in-time snapshot of the SQLite task projection on the canonical `workflow-cannon/task-state` branch.

## Usage

```
pnpm exec wk run task-sync-snapshot '{"dryRun":true}'
pnpm exec wk run task-sync-snapshot '{"policyApproval":{"confirmed":true,"rationale":"create snapshot"}}'
```

## Notes

- Recovery alias: **`task-state-snapshot`** (same argv and policy; prefer **`task-sync-snapshot`** for new scripts).
