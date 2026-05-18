<!--
agentCapsule|v=1|command=completion-preflight|module=task-engine|schema_only=pnpm exec wk run completion-preflight --schema-only '{}'
-->

# completion-preflight

Evaluate whether a task can run **`run-transition` `complete`** and return copy-paste remediation commands for each blocker.

## Usage

```
pnpm exec wk run completion-preflight '{"taskId":"T400"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | `string` | yes | Task to evaluate. |
| `actor` | `string` | no | Optional actor label recorded on findings. |

## Returns

`data.passed` is `true` when no error-severity findings remain. `data.findings[]` lists severity, code, message, and optional `remediationCommand` per issue. When clear, `data.completeWhenClear` is a sample **`run-transition`** argv including `expectedPlanningGeneration` and `policyApproval`.

Read-only — no `policyApproval` required.
