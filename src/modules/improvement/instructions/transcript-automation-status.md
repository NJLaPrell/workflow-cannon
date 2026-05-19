<!--
agentCapsule|v=1|command=transcript-automation-status|module=improvement|schema_only=pnpm exec wk run transcript-automation-status --schema-only '{}'
-->

# transcript-automation-status

Emit stable JSON describing transcript automation state (read-only).

## Inputs

- Optional `sourcePath` / `archivePath` overrides (for resolving configured paths in output).

## Output

- `lastSyncRunAt` / `lastIngestRunAt` from improvement module state in `workspace_module_state` (SQLite)
- Cadence and budget fields from effective config
- Pending transcript sync retry queue entries
- Current `WORKSPACE_KIT_SESSION_ID` (or `default`) for policy session grants
