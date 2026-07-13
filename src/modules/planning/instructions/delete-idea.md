agentCapsule|v=1|command=delete-idea|module=ideas|schema_only=pnpm exec wk run delete-idea --schema-only '{}'

# delete-idea

Delete one lightweight operator idea row from kit SQLite.

## Required args

- `ideaId` — idea id such as `I001`. `id` is accepted as an alias.

## Policy

This command writes kit SQLite and is policy-sensitive. Pass JSON `policyApproval` in the command args.

```bash
pnpm exec wk run delete-idea '{"ideaId":"I001","policyApproval":{"confirmed":true,"rationale":"remove stale idea"}}'
```

Returns the deleted `data.idea`, `data.deleted: true`, and planning-generation metadata.