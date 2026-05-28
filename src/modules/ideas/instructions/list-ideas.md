agentCapsule|v=1|command=list-ideas|module=ideas|schema_only=pnpm exec wk run list-ideas --schema-only '{}'

# list-ideas

List lightweight operator idea rows from kit SQLite in `sortOrder` order.

## Optional args

- `status` — filter to `open`, `planning`, or `planned`.

```bash
pnpm exec wk run list-ideas '{}'
```

Returns `data.ideas[]` shaped like `schemas/idea.schema.json`, `data.count`, and planning-generation metadata.