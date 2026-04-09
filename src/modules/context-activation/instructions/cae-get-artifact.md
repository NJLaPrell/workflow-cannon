# cae-get-artifact

Fetch one CAE artifact registry row.

## Usage

```
workspace-kit run cae-get-artifact '{"schemaVersion":1,"artifactId":"cae.playbook.machine-playbooks"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `artifactId` | string | yes | Registry **`artifactId`**. |

## Returns

`ok: true`, **`code`**: `cae-get-artifact-ok`, **`data.artifact`** matches **`registry-entry.v1.json`**.
