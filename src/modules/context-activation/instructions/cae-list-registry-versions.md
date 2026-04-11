# cae-list-registry-versions

List CAE registry **`cae_registry_versions`** rows with artifact/activation counts (read-only).

## Usage

```
workspace-kit run cae-list-registry-versions '{"schemaVersion":1}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |

## Returns

`ok: true`, **`code`**: `cae-list-registry-versions-ok`, **`data.versions`**: array of version summaries.
