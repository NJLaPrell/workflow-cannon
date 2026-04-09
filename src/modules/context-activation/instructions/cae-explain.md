# cae-explain

Produce an **`explain-response.v1`** from a session **`traceId`** or inline **`evaluationContext`** replay.

## Usage

```
workspace-kit run cae-explain '{"schemaVersion":1,"traceId":"<from-cae-evaluate>"}'
workspace-kit run cae-explain '{"schemaVersion":1,"evaluationContext":{...},"level":"verbose"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `traceId` | string | one of | Session id from **`cae-evaluate`** / **`cae-conflicts`**. |
| `evaluationContext` | object | one of | Replay path when **`traceId`** omitted. |
| `evalMode` | string | no | **`live`** / **`shadow`** (replay only). |
| `level` | string | no | **`summary`** (default) or **`verbose`**. |

## Returns

`cae-explain-ok`; **`data.explanation`** matches **`explain-response.v1.json`**.
