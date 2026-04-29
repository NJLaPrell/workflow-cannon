<!--
agentCapsule|v=1|command=cae-get-registry-version|module=context-activation|schema_only=pnpm exec wk run cae-get-registry-version --schema-only '{}'
-->

# cae-get-registry-version

Fetch one CAE registry version header; optionally include raw SQLite rows.

## Usage

```
workspace-kit run cae-get-registry-version '{"schemaVersion":1,"versionId":"<id>"}'
workspace-kit run cae-get-registry-version '{"schemaVersion":1,"versionId":"<id>","includeRows":true}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `versionId` | string | yes | Registry version id. |
| `includeRows` | boolean | no | When **true**, include **`artifactRows`** and **`activationRows`**. |

## Returns

`ok: true`, **`code`**: `cae-get-registry-version-ok`.
