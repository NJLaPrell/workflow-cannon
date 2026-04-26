# cae-get-activation

Fetch one CAE activation definition.

## Usage

```
workspace-kit run cae-get-activation '{"schemaVersion":1,"activationId":"cae.activation.do.always-machine-playbooks"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `activationId` | string | yes | Activation **`activationId`**. |

## Returns

`ok: true`, **`code`**: `cae-get-activation-ok`, **`data.activation`** matches **`activation-definition.schema.json`**.
