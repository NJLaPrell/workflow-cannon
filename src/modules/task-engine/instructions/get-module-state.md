<!--
agentCapsule|v=1|command=get-module-state|module=task-engine|schema_only=pnpm exec wk run get-module-state --schema-only '{}'
-->

# get-module-state

Read one module row from unified SQLite module state.

## Usage

```
workspace-kit run get-module-state '{"moduleId":"task-engine"}'
```

## Arguments

- `moduleId` (required): module registration id to read.
