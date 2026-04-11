# cae-create-artifact

Insert a validated artifact row (**`schemas/cae/registry-entry.v1.json`**) into the active or **`versionId`** registry version.

## Usage

```
workspace-kit run cae-create-artifact '{"schemaVersion":1,"actor":"operator","artifact":{"schemaVersion":1,"artifactId":"cae.test.x","artifactType":"playbook","ref":{"path":".ai/README.md"},"title":"x"},"caeMutationApproval":{"confirmed":true,"rationale":"add artifact"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `artifact` | object | yes | Full registry artifact entry. |
| `versionId` | string | no | Defaults to active version. |
| `note` | string | no | Audit note. |

## Returns

`ok: true`, **`code`**: `cae-create-artifact-ok`.
