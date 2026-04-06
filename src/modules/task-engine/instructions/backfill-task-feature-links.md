# backfill-task-feature-links

One-time maintenance: copy legacy `features_json` slugs into `task_engine_task_features`, then clear `features_json` to `[]` for touched rows. Requires relational tasks and `user_version` 5+.

## Usage

```
workspace-kit run list-tasks '{}'
workspace-kit run backfill-task-feature-links '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"dry-run backfill"},"expectedPlanningGeneration":123}'
workspace-kit run backfill-task-feature-links '{"dryRun":false,"policyApproval":{"confirmed":true,"rationale":"backfill junction"},"expectedPlanningGeneration":123}'
```

When `tasks.planningGenerationPolicy` is `require`, **every** invocation (including **`dryRun: true`**) needs **`expectedPlanningGeneration`** from your last read **and** Tier B **`policyApproval`**.

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dryRun` | boolean | no | When true, only report unknown slugs / counts |
| `policyApproval` | object | yes (when gated) | Tier B approval on the `run` argv — not env-only (required in this repo even for dry-run) |
| `expectedPlanningGeneration` | number | when policy `require` | Optimistic lock — required in this repo for dry-run and live |

## Returns

Summary with `unknownSlugsByTaskId` for slugs not in the registry.
