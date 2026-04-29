<!--
agentCapsule|v=1|command=add-dependency|module=task-engine|schema_only=pnpm exec wk run add-dependency --schema-only '{}'
-->

# add-dependency

Add a dependency edge from one task to another.

## Usage

```
workspace-kit run add-dependency '{"taskId":"T401","dependencyTaskId":"T400"}'
```

## Arguments

- `taskId` (string, required): dependent task ID.
- `dependencyTaskId` (string, required): prerequisite task ID.
- `actor` (string, optional): actor identifier.
