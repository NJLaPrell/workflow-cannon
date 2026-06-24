<!--
agentCapsule|v=1|command=view-isolated-proposal-diff|module=task-engine|schema_only=pnpm exec wk run view-isolated-proposal-diff --schema-only '{}'
-->

# view-isolated-proposal-diff

Return changed-file tracking and optional patch output for an isolated proposal branch against its recorded base branch.

## Arguments

- `proposalId` (string, required)
- `includePatch` (boolean, optional) — include full git patch in response.

## Example

```bash
pnpm exec wk run view-isolated-proposal-diff '{"proposalId":"proposal-abc12345","includePatch":true}'
```
