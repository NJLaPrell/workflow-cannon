<!--
agentCapsule|v=1|command=workspace-coordination-status|module=task-engine|schema_only=pnpm exec wk run workspace-coordination-status --schema-only '{}'
-->

# workspace-coordination-status

Read-only coordination posture for the **visible** checkout: git worktree + common-dir, branch vs integration lines, porcelain dirty count (capped), whether the planning SQLite path is dirty in git, and optional **workspace edit lease** metadata under **`$GIT_COMMON_DIR/workflow-cannon/leases/`** (see Phase 92 lease commands). Does **not** open task SQLite or mutate lifecycle state.

## Usage

```
pnpm exec wk run workspace-coordination-status '{}'
```

## Arguments

Empty object `{}` — no filters.

## Response

Returns **`WorkspaceCoordinationStatusV1`** (`schemaVersion: 1`) including **`posture`** (`safe`, `worker_branch`, `lease_held`, `stale_lease`, `dirty_workspace`, `dirty_task_db`, `detached_head`, `unknown_git`), **`authorityRole`**, compact **`taskStateAuthority`** (`mode`, `classification`, `workerBranchMutations`, explain codes), **`lease`**, **`dirtyManifest`**, and **`suspectFlags`** for git failures.

Also embedded under **`dashboard-summary.data.systemStatus.coordination`** and a compact pointer on **`agent-bootstrap.data.workspaceCoordination`**.
