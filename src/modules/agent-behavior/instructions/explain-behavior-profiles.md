<!--
agentCapsule|v=1|command=explain-behavior-profiles|module=agent-behavior|schema_only=pnpm exec wk run explain-behavior-profiles --schema-only '{}'
-->

# explain-behavior-profiles

```bash
workspace-kit run explain-behavior-profiles '{"mode":"summarize","profileId":"builtin:calculated"}'
workspace-kit run explain-behavior-profiles '{"mode":"compare","profileIds":["builtin:cautious","builtin:experimental"]}'
```

Returns `data.markdown` (deterministic; no LLM).
