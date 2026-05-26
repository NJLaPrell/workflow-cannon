<!--
agentCapsule|v=1|command=repair-task-state-cache|module=task-engine|schema_only=pnpm exec wk run repair-task-state-cache --schema-only '{}'
-->

# repair-task-state-cache

Validate local SQLite projection health against the canonical JSONL event log. When **stale**, returns remediation pointing at `apply-task-state-events`. When **corrupt** or **ahead-of-log**, runs `rebuild-task-state-cache` by default (does not mutate the canonical log).

## Usage

```
pnpm exec wk run repair-task-state-cache '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"inspect projection health"}}'
pnpm exec wk run repair-task-state-cache '{"policyApproval":{"confirmed":true,"rationale":"repair corrupt cache"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dryRun` | boolean | no | Report health only; no rebuild. |
| `autoRebuild` | boolean | no | When `false`, return remediation without rebuild (default `true` for corrupt/ahead). |
| `eventLogRelativePath` | string | no | Override canonical log path. |
| `policyApproval` | object | yes (live rebuild) | Required when a rebuild runs. |

## Doctor

`workspace-kit doctor` surfaces `task-state-projection-stale` and `task-state-projection-corrupt` issues with recommended commands.
