agentCapsule|v=1|command=update-idea|module=ideas|schema_only=pnpm exec wk run update-idea --schema-only '{}'

# update-idea

Update one lightweight operator idea row in kit SQLite.

## Required args

- `ideaId` — idea id such as `I001`. `id` is accepted as an alias.

## Optional args

- `title` — non-empty string.
- `note` — non-empty string, or `null` to clear.
- `status` — `open`, `planning`, or `planned`.
- `linkedPlanArtifact` — non-empty string, or `null` to clear.
- `previousPlanArtifacts` — array of non-empty strings.

## Policy

This command writes kit SQLite and is policy-sensitive. Pass JSON `policyApproval` in the command args.

```bash
pnpm exec wk run update-idea '{"ideaId":"I001","status":"planning","policyApproval":{"confirmed":true,"rationale":"mark idea as planning"}}'
```

Returns `data.idea` shaped like `schemas/idea.schema.json` plus planning-generation metadata.