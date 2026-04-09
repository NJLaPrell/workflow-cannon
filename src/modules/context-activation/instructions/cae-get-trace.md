# cae-get-trace

Fetch **`trace.v1`** from the in-process session store (ephemeral).

## Usage

```
workspace-kit run cae-get-trace '{"schemaVersion":1,"traceId":"<id>"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `traceId` | string | yes | From **`cae-evaluate`** or **`cae-conflicts`**. |

## Returns

`cae-get-trace-ok`; **`data.ephemeral`** is **`true`** when not loaded from durable store (**T867**).
