<!--
agentCapsule|v=1|command=cae-duplicate-default-artifact|module=context-activation|schema_only=pnpm exec wk run cae-duplicate-default-artifact --schema-only '{}'
-->

# cae-duplicate-default-artifact

Create a new workspace-owned artifact by copying the body of a shipped default CAE artifact.

## Usage

```
workspace-kit run cae-duplicate-default-artifact '{"schemaVersion":1,"actor":"operator","sourceArtifactId":"cae.playbook.machine-playbooks","artifactId":"workspace.machine-playbooks.copy","slug":"machine-playbooks-copy","title":"Machine Playbooks Copy","caeMutationApproval":{"confirmed":true,"rationale":"duplicate default artifact"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `sourceArtifactId` | string | yes | Default-owned artifact id to copy. Must start with **`cae.`**. |
| `artifactId` | string | yes | New workspace artifact id. Must start with **`workspace.`**. |
| `title` | string | no | Optional title for the new artifact. Defaults to the source title, then the workspace artifact id. |
| `slug` | string | no | File stem under `.ai/cae/artifacts/<type>/`. Defaults to the new artifact id suffix after **`workspace.`**. |
| `tags` | array | no | Optional non-empty string tags for the new artifact. Defaults to copied source tags when available. |
| `fragment` | string | no | Optional markdown fragment for the new artifact ref. Defaults to the source fragment when available. |
| `versionId` | string | no | Defaults to active version. |
| `note` | string | no | Audit note. |
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

## Returns

`ok: true`, **`code`**: `cae-duplicate-default-artifact-ok`.

Successful responses include the new workspace artifact `path`, the copied `sourceArtifactId`, and a `sourceContentHash` capturing the copied default body. The command stores the source artifact id and content hash in the new artifact metadata and audit payload while leaving the default registry row and source file unchanged.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.
