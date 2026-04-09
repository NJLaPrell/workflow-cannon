# cae-list-activations

List activation definition ids (paginated).

## Usage

```
workspace-kit run cae-list-activations '{"schemaVersion":1}'
workspace-kit run cae-list-activations '{"schemaVersion":1,"family":"policy","lifecycleState":"active"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `limit` | integer | no | Page size (default **50**, max **200**). |
| `cursor` | string | no | Pagination cursor. |
| `family` | string | no | **`policy`**, **`think`**, **`do`**, or **`review`**. |
| `lifecycleState` | string | no | e.g. **`active`**, **`draft`**. |

## Returns

`ok: true`, **`code`**: `cae-list-activations-ok`, **`data`**: `caeListActivationsData`.
