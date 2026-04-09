# cae-health

Report **`kit.cae.enabled`** (effective config), registry load status, and structured **`issues`**.

## Usage

```
workspace-kit run cae-health '{"schemaVersion":1}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `includeDetails` | boolean | no | Reserved for extended diagnostics. |

## Returns

`cae-health-ok`; **`data`** matches **`caeHealthData`**.
