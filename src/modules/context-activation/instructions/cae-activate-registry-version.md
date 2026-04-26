# cae-activate-registry-version

Mark **`versionId`** active (at most one active version).

## Usage

```
workspace-kit run cae-activate-registry-version '{"schemaVersion":1,"actor":"operator","versionId":"v2","caeMutationApproval":{"confirmed":true,"rationale":"activate"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `versionId` | string | yes | Target version. |
| `note` | string | no | Audit note. |

## Returns

`ok: true`, **`code`**: `cae-activate-registry-version-ok`.
