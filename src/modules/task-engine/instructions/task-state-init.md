<!--
agentCapsule|v=1|command=task-state-init|module=task-engine|schema_only=pnpm exec wk run task-state-init --schema-only '{}'
-->

# task-state-init

Bootstrap the canonical **`workflow-cannon/task-state`** git branch from the current SQLite task projection and optional local JSONL tail.

## Usage

```
pnpm exec wk run task-state-init '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"preview bootstrap"}}'
pnpm exec wk run task-state-init '{"policyApproval":{"confirmed":true,"rationale":"establish canonical task-state branch"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dryRun` | boolean | no | Preview counts/paths without worktree commit or push. |
| `overwriteExisting` | boolean | no | Allow replacing an existing local/remote branch (push uses `--force-with-lease` when remote exists). |
| `push` | boolean | no | Default **true** — `git push -u origin <branch>` after commit. |
| `branch` | string | no | Default `workflow-cannon/task-state`. |
| `snapshotId` | string | no | Default `bootstrap`. |
| `policyApproval` | object | yes (live) | Required because this establishes canonical history. |

## Returns

- `task-state-init-complete` — branch materialized and pushed (when `push` is true).
- `task-state-branch-exists` — refused without `overwriteExisting:true`.
- `task-state-init-dry-run` — preview only.

## Notes

- Uses a temporary **git worktree**; does not checkout the task-state branch in the main workspace.
- Never run from dashboard render paths.
