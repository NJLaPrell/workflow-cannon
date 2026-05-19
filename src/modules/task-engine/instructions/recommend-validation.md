<!--
agentCapsule|v=1|command=recommend-validation|module=task-engine|schema_only=pnpm exec wk run recommend-validation --schema-only '{}'
-->

# recommend-validation

Return a prioritized validation plan (commands + rationale + expected delivery-evidence fields) from a task, its feature slugs, and optional touched or diff paths.

## Usage

```
pnpm exec wk run recommend-validation '{"taskId":"T400"}'
pnpm exec wk run recommend-validation '{"touchedPaths":["src/modules/task-engine/commands/foo.ts"]}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | `string` | no | Task to infer features and prior delivery evidence from. |
| `touchedPaths` | `string[]` | no | Workspace-relative paths changed in this slice. |
| `diffPaths` | `string[]` | no | Alias for path hints (merged with `touchedPaths`). |
| `features` | `string[]` | no | Extra taxonomy slugs when no task row exists. |

Provide at least one of `taskId`, `touchedPaths`, `diffPaths`, or `features`.

## Returns

`data.recommendations[]` — `priority`, `command`, `rationale`, `expectedEvidenceFields`. `data.deliveryEvidenceHint` is a starter v2 shape for `update-task` metadata.

Read-only — no `policyApproval` required.
