# disable-plugin

**Tier B (sensitive):** set **`kit_plugin_state.enabled = 0`** for a currently discovered plugin (still listed by **`list-plugins`** with **`enabled: false`**).

## Usage

```
workspace-kit run disable-plugin '{"pluginName":"wc-phase-61-sample","policyApproval":{"confirmed":true,"rationale":"temporarily disable plugin"}}'
```

## Arguments

| Field | Type | Required |
| --- | --- | --- |
| `pluginName` | string | yes |
| `policyApproval` | object | yes |
