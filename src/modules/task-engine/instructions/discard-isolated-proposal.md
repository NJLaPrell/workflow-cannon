<!--
agentCapsule|v=1|command=discard-isolated-proposal|module=task-engine|schema_only=pnpm exec wk run discard-isolated-proposal --schema-only '{}'
-->

# discard-isolated-proposal

Discard isolated proposal work by removing its git worktree and marking proposal metadata as discarded.

## Arguments

- `proposalId` (string, required)

## Example

```bash
pnpm exec wk run discard-isolated-proposal '{"proposalId":"proposal-abc12345"}'
```
