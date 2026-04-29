<!--
agentCapsule|v=1|command=explain-config|module=workspace-config|schema_only=pnpm exec wk run explain-config --schema-only '{}'
-->

# explain-config

Agent command. JSON args:

- `path` (optional): dotted path, e.g. `tasks.storeRelativePath` — use **either** `path` **or** `facet`, not both
- `facet` (optional): bounded facet id — `tasks`, `planning`, `improvement`, `kit`, `modules`, `policy`, `responseTemplates`. Returns `facet`, `facetKeys`, `entries[]` (each entry includes `path` plus the same fields as a single-path explain), and `count`
- `config` (optional): invocation-time config overlay (same shape as `workspace-kit run` top-level `config`)

Single-path returns `config-explained` with `effectiveValue`, `winningLayer`, `alternates`. Facet mode returns the same code with the structured `facet` / `entries` payload.
