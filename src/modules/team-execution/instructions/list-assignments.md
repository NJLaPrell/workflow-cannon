<!--
agentCapsule|v=1|command=list-assignments|module=team-execution|schema_only=pnpm exec wk run list-assignments --schema-only '{}'
-->

# list-assignments

```bash
workspace-kit run list-assignments '{}'
```

Optional filters: `executionTaskId`, `status` (`assigned` \| `submitted` \| `blocked` \| `reconciled` \| `cancelled`), `supervisorId`, `workerId`.

Read-only; requires kit SQLite **`user_version` ≥ 7**.
