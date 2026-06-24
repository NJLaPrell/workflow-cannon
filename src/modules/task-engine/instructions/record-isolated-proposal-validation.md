<!--
agentCapsule|v=1|command=record-isolated-proposal-validation|module=task-engine|schema_only=pnpm exec wk run record-isolated-proposal-validation --schema-only '{}'
-->

# record-isolated-proposal-validation

Append validation evidence to an isolated proposal so task-linked proposal metadata carries test/build/check outcomes.

## Arguments

- `proposalId` (string, required)
- `command` (string, required)
- `status` (`passed` | `failed` | `warn`, required)
- `summary` (string, optional)

## Example

```bash
pnpm exec wk run record-isolated-proposal-validation '{"proposalId":"proposal-abc12345","command":"pnpm run check","status":"passed"}'
```
