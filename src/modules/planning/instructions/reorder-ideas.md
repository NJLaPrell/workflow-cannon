agentCapsule|v=1|command=reorder-ideas|module=ideas|schema_only=pnpm exec wk run reorder-ideas --schema-only '{}'

# reorder-ideas

Replace the full lightweight idea sort order in kit SQLite.

## Required args

- `ideaIds` — array containing every existing idea id exactly once, in desired order. `ids` is accepted as an alias.

## Policy

This command writes kit SQLite and is policy-sensitive. Pass JSON `policyApproval` in the command args.

```bash
pnpm exec wk run reorder-ideas '{"ideaIds":["I002","I001"],"policyApproval":{"confirmed":true,"rationale":"reorder ideas by operator priority"}}'
```

Returns ordered `data.ideas[]`, `data.count`, and planning-generation metadata.