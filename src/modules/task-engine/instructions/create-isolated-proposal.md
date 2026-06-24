<!--
agentCapsule|v=1|command=create-isolated-proposal|module=task-engine|schema_only=pnpm exec wk run create-isolated-proposal --schema-only '{}'
-->

# create-isolated-proposal

Create an isolated proposal branch + worktree artifact tied to one or more task ids without taking over the visible checkout lease.

## Arguments

- `taskId` (string) or `taskIds` (string[]) — required task linkage.
- `baseBranch` (string, optional) — proposal base ref.
- `proposalBranch` (string, optional) — branch name for proposal work.
- `worktreePath` (string, optional) — target worktree path.
- `title` (string, optional) — proposal title.
- `validationEvidence` (array, optional) — seed validation evidence rows.

## Example

```bash
pnpm exec wk run create-isolated-proposal '{"taskId":"T100193","baseBranch":"release/phase-137"}'
```
