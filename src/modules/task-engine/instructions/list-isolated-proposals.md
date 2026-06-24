<!--
agentCapsule|v=1|command=list-isolated-proposals|module=task-engine|schema_only=pnpm exec wk run list-isolated-proposals --schema-only '{}'
-->

# list-isolated-proposals

List isolated proposal artifacts with changed files, validation evidence count, linked mutation intents, and action affordances (`View Diff`, `Apply`, `Open PR`, `Discard`).

## Arguments

- `includeDiscarded` (boolean, optional) — include discarded proposals.
- `taskId` (string, optional) — filter to a task id.

## Example

```bash
pnpm exec wk run list-isolated-proposals '{"taskId":"T100193"}'
```
