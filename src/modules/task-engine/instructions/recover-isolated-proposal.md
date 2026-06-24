<!--
agentCapsule|v=1|command=recover-isolated-proposal|module=task-engine|schema_only=pnpm exec wk run recover-isolated-proposal --schema-only '{}'
-->

# recover-isolated-proposal

Recover a discarded isolated proposal by attaching its branch to a worktree path and re-activating proposal metadata.

## Arguments

- `proposalId` (string, required)
- `worktreePath` (string, optional)

## Example

```bash
pnpm exec wk run recover-isolated-proposal '{"proposalId":"proposal-abc12345"}'
```
