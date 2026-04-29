<!--
agentCapsule|v=1|command=enable-plugin|module=plugins|schema_only=pnpm exec wk run enable-plugin --schema-only '{}'
-->

# enable-plugin

**Tier B (sensitive):** set **`kit_plugin_state.enabled = 1`** for a currently discovered plugin.

## Usage

```
workspace-kit run enable-plugin '{"pluginName":"wc-phase-61-sample","policyApproval":{"confirmed":true,"rationale":"re-enable plugin"}}'
```

## Arguments

| Field | Type | Required |
| --- | --- | --- |
| `pluginName` | string | yes |
| `policyApproval` | object | yes |
