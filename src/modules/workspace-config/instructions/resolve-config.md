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
