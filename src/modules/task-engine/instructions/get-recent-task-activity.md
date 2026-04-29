<!--
agentCapsule|v=1|command=get-recent-task-activity|module=task-engine|schema_only=pnpm exec wk run get-recent-task-activity --schema-only '{}'
-->

# get-recent-task-activity

Retrieve recent merged transition and mutation activity across tasks.

## Usage

```
workspace-kit run get-recent-task-activity '{"limit":100}'
```

## Arguments

- `limit` (number, optional): max records, default 50, capped at 500.
