# cae-evaluate

Evaluate CAE activations for a v1 **`evaluationContext`**; returns effective bundle + trace. Stores an **ephemeral** session for **`cae-get-trace`** / **`cae-explain`** until process exit.

## Usage

```
workspace-kit run cae-evaluate '{"schemaVersion":1,"evaluationContext":{...}}'
```

Use a full object matching **`schemas/cae/evaluation-context.v1.json`** (see **`fixtures/cae/evaluation-context/valid/minimal.json`**).

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `evaluationContext` | object | yes | v1 evaluation context. |
| `evalMode` | string | no | **`live`** (default) or **`shadow`**. |

## Returns

`cae-evaluate-ok`; **`data`** per **`caeEvaluateData`** (**`schemas/cae/cli-read-only-data.v1.json`**), including **`ephemeral: true`**.
