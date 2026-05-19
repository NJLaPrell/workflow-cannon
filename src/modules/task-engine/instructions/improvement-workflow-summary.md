<!--
agentCapsule|v=1|command=improvement-workflow-summary|module=task-engine|schema_only=pnpm exec wk run improvement-workflow-summary --schema-only '{}'
-->

# improvement-workflow-summary

Single read-only surface for the improvement automation loop: transcript pipeline status, scout/recommendation entry points, pending research/churn and proposed items, approval queue, recent lineage, and suggested next steps (privacy-safe summaries).

## Usage

```
pnpm exec wk run improvement-workflow-summary '{}'
```

## Arguments

None.

## Returns

`data.transcriptPipeline`, `data.improvements`, `data.entryPoints[]`, `data.lineage`, `data.suggestedNextSteps[]`.

Read-only — no `policyApproval` required.
