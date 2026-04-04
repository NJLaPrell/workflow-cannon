# backfill-task-feature-links

One-time maintenance: copy legacy `features_json` slugs into `task_engine_task_features`, then clear `features_json` to `[]` for touched rows. Requires relational tasks and `user_version` 5+.

## Usage

```
workspace-kit run backfill-task-feature-links '{"dryRun":true}'
workspace-kit run backfill-task-feature-links '{"policyApproval":{"confirmed":true,"rationale":"backfill junction"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dryRun` | boolean | no | When true, only report unknown slugs / counts |
| `policyApproval` | object | yes (live) | Tier A approval when not dry-run |

## Returns

Summary with `unknownSlugsByTaskId` for slugs not in the registry.
