<!--
agentCapsule|v=1|command=cae-health|module=context-activation|schema_only=pnpm exec wk run cae-health --schema-only '{}'
-->

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

`cae-health-ok`; **`data`** includes **`caeEnabled`**, **`persistenceEnabled`**, **`lastEvalAt`** (ISO timestamp after any in-process CAE eval that stored a trace), **`registryStore`**, registry status, and **`issues`**.

When the registry loads successfully, **`data`** also includes **`registryContentHash`**, **`artifactCount`**, **`activationCount`**, and **`activeRegistryVersionId`** (when kit SQLite has an active CAE registry version).

When **`includeDetails`** is **`true`** and **`kit.cae.persistence`** is on, adds **`traceRowCount`** and **`ackRowCount`** from SQLite. If durable traces exist but **`lastEvalAt`** is `null`, the command adds **`lastEvalAtNote`** because `lastEvalAt` is process-local while trace rows are persisted.
