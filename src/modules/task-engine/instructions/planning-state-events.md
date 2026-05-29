agentCapsule|v=1|command=planning-state-events|module=task-engine|schema_only=n/a

# planning-state-events (Phase 119)

Planning-domain canonical events share the **`workflow-cannon/task-state`** branch and unified JSONL stream with `task.*` lifecycle events.

## Supported kinds (v1)

| kind | purpose |
| --- | --- |
| `planning.phase_catalog.upserted` | Upsert `kit_phase_catalog` row |
| `planning.phase_catalog.removed` | Remove catalog row |
| `planning.workspace_status.updated` | Patch `kit_workspace_status` singleton + audit trail |

## Envelope

Uses `task-state-event-envelope.v1.json` plus optional **`expectedWorkspaceRevision`** on `planning.workspace_status.updated`.

## Operator notes

- Hydrate/rebuild applies planning events in **shared sequence order** with tasks.
- Baseline seed: `planning-state-migrate-baseline` (when remote lacks planning tail).
- Publish hooks: `upsert-phase-catalog-entry`, `update-workspace-status` under `git-event-log` authority.
