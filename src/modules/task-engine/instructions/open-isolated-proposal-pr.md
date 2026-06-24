<!--
agentCapsule|v=1|command=open-isolated-proposal-pr|module=task-engine|schema_only=pnpm exec wk run open-isolated-proposal-pr --schema-only '{}'
-->

# open-isolated-proposal-pr

Prepare (or execute) PR creation for an isolated proposal branch. Dry run returns explicit `git push` and `gh pr create` commands.

## Arguments

- `proposalId` (string, required)
- `baseBranch` (string, optional)
- `title` (string, optional)
- `body` (string, optional)
- `dryRun` (boolean, optional; default `true`)

## Example

```bash
pnpm exec wk run open-isolated-proposal-pr '{"proposalId":"proposal-abc12345","baseBranch":"release/phase-137","dryRun":true}'
```
