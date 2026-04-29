<!--
agentCapsule|v=1|command=replay-queue-snapshot|module=task-engine|schema_only=pnpm exec wk run replay-queue-snapshot --schema-only '{}'
-->

# replay-queue-snapshot

Read-only **replay** of **`get-next-actions`** logic against a **frozen** task list. Does **not** read or write the live task store.

## Usage

**Inline tasks** (JSON array of task entities):

```
workspace-kit run replay-queue-snapshot '{"tasks":[…]}'
```

**File** (path relative to workspace root, must stay under the workspace):

```
workspace-kit run replay-queue-snapshot '{"snapshotRelativePath":"artifacts/task-snapshot.example.json"}'
```

Optional **`queueNamespace`**: same filtering as **`get-next-actions`** (see ADR **task queue namespace**).

## Arguments

| Field | Type | Description |
| --- | --- | --- |
| `tasks` | array | Task entities (same shape as task store `tasks[]`). |
| `snapshotRelativePath` | string | Alternative to `tasks`: load JSON with top-level `tasks[]` or a `TaskStoreDocument`. |
| `queueNamespace` | string (optional) | Filter to `metadata.queueNamespace` (missing → `"default"`). |

Exactly one of `tasks` or `snapshotRelativePath` is required.

## Returns

Payload matches **`get-next-actions`** plus `schemaVersion`, `replay: true`, `caveat`, `taskCount`, and optional `queueNamespace`.

**Skew warning:** queue rules in the running binary may differ from the version that produced the snapshot; treat as approximate forensics.
