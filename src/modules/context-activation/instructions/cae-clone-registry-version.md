<!--
agentCapsule|v=1|command=cae-clone-registry-version|module=context-activation|schema_only=pnpm exec wk run cae-clone-registry-version --schema-only '{}'
-->

# cae-clone-registry-version

Clone all artifact + activation rows from **`fromVersionId`** into a new **`toVersionId`**.

## Usage

```
workspace-kit run cae-clone-registry-version '{"schemaVersion":1,"actor":"operator","fromVersionId":"v1","toVersionId":"v2","caeMutationApproval":{"confirmed":true,"rationale":"clone"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit + version **`created_by`**. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `fromVersionId` | string | yes | Existing version. |
| `toVersionId` | string | yes | New version id (must not exist). |
| `note` | string | no | Version note. |
| `setActive` | boolean | no | When **true**, activate after clone. |

## Returns

`ok: true`, **`code`**: `cae-clone-registry-version-ok`.
