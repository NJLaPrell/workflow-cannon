<!--
agentCapsule|v=1|command=task-state-status|module=task-engine|schema_only=pnpm exec wk run task-state-status --schema-only '{}'
-->

# task-state-status

Read-only comparison of the local SQLite task-state projection vs the canonical **`workflow-cannon/task-state`** git branch.

## Usage

```
pnpm exec wk run task-state-status '{}'
pnpm exec wk run task-state-status '{"fetch":true}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `fetch` | boolean | no | When **true**, runs `git fetch origin <branch>` before resolving the ref. |
| `branch` | string | no | Override branch name (default `workflow-cannon/task-state`). |

## Returns

- `data.syncState`: **`current`**, **`behind`**, **`missing`**, or **`conflict`**
- `data.remoteLatestSequence`, `data.localAppliedSequence`, `data.gitRef`, `data.remoteTipSha`

## Notes

- Does **not** mutate SQLite or JSONL — safe for dashboard polling when not passing `fetch:true`.
