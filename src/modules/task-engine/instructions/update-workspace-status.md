# update-workspace-status

Patch **`kit_workspace_status`** with optimistic concurrency on **`workspaceRevision`**. This is the low-level workspace-status patch command; prefer **`set-current-phase`** for phase rollover and **`phase-status`** for read-only phase discovery.

## Usage

```
workspace-kit run update-workspace-status '{"expectedWorkspaceRevision":1,"activeFocus":"…"}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| **`expectedWorkspaceRevision`** | Yes | Must match current **`workspaceRevision`** or the run fails with **`workspace-revision-mismatch`**. |
| **`currentKitPhase`** | No | String or JSON **`null`**. |
| **`nextKitPhase`** | No | String or JSON **`null`**. |
| **`activeFocus`** | No | String or **`null`**. |
| **`lastUpdated`** | No | String or **`null`**. |
| **`blockers`** | No | String array. |
| **`pendingDecisions`** | No | String array. |
| **`nextAgentActions`** | No | String array. |
| **`actor`** | No | Recorded on the audit event. |
| **`command`** | No | Defaults to **`update-workspace-status`**. |

At least one mutable field besides **`expectedWorkspaceRevision`** is required.

## Response

Returns **`beforeRevision`**, **`afterRevision`**, and before/after **`workspaceStatus`** snapshots.
