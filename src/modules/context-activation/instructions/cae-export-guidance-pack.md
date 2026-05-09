<!--
agentCapsule|v=1|command=cae-export-guidance-pack|module=context-activation|schema_only=pnpm exec wk run cae-export-guidance-pack --schema-only '{}'
-->

# cae-export-guidance-pack

Read-only export of the **active** CAE registry version: all non-retired artifact and activation rows, plus optional on-disk SHA256 for artifact paths.

Tier **C** — no **`policyApproval`**.

## Usage

```
workspace-kit run cae-export-guidance-pack '{"schemaVersion":1}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |

## Returns

`ok: true`, **`code`**: `cae-export-guidance-pack-ok`, **`data`** with **`schemaVersion`**: **1** and **`pack`** (guidance pack v1: **`exportedAt`**, **`sourceVersionId`**, **`artifacts`**, **`activations`**, optional **`artifactFileHashes`**).
