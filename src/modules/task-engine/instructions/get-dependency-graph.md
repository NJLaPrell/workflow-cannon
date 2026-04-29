<!--
agentCapsule|v=1|command=get-dependency-graph|module=task-engine|schema_only=pnpm exec wk run get-dependency-graph --schema-only '{}'
-->

# get-dependency-graph

Return dependency graph data for active tasks.

## Usage

```
workspace-kit run get-dependency-graph '{}'
workspace-kit run get-dependency-graph '{"taskId":"T400"}'
```

## Arguments

- `taskId` (string, optional): when provided, include task-specific dependency/dependent lists.
