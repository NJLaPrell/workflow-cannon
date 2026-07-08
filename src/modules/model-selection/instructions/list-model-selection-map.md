<!--
agentCapsule|v=1|command=list-model-selection-map|module=model-selection|schema_only=pnpm exec wk run list-model-selection-map --schema-only '{}'
-->

# list-model-selection-map

Read and summarize the active model-selection map without running a selection query. Useful for agents that need to understand which models are available and their tiers before making dispatch decisions.

## Input

```json
{
  "mapPath": ".ai/cursor-model-selection-map.v1.json"
}
```

All fields optional. `mapPath` defaults to `.ai/cursor-model-selection-map.v1.json` relative to the workspace root.

## Output

Returns all models with their slugs, tiers, cost bands, and strengths, plus tier defaults and per-subagent-type defaults.

## Related commands

- `recommend-model` — Run a selection query to get the best model for a specific task.
