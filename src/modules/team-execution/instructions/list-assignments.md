<!--
agentCapsule|v=1|command=list-assignments|module=team-execution|schema_only=pnpm exec wk run list-assignments --schema-only '{}'
-->

# list-assignments

```bash
workspace-kit run list-assignments '{}'
```

Optional filters: `executionTaskId`, `status` (`assigned` \| `submitted` \| `blocked` \| `reconciled` \| `cancelled`), `supervisorId`, `workerId`.

Each assignment row includes raw `metadata` plus additive `orchestrationMetadataSummary` when metadata exists, including packet-tier recommendation, packet id/digest, validation-command counts, packet registry presence, and `packetContextStatus` (`current` \| `stale` \| `missing`).

When packet metadata is present, rows also include `packetAudit` with the stored digest, the current digest rebuilt from live task/assignment context, and a `stale` boolean so orchestrators can verify whether the worker packet context has drifted.

Read-only; requires kit SQLite **`user_version` ≥ 7**.
