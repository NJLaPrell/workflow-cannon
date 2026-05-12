<!--
agentCapsule|v=1|command=workspace-edit-status|module=task-engine|schema_only=pnpm exec wk run workspace-edit-status --schema-only '{}'
-->

# workspace-edit-status

Read-only: parse **`workspace-edit.json`** under git common-dir and return **`present` / `active` / `staleOrInvalid`** plus the full **`document`** when valid.

## Usage

```
pnpm exec wk run workspace-edit-status '{}'
```
