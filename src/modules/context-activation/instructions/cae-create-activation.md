# cae-create-activation

Insert a validated activation (**`schemas/cae/activation-definition.schema.json`**) referencing existing non-retired artifacts.

## Usage

```
workspace-kit run cae-create-activation '{"schemaVersion":1,"actor":"operator","activation":{"schemaVersion":1,"activationId":"cae.activation.test","family":"do","lifecycleState":"active","priority":1,"scope":{"conditions":[{"kind":"always"}]},"artifactRefs":[{"artifactId":"cae.playbook.machine-playbooks"}]},"caeMutationApproval":{"confirmed":true,"rationale":"add activation"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `activation` | object | yes | Full activation definition. |
| `versionId` | string | no | Defaults to active version. |

## Returns

`ok: true`, **`code`**: `cae-create-activation-ok`.
