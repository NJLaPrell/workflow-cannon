<!--
agentCapsule|v=1|command=cae-update-activation|module=context-activation|schema_only=pnpm exec wk run cae-update-activation --schema-only '{}'
-->

# cae-update-activation

Merge **`activation`** patch into a stored non-retired activation row and re-validate.

## Usage

```
workspace-kit run cae-update-activation '{"schemaVersion":1,"actor":"operator","activationId":"cae.activation.test","activation":{"priority":2},"caeMutationApproval":{"confirmed":true,"rationale":"reprioritize"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `activationId` | string | yes | Target activation id. |
| `activation` | object | no | Patch merged over stored row. |
| `versionId` | string | no | Defaults to active version. |
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

## Returns

`ok: true`, **`code`**: `cae-update-activation-ok`.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.
