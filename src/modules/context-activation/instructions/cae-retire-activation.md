<!--
agentCapsule|v=1|command=cae-retire-activation|module=context-activation|schema_only=pnpm exec wk run cae-retire-activation --schema-only '{}'
-->

# cae-retire-activation

Set **`retired_at`** on an activation row.

## Usage

```
workspace-kit run cae-retire-activation '{"schemaVersion":1,"actor":"operator","activationId":"cae.activation.test","caeMutationApproval":{"confirmed":true,"rationale":"retire"}}'
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

`ok: true`, **`code`**: `cae-retire-activation-ok`.
