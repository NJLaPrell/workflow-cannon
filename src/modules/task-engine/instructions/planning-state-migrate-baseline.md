agentCapsule|v=1|command=planning-state-migrate-baseline|module=task-engine|schema_only=pnpm exec wk run planning-state-migrate-baseline --schema-only '{}'

# planning-state-migrate-baseline

One-shot seed of **`planning.*`** genesis events from local **`kit_phase_catalog`** + **`kit_workspace_status`** rows onto **`workflow-cannon/task-state`**.

```bash
pnpm exec wk run planning-state-migrate-baseline '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"preview planning baseline"}}'
pnpm exec wk run planning-state-migrate-baseline '{"policyApproval":{"confirmed":true,"rationale":"seed planning canonical stream"}}'
```

Fails closed when the canonical log already contains planning events unless **`overwriteExisting:true`**.
