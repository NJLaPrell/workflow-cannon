<!--
agentCapsule|v=1|command=list-phase-notes|module=task-engine|schema_only=pnpm exec wk run list-phase-notes --schema-only '{}'
-->

# list-phase-notes

List phase notes for a stable `phaseKey` with optional filters. Returns bounded projections (not raw SQLite rows).

When **`phaseKey`** is omitted, the command uses the **canonical current workspace phase** (`kit_workspace_status` / config fallback — same precedence as **`get-next-actions`**) or infers from **`taskId`** when that task carries **`phaseKey` / `phase`** metadata. If none of these apply, the command returns **`phase-note-phase-unresolved`**.

When **`status`** defaults to **`active`**, notes whose **`expires_at`** instant is **already in the past** are treated as passively expired: they are **omitted** unless **`includeExpired`** is **`true`** (same behavior for **`get-phase-context`**).

Default agent-facing usage therefore excludes dismissed/deleted history (`dismissed`, `superseded`, `converted`) unless a caller explicitly requests those statuses.

## Usage

```
workspace-kit run list-phase-notes '{"phaseKey":"78"}'
workspace-kit run list-phase-notes '{"phaseKey":"78","status":"active","limit":20}'
workspace-kit run list-phase-notes '{"phaseKey":"78","includeExpired":true}'
workspace-kit run list-phase-notes '{}'
```
