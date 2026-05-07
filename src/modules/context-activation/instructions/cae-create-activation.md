<!--
agentCapsule|v=1|command=cae-create-activation|module=context-activation|schema_only=pnpm exec wk run cae-create-activation --schema-only '{}'
-->

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
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

## Returns

`ok: true`, **`code`**: `cae-create-activation-ok`.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.
