<!--
agentCapsule|v=1|command=cae-get-trace|module=context-activation|schema_only=pnpm exec wk run cae-get-trace --schema-only '{}'
-->

# cae-get-trace

Fetch **`trace.v1`**: in-process session first; when **`kit.cae.persistence`** is **`true`**, falls back to kit SQLite **`cae_trace_snapshots`**.

## Usage

```
workspace-kit run cae-get-trace '{"schemaVersion":1,"traceId":"<id>"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `traceId` | string | yes | From **`cae-evaluate`**, **`cae-conflicts`**, or shadow preflight. |

## Returns

`cae-get-trace-ok`; **`data.storage`** is **`memory`** or **`sqlite`**; **`data.ephemeral`** is **`true`** only for memory-backed traces.
