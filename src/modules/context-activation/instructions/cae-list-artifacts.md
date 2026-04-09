# cae-list-artifacts

List artifact ids from the CAE registry (paginated).

## Usage

```
workspace-kit run cae-list-artifacts '{"schemaVersion":1}'
workspace-kit run cae-list-artifacts '{"schemaVersion":1,"artifactType":"playbook","limit":50}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `limit` | integer | no | Page size (default **50**, max **200**). |
| `cursor` | string | no | Opaque pagination cursor from prior **`nextCursor`**. |
| `artifactType` | string | no | Filter by registry **`artifactType`** enum. |

## Returns

`ok: true`, **`code`**: `cae-list-artifacts-ok`, **`data`**: `caeListArtifactsData` per **`schemas/cae/cli-read-only-data.v1.json`**.
