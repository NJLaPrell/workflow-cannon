<!--
agentCapsule|v=1|command=cae-create-workspace-artifact|module=context-activation|schema_only=pnpm exec wk run cae-create-workspace-artifact --schema-only '{}'
-->

# cae-create-workspace-artifact

Create a workspace-owned markdown artifact under `.ai/cae/artifacts/` and insert the matching CAE registry row in one mutation.

## Usage

```
workspace-kit run cae-create-workspace-artifact '{"schemaVersion":1,"actor":"operator","artifactId":"workspace.example.playbook","artifactType":"playbook","title":"Example Playbook","slug":"example-playbook","contentMarkdown":"# Example Playbook\n","tags":["ops"],"caeMutationApproval":{"confirmed":true,"rationale":"author workspace artifact"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `artifactId` | string | yes | Workspace artifact id. Must start with **`workspace.`**. |
| `artifactType` | string | yes | Workspace artifact type. Must be one of the supported workspace-owned CAE artifact kinds. |
| `title` | string | yes | Artifact title used for the registry row and default markdown heading. |
| `slug` | string | no | File stem under `.ai/cae/artifacts/<type>/`. Defaults to the artifact id suffix after **`workspace.`**. |
| `contentMarkdown` | string | no | Markdown body written to disk. Defaults to **`# <title>`** when omitted. |
| `tags` | array | no | Optional non-empty string tags copied into registry metadata. |
| `fragment` | string | no | Optional markdown fragment stored on the artifact ref. |
| `versionId` | string | no | Defaults to active version. |
| `note` | string | no | Audit note. |
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

## Returns

`ok: true`, **`code`**: `cae-create-workspace-artifact-ok`.

The command writes exactly one markdown file and one registry row on success. When the registry insert or validation fails after file creation, the temporary workspace file is removed before returning the error.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.
