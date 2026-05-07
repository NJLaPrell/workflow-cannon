<!--
agentCapsule|v=1|command=cae-create-artifact|module=context-activation|schema_only=pnpm exec wk run cae-create-artifact --schema-only '{}'
-->

# cae-create-artifact

Insert a validated artifact row (**`schemas/cae/registry-entry.v1.json`**) into the active or **`versionId`** registry version.

## Usage

```
workspace-kit run cae-create-artifact '{"schemaVersion":1,"actor":"operator","artifact":{"schemaVersion":1,"artifactId":"cae.test.x","artifactType":"playbook","ref":{"path":".ai/README.md"},"title":"x"},"caeMutationApproval":{"confirmed":true,"rationale":"add artifact"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `artifact` | object | yes | Full registry artifact entry. |
| `versionId` | string | no | Defaults to active version. |
| `note` | string | no | Audit note. |
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

## Returns

`ok: true`, **`code`**: `cae-create-artifact-ok`.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.
