# explain-behavior-profiles

```bash
workspace-kit run explain-behavior-profiles '{"mode":"summarize","profileId":"builtin:calculated"}'
workspace-kit run explain-behavior-profiles '{"mode":"compare","profileIds":["builtin:cautious","builtin:experimental"]}'
```

Returns `data.markdown` (deterministic; no LLM).
