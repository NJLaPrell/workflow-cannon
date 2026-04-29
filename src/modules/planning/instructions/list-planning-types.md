<!--
agentCapsule|v=1|command=list-planning-types|module=planning|schema_only=pnpm exec wk run list-planning-types --schema-only '{}'
-->

# list-planning-types

List available planning workflow types and intended outcomes.

## Usage

```bash
workspace-kit run list-planning-types '{}'
```

## Returns

`data.responseSchemaVersion` is `1`.

`data.planningTypes[]` with:

- `type`
- `title`
- `description`
- `outcomeFocus`
