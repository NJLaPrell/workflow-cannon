<!--
agentCapsule|v=1|command=task-state-migrate-baseline|module=task-engine|schema_only=pnpm exec wk run task-state-migrate-baseline --schema-only '{}'
-->

# task-state-migrate-baseline

One-shot export of the current SQLite task store into the canonical git task-state branch (wraps `task-state-init` with count/hash report).

## Usage

```
pnpm exec wk run task-state-migrate-baseline '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"preview baseline migration"}}'
```
