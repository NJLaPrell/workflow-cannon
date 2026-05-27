<!--
agentCapsule|v=1|command=task-state-publish|module=task-engine|schema_only=pnpm exec wk run task-state-publish --schema-only '{}'
-->

# task-state-publish

Append canonical task-state events to the git branch via `GitTaskEventStore` (optimistic push with fetch/retry).

## Usage

```
pnpm exec wk run task-state-publish '{"expectedHeadSha":"<sha>","expectedTaskVersions":{"T100516":1},"events":[...],"policyApproval":{"confirmed":true,"rationale":"publish mutation"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `events` | array | yes | `TaskStateEventV1` drafts (`sequence`/`parentEventId` reassigned from remote head). |
| `expectedHeadSha` | string | yes | Branch tip SHA observed before building events. |
| `expectedTaskVersions` | object | yes | Map of `taskId` → version number the writer observed for every touched task. |
| `branch` | string | no | Override branch (default `workflow-cannon/task-state`). |
| `maxAttempts` | integer | no | Push retry cap (default **3**). |
| `push` | boolean | no | Default **true** — set **false** for local commit-only tests. |
| `dryRun` | boolean | no | Validate argv only. |
| `policyApproval` | object | yes (live) | Tier B JSON approval. |

## Returns

- `task-state-published` — events appended; `data.publishedEvents` includes assigned sequences.
- `task-state-publish-task-conflict` — same-task stale version (no retry).
- `task-state-publish-push-failed` / `task-state-publish-exhausted-retries` — git push failures.

## Notes

- Unrelated concurrent writes (head moved, versions still match) auto-retry after fetch.
- Dashboard/extension must not call this from render paths — use background sync or explicit operator action.
