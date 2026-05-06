<!--
agentCapsule|v=1|command=resolve-config|module=workspace-config|schema_only=pnpm exec wk run resolve-config --schema-only '{}'
-->

# resolve-config

Returns the full effective workspace configuration (sorted keys for determinism) plus layer identifiers.

## JSON args

Optional top-level `config` object merged last (invocation overlay), same as other `workspace-kit run` commands.

## Example

```json
{}
```

## Output

- `data.effective` — merged effective config object (key-sorted at each object level).
- `data.layers` — `{ id: string }[]` for each merge layer (kit-default, module:*, user, project, env, invocation).

`data.effective.agentPresentation` contains the baseline presentation config. `derived` values are resolved by `resolve-agent-guidance` together with role tier and Agent Temperament; use CAE Guidance for command/task-specific exceptions instead of expanding global config.
