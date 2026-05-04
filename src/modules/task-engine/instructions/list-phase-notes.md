<!--
agentCapsule|v=1|command=list-phase-notes|module=task-engine|schema_only=pnpm exec wk run list-phase-notes --schema-only '{}'
-->

# list-phase-notes

List phase notes for a stable `phaseKey` with optional filters. Returns bounded projections (not raw SQLite rows).

## Usage

```
workspace-kit run list-phase-notes '{"phaseKey":"78"}'
workspace-kit run list-phase-notes '{"phaseKey":"78","status":"active","limit":20}'
```
