agentCapsule|v=1|command=get-idea|module=ideas|schema_only=pnpm exec wk run get-idea --schema-only '{}'

# get-idea

Read one lightweight operator idea from kit SQLite by `I###` id.

## Required args

- `ideaId` — idea id such as `I001`. `id` is accepted as an alias.

```bash
pnpm exec wk run get-idea '{"ideaId":"I001"}'
```

Returns `data.idea` shaped like `schemas/idea.schema.json` plus planning-generation metadata.