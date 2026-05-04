<!--
agentCapsule|v=1|command=dismiss-phase-note|module=task-engine|schema_only=pnpm exec wk run dismiss-phase-note --schema-only '{}'
-->

# dismiss-phase-note

Mark a phase note as dismissed. **`reason` is required** for operator discipline; the MVP schema does not persist it in SQLite.

## Usage

```
workspace-kit run dismiss-phase-note '{"noteId":"<uuid>","reason":"Superseded by ADR decision."}'
```
