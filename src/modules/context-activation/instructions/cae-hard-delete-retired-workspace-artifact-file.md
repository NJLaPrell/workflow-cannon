<!--
agentCapsule|v=1|command=cae-hard-delete-retired-workspace-artifact-file|module=context-activation|schema_only=pnpm exec wk run cae-hard-delete-retired-workspace-artifact-file --schema-only '{}'
-->

# cae-hard-delete-retired-workspace-artifact-file

**Destructive:** unlink the retired workspace artifact markdown (when present), then write a small **tombstone** stub under **`.ai/cae/artifacts/_archive/_tombstones/`** and point the registry row at it so path validation stays consistent.

**`confirmAdvancedHardDelete` must be boolean `true`.** Still requires **`caeMutationApproval`**.

## Usage

```
workspace-kit run cae-hard-delete-retired-workspace-artifact-file '{"schemaVersion":1,"actor":"operator","artifactId":"workspace.example.playbook","confirmAdvancedHardDelete":true,"caeMutationApproval":{"confirmed":true,"rationale":"operator confirmed hard delete"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `artifactId` | string | yes | Retired workspace artifact id. |
| `confirmAdvancedHardDelete` | boolean | yes | Must be **`true`** or the command returns **`cae-hard-delete-confirmation-required`**. |
| `versionId` | string | no | Defaults to active registry version. |
| `note` | string | no | Audit note. |
| `expectedActiveVersionId` | string | no | Stale-state guard. |
| `expectedRegistryDigest` | string | no | Stale-state guard. |

## Returns

`ok: true`, **`code`**: `cae-hard-delete-retired-workspace-artifact-file-ok`, **`data.path`**: tombstone relative path.
