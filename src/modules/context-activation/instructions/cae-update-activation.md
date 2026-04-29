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

## Returns

`ok: true`, **`code`**: `cae-update-activation-ok`.
