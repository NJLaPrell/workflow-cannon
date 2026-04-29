<!--
agentCapsule|v=1|command=cae-conflicts|module=context-activation|schema_only=pnpm exec wk run cae-conflicts --schema-only '{}'
-->

# cae-conflicts

Run evaluation and return **`conflictShadowSummary`** + **`traceId`** (read-only). Stores ephemeral session like **`cae-evaluate`**.

## Usage

```
workspace-kit run cae-conflicts '{"schemaVersion":1,"evaluationContext":{...}}'
workspace-kit run cae-conflicts '{"schemaVersion":1,"evalMode":"shadow","evaluationContext":{"schemaVersion":1,"task":{"taskId":"T921","status":"in_progress","phaseKey":"70","tags":["cae"]},"command":{"name":"document-project","moduleId":"documentation","argvSummary":"{\"options\":{\"dryRun\":true}}"},"workspace":{"currentKitPhase":"70"},"governance":{"policyApprovalRequired":false,"approvalTierHint":"C"},"queue":{"readyQueueDepth":0},"mapSignals":null}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `evaluationContext` | object | yes | v1 evaluation context. |
| `evalMode` | string | no | **`live`** / **`shadow`**. |

## Returns

`cae-conflicts-ok`; **`data`** matches **`caeConflictsData`**.
