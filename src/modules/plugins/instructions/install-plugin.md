# install-plugin

**Tier B (sensitive):** copy a validated plugin directory into a configured discovery root and upsert **`kit_plugin_state`** (**`copy-install`**, enabled).

## Usage

```
workspace-kit run install-plugin '{"sourcePath":"path/to/source-plugin","policyApproval":{"confirmed":true,"rationale":"install reference plugin"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `sourcePath` | string | yes | Workspace-relative path to plugin root (must contain `.claude-plugin/plugin.json`) |
| `targetDiscoveryRoot` | string | no | Must equal one of **`plugins.discoveryRoots`**; defaults to first root |
| `policyApproval` | object | yes | JSON approval (`confirmed`, `rationale`) |

## Returns

JSON with **`destinationRelativePath`** and **`pluginName`**.
