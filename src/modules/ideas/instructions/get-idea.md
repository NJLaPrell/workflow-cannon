agentCapsule|v=1|command=get-idea|module=ideas|schema_only=pnpm exec wk run get-idea --schema-only '{}'

# get-idea

Read one lightweight operator idea from kit SQLite by `I###` id. When the idea links a unified IdeaPlan artifact (`linkedPlanArtifact` or active draft), also returns `data.ideaPlan` with the full document envelope (including `brainstorm.sessions` and `brainstorm.synthesis` when present).

## Required args

- `ideaId` — idea id such as `I001`. `id` is accepted as an alias.

```bash
pnpm exec wk run get-idea '{"ideaId":"I001"}'
```

Returns `data.idea` shaped like `schemas/idea.schema.json`, optional `data.ideaPlan` for the unified document, plus planning-generation metadata.
