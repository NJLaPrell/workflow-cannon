<!--
agentCapsule|v=1|command=apply-isolated-proposal|module=task-engine|schema_only=pnpm exec wk run apply-isolated-proposal --schema-only '{}'
-->

# apply-isolated-proposal

Apply an isolated proposal branch to the current checkout via `git merge --no-ff`. Default mode is dry-run.

## Arguments

- `proposalId` (string, required)
- `dryRun` (boolean, optional; default `true`)

## Example

```bash
pnpm exec wk run apply-isolated-proposal '{"proposalId":"proposal-abc12345","dryRun":true}'
```
