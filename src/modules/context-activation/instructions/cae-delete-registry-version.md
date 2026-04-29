<!--
agentCapsule|v=1|command=cae-delete-registry-version|module=context-activation|schema_only=pnpm exec wk run cae-delete-registry-version --schema-only '{}'
-->

# cae-delete-registry-version

Delete a **non-active** registry version (CASCADE removes child rows).

## Usage

```
workspace-kit run cae-delete-registry-version '{"schemaVersion":1,"actor":"operator","versionId":"old-inactive","caeMutationApproval":{"confirmed":true,"rationale":"delete"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `versionId` | string | yes | Inactive version to delete. |

## Returns

`ok: true`, **`code`**: `cae-delete-registry-version-ok`.
