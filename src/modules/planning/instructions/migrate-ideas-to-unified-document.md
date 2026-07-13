agentCapsule|v=1|command=migrate-ideas-to-unified-document|module=ideas|schema_only=pnpm exec wk run migrate-ideas-to-unified-document --schema-only '{}'

# migrate-ideas-to-unified-document

Promote existing **`workflow_ideas`** rows and legacy PlanArtifact JSON files into unified IdeaPlan documents. Always dry-run first; live runs snapshot to **`.workspace-kit/migration-backups/<timestamp>/`** before writes.

## Args

| Field | Required | Notes |
| --- | --- | --- |
| `dryRun` | No | Default **`true`**. Set **`false`** to write unified documents and update `linked_plan_artifact`. |
| `policyApproval` | Yes (live) | Tier B when `dryRun: false`. Dry-run is Tier C. |
| `expectedPlanningGeneration` | When policy requires | From `list-ideas` / `get-task`. |

## Procedure

1. `pnpm exec wk run migrate-ideas-to-unified-document '{"dryRun":true}'`
2. Confirm `data.outcomes` and `data.errors` are clean (`dataLossReported: false`).
3. `pnpm exec wk run migrate-ideas-to-unified-document '{"dryRun":false,"policyApproval":{"confirmed":true,"rationale":"promote legacy ideas to unified IdeaPlan documents"}}'`
4. Verify with `get-idea` on sample ids.

## Status mapping

Legacy idea / plan lifecycle signals map to unified `IdeaPlanStatus`:

- open / no artifact → `idea`
- planning / draft plan → `planning`
- reviewed plan / approval_ready → `reviewed`
- accepted / planned → `accepted`
- finalized → `delivered`

## Codes

| Code | ok | Meaning |
| --- | --- | --- |
| `ideas-unified-migration-dry-run` | true | Preview only; no writes. |
| `ideas-unified-migration-applied` | true | Snapshot + writes completed. |
| `migration-data-loss` | false | Unreadable legacy artifact; inspect `data.errors`. |
