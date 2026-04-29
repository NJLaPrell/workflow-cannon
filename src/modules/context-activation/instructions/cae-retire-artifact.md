<!--
agentCapsule|v=1|command=cae-retire-artifact|module=context-activation|schema_only=pnpm exec wk run cae-retire-artifact --schema-only '{}'
-->

# cae-retire-artifact

Set **`retired_at`** on an artifact when no non-retired activation references it.

## Usage

```
workspace-kit run cae-retire-artifact '{"schemaVersion":1,"actor":"operator","artifactId":"cae.test.x","caeMutationApproval":{"confirmed":true,"rationale":"retire"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `artifactId` | string | yes | Target artifact. |
| `versionId` | string | no | Defaults to active version. |

## Returns

`ok: true`, **`code`**: `cae-retire-artifact-ok`.
