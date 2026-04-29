<!--
agentCapsule|v=1|command=inspect-plugin|module=plugins|schema_only=pnpm exec wk run inspect-plugin --schema-only '{}'
-->

# inspect-plugin

Read-only: return one plugin’s manifest, validation diagnostics, and optional SQLite persistence row.

## Usage

```
workspace-kit run inspect-plugin '{"pluginName":"wc-phase-61-sample"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `pluginName` | string | yes | Manifest **`name`** field |

## Returns

JSON **`data.plugin`** including **`manifestValid`**, **`manifestErrors`**, **`pathDiagnostics`**, **`enabled`**, and **`persisted`**.
