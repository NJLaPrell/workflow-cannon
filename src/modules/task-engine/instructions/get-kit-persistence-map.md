<!--
agentCapsule|v=1|command=get-kit-persistence-map|module=task-engine|schema_only=pnpm exec wk run get-kit-persistence-map --schema-only '{}'
-->

# get-kit-persistence-map

Structured, read-only summary of where workspace-kit durable state lives after **v0.40** (SQLite-only runtime). Use for agent prompts and operator debugging.

## Example

```bash
workspace-kit run get-kit-persistence-map '{}'
```

## Response

Returns `data` with `schemaVersion`, `unifiedSqliteRelativePath`, `planning`, `legacyJsonImportOnly` (task JSON path for **`migrate-task-persistence`** only), `workspaceModuleState`, and `legacySidecarJsonFiles`.
