<!--
agentCapsule|v=1|command=cae-disable-activation|module=context-activation|schema_only=pnpm exec wk run cae-disable-activation --schema-only '{}'
-->

# cae-disable-activation

Set **`lifecycle_state`** to **`disabled`** for a non-retired activation.

## Usage

```
workspace-kit run cae-disable-activation '{"schemaVersion":1,"actor":"operator","activationId":"cae.activation.test","caeMutationApproval":{"confirmed":true,"rationale":"disable"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `activationId` | string | yes | Target activation. |
| `versionId` | string | no | Defaults to active version. |

## Returns

`ok: true`, **`code`**: `cae-disable-activation-ok`.
