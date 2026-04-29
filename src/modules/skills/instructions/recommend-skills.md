<!--
agentCapsule|v=1|command=recommend-skills|module=skills|schema_only=pnpm exec wk run recommend-skills --schema-only '{}'
-->

# recommend-skills

```bash
workspace-kit run recommend-skills '{"tags":["example"]}'
```

Deterministic recommendations: optional `tags` (all must match pack `discoveryTags`), optional `phaseKey` / `taskType` (match tags `phase:<key>` / `task-type:<type>`). Results sorted by `id`.
