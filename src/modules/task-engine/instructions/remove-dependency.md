<!--
agentCapsule|v=1|command=remove-dependency|module=task-engine|schema_only=pnpm exec wk run remove-dependency --schema-only '{}'
-->

# remove-dependency

Remove a dependency edge from one task to another.

## Usage

```
workspace-kit run remove-dependency '{"taskId":"T401","dependencyTaskId":"T400"}'
```

## Arguments

- `taskId` (string, required): dependent task ID.
- `dependencyTaskId` (string, required): prerequisite task ID.
- `actor` (string, optional): actor identifier.
