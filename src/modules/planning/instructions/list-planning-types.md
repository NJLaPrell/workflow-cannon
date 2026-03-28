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
