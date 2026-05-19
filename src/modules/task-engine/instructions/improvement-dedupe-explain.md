<!--
agentCapsule|v=1|command=improvement-dedupe-explain|module=task-engine|schema_only=pnpm exec wk run improvement-dedupe-explain --schema-only '{}'
-->

# improvement-dedupe-explain

Surface similar improvement / transcript-churn tasks, `metadata.evidenceKey` overlaps, lineage events, and a suggested triage action (`accept`, `reject`, `merge-review`, `defer`).

## Usage

```
pnpm exec wk run improvement-dedupe-explain '{"taskId":"T500"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | `string` | yes | Proposed or research improvement task to evaluate. |

## Returns

`data.similarityClusters[]`, `data.lineage`, and `data.recommendation` with `action`, `rationale`, and `linkedTaskIds`.

Read-only — no `policyApproval` required.
