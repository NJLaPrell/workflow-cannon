<!--
agentCapsule|v=1|command=cae-duplicate-artifact-to-workspace|module=context-activation|schema_only=pnpm exec wk run cae-duplicate-artifact-to-workspace --schema-only '{}'
-->

# cae-duplicate-artifact-to-workspace

Create a new workspace-owned artifact by copying the markdown body of a **default** (`cae.*`) or **workspace** (`workspace.*`) CAE artifact.

## Usage

```
workspace-kit run cae-duplicate-artifact-to-workspace '{"schemaVersion":1,"actor":"operator","sourceArtifactId":"workspace.example.source","artifactId":"workspace.example.copy","slug":"example-copy","title":"Example Copy","caeMutationApproval":{"confirmed":true,"rationale":"duplicate workspace artifact"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `sourceArtifactId` | string | yes | Source artifact id: **`cae.*`** or **`workspace.*`**. Must exist, be non-retired, and have a readable `ref.path`. |
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

`ok: true`, **`code`**: `cae-duplicate-artifact-to-workspace-ok`.

Successful responses include the new workspace artifact `path`, the copied `sourceArtifactId`, and `sourceContentHash`. Registry metadata includes `sourceNamespace` (`default` or `workspace`) plus the same duplication fields as **`cae-duplicate-default-artifact`**.

For copying **only** from shipped defaults, **`cae-duplicate-default-artifact`** remains available and unchanged.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.
