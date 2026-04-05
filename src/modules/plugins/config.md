# plugins module configuration

## `plugins.discoveryRoots`

- **Type:** array of workspace-relative directory paths.
- **Default:** `[".claude/plugins"]` (via module config contribution).
- **Behavior:** Each root is scanned for immediate child directories that contain `.claude-plugin/plugin.json` (Claude Code plugin layout).

## Persistence

Enable/disable and copy-install provenance use table **`kit_plugin_state`** in unified kit SQLite when **`PRAGMA user_version` ≥ 8** (see `workspace-kit run get-kit-persistence-map '{}'`).

## Policy

Mutating commands (`install-plugin`, `enable-plugin`, `disable-plugin`) require JSON **`policyApproval`** on the `workspace-kit run` path (`plugins.persist`).
