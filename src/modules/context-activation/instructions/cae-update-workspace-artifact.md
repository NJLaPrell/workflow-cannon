<!--
agentCapsule|v=1|command=cae-update-workspace-artifact|module=context-activation|schema_only=pnpm exec wk run cae-update-workspace-artifact --schema-only '{}'
-->

# cae-update-workspace-artifact

Update a workspace-owned artifact row and its backing markdown file in one mutation.

## Rename or move (safe path change)

To **rename** the markdown file (new stem under the same artifact type directory) or **move** across supported workspace artifact types, call this command with a new **`slug`** and/or **`artifactType`** (via **`artifact.artifactType`** or top-level **`artifactType`**). The implementation writes the destination file first, commits the registry `path` update in SQLite, then removes the previous file — activation references stay keyed by **`artifactId`**, not by path.

For **retired** rows only, use **`cae-archive-retired-workspace-artifact-file`** to park markdown under **`.ai/cae/artifacts/_archive/…`**, or **`cae-hard-delete-retired-workspace-artifact-file`** with **`confirmAdvancedHardDelete: true`** for irreversible removal (tombstone stub).

## Usage

```
workspace-kit run cae-update-workspace-artifact '{"schemaVersion":1,"actor":"operator","artifactId":"workspace.example.playbook","artifact":{"title":"Updated Example Playbook","artifactType":"playbook","tags":["ops","release"]},"slug":"updated-example-playbook","contentMarkdown":"# Updated Example Playbook\n","caeMutationApproval":{"confirmed":true,"rationale":"edit workspace artifact"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `artifactId` | string | yes | Workspace artifact id. Must start with **`workspace.`**. |
| `artifact` | object | no | Patch surface for registry-backed fields. Supported fields are `title`, `artifactType`, `tags`, and `ref.fragment`. |
| `slug` | string | no | Optional new file stem under `.ai/cae/artifacts/<type>/`. When changed, the command writes the new file path and removes the old file after the registry update succeeds. |
| `contentMarkdown` | string | no | Optional full markdown body to write. When omitted, the existing file body is preserved. |
| `fragment` | string | no | Optional shorthand for `artifact.ref.fragment`. |
| `artifactType` | string | no | Optional shorthand for `artifact.artifactType`. |
| `title` | string | no | Optional shorthand for `artifact.title`. |
| `tags` | array | no | Optional shorthand for `artifact.tags`. Must be an array of non-empty strings. |
| `versionId` | string | no | Defaults to active version. |
| `note` | string | no | Audit note. |
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

The effective markdown body after the merge (new `contentMarkdown` or existing file contents) must pass the same structural checks as **`cae-create-workspace-artifact`**: non-empty, at least one **H1**, and when a fragment is set on the ref, a matching `## <fragment>` heading. Failures return **`cae-workspace-artifact-markdown-*`** codes.

## Returns

`ok: true`, **`code`**: `cae-update-workspace-artifact-ok`.

Successful responses include the updated artifact `path`, an `impactedActivationIds` array listing non-retired activations that reference the artifact, and a `warnings` array when those activations will observe the updated artifact content.

The command rejects default-owned artifact ids, preserves the existing markdown body when `contentMarkdown` is omitted, and removes any newly written replacement file if registry validation fails before commit.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.
