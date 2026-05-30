<!--
agentCapsule|v=1|command=task-sync-compact|module=task-engine|schema_only=pnpm exec wk run task-sync-compact --schema-only '{}'
-->

# task-sync-compact

Dry-run retention/compaction plan for canonical task-state history (`dryRun` defaults to **true**).

## Usage

```
pnpm exec wk run task-sync-compact '{}'
```

## Notes

- Recovery alias: **`task-state-compact`** (same argv and policy; prefer **`task-sync-compact`** for new scripts).
