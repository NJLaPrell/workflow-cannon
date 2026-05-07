<!--
agentCapsule|v=1|command=cae-retire-workspace-artifact|module=context-activation|schema_only=pnpm exec wk run cae-retire-workspace-artifact --schema-only '{}'
-->

# cae-retire-workspace-artifact

Retire a workspace-owned artifact row without deleting its backing markdown file.

## Usage

```
workspace-kit run cae-retire-workspace-artifact '{"schemaVersion":1,"actor":"operator","artifactId":"workspace.example.playbook","caeMutationApproval":{"confirmed":true,"rationale":"retire workspace artifact"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `artifactId` | string | yes | Workspace artifact id to retire. Must start with **`workspace.`**. |
| `versionId` | string | no | Defaults to active version. |
| `note` | string | no | Audit note. |
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

## Returns

`ok: true`, **`code`**: `cae-retire-workspace-artifact-ok`.

The backing markdown file is kept by default. The command fails with **`cae-artifact-in-use`** when a non-retired activation still references the artifact.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.
