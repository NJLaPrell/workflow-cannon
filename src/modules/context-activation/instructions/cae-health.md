# cae-health

Report **`kit.cae.enabled`** (effective config), registry load status, and structured **`issues`**.

## Usage

```
workspace-kit run cae-health '{"schemaVersion":1}'
workspace-kit run cae-health '{"schemaVersion":1,"includeDetails":true}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `includeDetails` | boolean | no | When **`true`** and **`kit.cae.persistence`** is on, includes **`traceRowCount`** and **`ackRowCount`** from SQLite. |

## Returns

`cae-health-ok`; **`data`** includes **`caeEnabled`**, **`persistenceEnabled`**, **`lastEvalAt`** (ISO timestamp after any in-process CAE eval that stored a trace), registry status, and **`issues`**.
