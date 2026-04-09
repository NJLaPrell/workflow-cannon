# cae-conflicts

Run evaluation and return **`conflictShadowSummary`** + **`traceId`** (read-only). Stores ephemeral session like **`cae-evaluate`**.

## Usage

```
workspace-kit run cae-conflicts '{"schemaVersion":1,"evaluationContext":{...}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `evaluationContext` | object | yes | v1 evaluation context. |
| `evalMode` | string | no | **`live`** / **`shadow`**. |

## Returns

`cae-conflicts-ok`; **`data`** matches **`caeConflictsData`**.
