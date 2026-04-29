<!--
agentCapsule|v=1|command=cae-update-artifact|module=context-activation|schema_only=pnpm exec wk run cae-update-artifact --schema-only '{}'
-->

# cae-update-artifact

Update a non-retired artifact row. Pass **`artifact`** partial object and/or top-level fields merged with the stored row, then re-validated.

## Usage

```
workspace-kit run cae-update-artifact '{"schemaVersion":1,"actor":"operator","artifactId":"cae.test.x","artifact":{"title":"renamed"},"caeMutationApproval":{"confirmed":true,"rationale":"fix title"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `artifactId` | string | yes | Target artifact id. |
| `artifact` | object | no | Patch merged over stored row. |
| `artifactType` | string | no | Shortcut patch field. |
| `path` | string | no | Shortcut patch for **`ref.path`**. |
| `versionId` | string | no | Defaults to active version. |

## Returns

`ok: true`, **`code`**: `cae-update-artifact-ok`.
