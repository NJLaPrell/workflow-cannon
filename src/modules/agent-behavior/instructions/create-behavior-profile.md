<!--
agentCapsule|v=1|command=create-behavior-profile|module=agent-behavior|schema_only=pnpm exec wk run create-behavior-profile --schema-only '{}'
-->

# create-behavior-profile

```bash
workspace-kit run create-behavior-profile '{"id":"custom:acme","baseProfileId":"builtin:balanced","label":"Acme team"}'
```

Optional: `summary`, `dimensions` (partial), `interactionNotes`. Default `baseProfileId` is `builtin:balanced`.
