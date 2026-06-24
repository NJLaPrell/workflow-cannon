<!--
agentCapsule|v=1|command=export-task-state-artifacts|module=task-engine|schema_only=pnpm exec wk run export-task-state-artifacts --schema-only '{}'
-->

# export-task-state-artifacts

Emit deterministic task-state export artifacts:

- sorted snapshot JSON (`task-state-snapshot.sorted.json`)
- append-only event JSONL (`task-state-events.append-only.jsonl`)

These artifacts are designed as a future merge surface for a `workflow-cannon/state` backend while SQLite remains runtime cache.

## Arguments

- `outputDir` (string, optional; default `.workspace-kit/state-export`)
- `eventsRelativePath` (string, optional; default `.workspace-kit/tasks/task-state-events.jsonl`)
- `dryRun` (boolean, optional)

## Example

```bash
pnpm exec wk run export-task-state-artifacts '{"outputDir":".workspace-kit/state-export","dryRun":false}'
```
