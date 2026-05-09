<!--
agentCapsule|v=1|command=cae-activate-registry-checkpoint|module=context-activation|schema_only=pnpm exec wk run cae-activate-registry-checkpoint --schema-only '{}'
-->

# cae-activate-registry-checkpoint

Activate the CAE registry **SQLite** version referenced by a **`cae_registry_checkpoints`** row (kit SQLite **v22+**). By default, verifies the version’s **current** registry digest still matches the checkpoint’s recorded digest before flipping **`is_active`** (guards against in-place drift on that version).

Uses the same **CAE mutation approval** gate as other registry mutators (**`caeMutationApproval`**); not Tier A **`policyApproval`**.

## Usage

```
workspace-kit run cae-activate-registry-checkpoint '{"schemaVersion":1,"actor":"operator","checkpointId":3,"caeMutationApproval":{"confirmed":true,"rationale":"restore labeled publish"}}'
```

Skip digest verification (dangerous — only when operators accept drift):

```
workspace-kit run cae-activate-registry-checkpoint '{"schemaVersion":1,"actor":"operator","checkpointId":3,"verifyCheckpointDigest":false,"caeMutationApproval":{"confirmed":true,"rationale":"force activate"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Mutation actor (same as other registry admin commands). |
| `checkpointId` | number | yes | SQLite **`cae_registry_checkpoints.id`**. |
| `verifyCheckpointDigest` | boolean | no | Default **true**. When **false**, skip digest equality check vs current rows for the checkpoint’s **`version_id`**. |
| `note` | string | no | Optional note on the mutation audit row. |
| `caeMutationApproval` | object | yes | Registry mutation approval (see **`cae-activate-registry-version`**). |

## Errors

| Code | When |
| --- | --- |
| `cae-registry-checkpoint-not-found` | No row for **`checkpointId`**. |
| `cae-checkpoint-digest-mismatch` | Digest guard on and current version content ≠ checkpoint digest. |
| `cae-registry-version-not-found` | Checkpoint references a missing **`cae_registry_versions`** row. |

## Returns

`ok: true`, **`code`**: `cae-activate-registry-checkpoint-ok`, **`data.versionId`**, **`data.checkpointId`**.
