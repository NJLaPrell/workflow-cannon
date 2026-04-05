# list-plugins

Read-only: enumerate Claude-layout plugins under **`plugins.discoveryRoots`**, validate **`plugin.json`** against the bundled schema, and merge **enabled** flags from **`kit_plugin_state`** when kit SQLite is at **`user_version` 8+**.

## Usage

```
workspace-kit run list-plugins '{}'
```

## Arguments

Omit `{}` or pass `{}`. Optional invocation **`config`** overlay may set **`plugins.discoveryRoots`**.

## Returns

JSON with **`plugins`** (sorted by name), **`count`**, **`discoveryRoots`**, and **`kitSqlitePluginStateAvailable`**.
