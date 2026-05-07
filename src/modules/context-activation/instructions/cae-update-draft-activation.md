<!--
agentCapsule|v=1|command=cae-update-draft-activation|module=context-activation|schema_only=pnpm exec wk run cae-update-draft-activation --schema-only '{}'
-->

# cae-update-draft-activation

Merge an activation patch into a stored `draft` activation row, keep it draft-only, and return any broad-scope authoring warnings.

## Usage

```
workspace-kit run cae-update-draft-activation '{"schemaVersion":1,"actor":"operator","activationId":"cae.activation.draft.example","activation":{"priority":2,"scope":{"conditions":[{"kind":"commandName","match":"prefix","value":"run-"}]},"lifecycleState":"draft"},"caeMutationApproval":{"confirmed":true,"rationale":"refine draft activation"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `activationId` | string | yes | Target activation id. |
| `activation` | object | no | Patch merged over the stored draft row. `lifecycleState` may be omitted or `draft`; active transitions are rejected. |
| `versionId` | string | no | Defaults to active version. |
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

## Returns

`ok: true`, **`code`**: `cae-update-draft-activation-ok`.

Successful responses include a `warnings` array when the resulting draft uses broad scopes such as `always`, command-name prefixes, or policy-family activations.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.

When the target activation is not in draft lifecycle state, the command returns **`ok: false`**, **`code: "cae-activation-not-draft"`**.
