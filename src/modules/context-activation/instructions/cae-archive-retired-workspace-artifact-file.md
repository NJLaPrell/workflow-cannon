<!--
agentCapsule|v=1|command=cae-archive-retired-workspace-artifact-file|module=context-activation|schema_only=pnpm exec wk run cae-archive-retired-workspace-artifact-file --schema-only '{}'
-->

# cae-archive-retired-workspace-artifact-file

Move the backing markdown for a **retired** workspace artifact into **`.ai/cae/artifacts/_archive/<type>/…`** and update the SQLite registry `path` (and metadata: `archivedAt`, `previousPath`).

Requires prior **`cae-retire-workspace-artifact`**. Tier **C** for `caeMutationApproval` (CAE governance lane — not Tier A `policyApproval`).

## Usage

```
workspace-kit run cae-archive-retired-workspace-artifact-file '{"schemaVersion":1,"actor":"operator","artifactId":"workspace.example.playbook","caeMutationApproval":{"confirmed":true,"rationale":"archive retired file"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `artifactId` | string | yes | Retired workspace artifact id. |
| `versionId` | string | no | Defaults to active registry version. |
| `note` | string | no | Audit note. |
| `expectedActiveVersionId` | string | no | Stale-state guard (see `cae-update-workspace-artifact`). |
| `expectedRegistryDigest` | string | no | Stale-state guard. |

## Returns

`ok: true`, **`code`**: `cae-archive-retired-workspace-artifact-file-ok`, **`data.path`**: new relative markdown path under `_archive/`.
