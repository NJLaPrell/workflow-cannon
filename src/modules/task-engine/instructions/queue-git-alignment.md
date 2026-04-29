<!--
agentCapsule|v=1|command=queue-git-alignment|module=task-engine|schema_only=pnpm exec wk run queue-git-alignment --schema-only '{}'
-->

# queue-git-alignment

Read-only **heuristic** comparing local **git HEAD** (commit date) to the latest **task-engine transition** timestamp, plus optional **stale `in_progress`** hints. **Does not** prove merge vs task state — Git and the task store are independent (see maintainer runbook).

No network. No task-store writes.

## Usage

```
workspace-kit run queue-git-alignment '{}'
workspace-kit run queue-git-alignment '{"staleInProgressDays":14}'
```

## Arguments

| Field | Type | Description |
| --- | --- | --- |
| `staleInProgressDays` | number (optional) | Flag `in_progress` tasks whose `updatedAt` is older than this many days (default **7**, max **3650**). |

## Returns

`data` includes `schemaVersion` **1**, `git` probe (`ok`, `headSha`, `headCommitDateIso`, `error`), `storeLastTransitionIso`, `signalMergeAheadOfTransitions`, `signalNotes`, `inProgressStale[]`, and `summary`.

**False positives:** no transitions yet; non-git workspace; shallow/parallel branches; clock skew.
