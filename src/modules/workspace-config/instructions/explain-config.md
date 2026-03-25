# explain-config

Agent command. JSON args:

- `path` (required): dotted path, e.g. `tasks.storeRelativePath`
- `config` (optional): invocation-time config overlay (same shape as `workspace-kit run` top-level `config`)

Returns `config-explained` with `effectiveValue`, `winningLayer`, `alternates`.
