<!--
agentCapsule|v=1|command=list-subagents|module=subagents|schema_only=pnpm exec wk run list-subagents --schema-only '{}'
-->

# list-subagents

```bash
workspace-kit run list-subagents '{}'
workspace-kit run list-subagents '{"includeRetired":true}'
```

Lists subagent definitions from kit SQLite (`user_version` 6+). See `docs/maintainers/adrs/ADR-subagent-registry-v1.md`.
