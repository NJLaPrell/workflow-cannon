# Unified IdeaPlan model rollback (WBS-6 migration)

Use this runbook when the **migrate-ideas-to-unified-document** command (WBS-6) must be reversed and operators need the pre-migration SQLite ideas rows and plan artifact files back.

## Snapshot location

Live migrations write a timestamped backup **before any mutation**:

```text
.workspace-kit/migration-backups/<timestamp>/
  manifest.json
  ideas-export.json
  .workspace-kit/tasks/workspace-kit.db
  .workspace-kit/planning/...
```

- **`manifest.json`** — `schemaVersion`, `createdAt`, and `copiedPaths` for operator verification.
- **`ideas-export.json`** — JSON export of `workflow_ideas` rows at snapshot time.
- **SQLite + planning tree** — full copies of the task DB and `.workspace-kit/planning` directory when present.

Dry-run migration previews do **not** create snapshots.

## Preconditions

- Identify the snapshot directory to restore (newest under `.workspace-kit/migration-backups/` unless a specific incident timestamp is known).
- Stop dashboard / CLI operators from running further unified-model mutations during rollback.
- Ensure `IDEAS_UNIFIED_MODEL_ENABLED` remains **off** until the workspace is verified (see feature-flag gate below).

## Rollback script

From the workspace root:

```bash
# Preview restore paths and file counts (default)
node scripts/rollback-unified-ideas-migration.mjs --snapshot .workspace-kit/migration-backups/<timestamp>

# Apply restore (overwrites live DB + planning tree copies from snapshot)
node scripts/rollback-unified-ideas-migration.mjs --snapshot .workspace-kit/migration-backups/<timestamp> --commit
```

The script:

1. Validates `manifest.json` and expected copied paths inside the snapshot.
2. Dry-runs by default — prints what would be restored.
3. With **`--commit`**, copies snapshot DB and planning tree back into the workspace and writes a rollback receipt under the snapshot directory.

## Post-rollback verification

```bash
pnpm exec wk doctor
pnpm exec wk run list-ideas '{}'
pnpm exec wk run get-idea '{"ideaId":"<id>"}'
```

Confirm:

- Idea rows match `ideas-export.json` (titles, `linkedPlanArtifact`, status).
- Plan artifact files exist under `.workspace-kit/planning/plan-artifacts/` for linked plans.
- Dashboard shows **legacy Plan** affordances when `IDEAS_UNIFIED_MODEL_ENABLED` is false (default).

## Feature flag gate

| Surface | Control |
| --- | --- |
| Env | `IDEAS_UNIFIED_MODEL_ENABLED=1` (or `true`) |
| VS Code | `workflowCannon.ideas.unifiedModelEnabled` |

Default is **off**. Turn on only after WBS-2A–WBS-3C are deployed **and** WBS-6 migration succeeded in the target workspace.

## Related

- Command: `migrate-ideas-to-unified-document` — `src/modules/ideas/instructions/migrate-ideas-to-unified-document.md`
- Snapshot implementation: `src/modules/ideas/migrate-ideas-to-unified-document.ts` (`createMigrationSnapshotWithDb`)
- State schema degraded fallback: `src/modules/ideas/idea-plan-state-schema-loader.ts`
