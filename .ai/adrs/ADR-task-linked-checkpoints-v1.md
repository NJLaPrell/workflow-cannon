# ADR: Task-linked git checkpoints (v1)

## Status

Accepted — Phase 64 (kit SQLite **`user_version` 9 **`kit_task_checkpoints`**).

## Context

Agents and maintainers need a **reversible** snapshot before risky git + kit operations: policy-sensitive **`run`**, large edits, or task transitions. Checkpoints must be **auditable** (stored in kit SQLite), **fail-closed** when opt-in automation cannot run, and **honest** about submodule and vendor trees.

## Decision — record model

| Field | Purpose |
| --- | --- |
| **`id`** | Stable primary key (`ckpt_<uuid>` or caller-supplied). |
| **`created_at`** | ISO-8601. |
| **`task_id`** | Optional **`T###`**. |
| **`actor`** | Resolved actor string when available. |
| **`label`** | Short operator label. |
| **`action_type`** | `manual` \| `auto`. |
| **`ref_kind`** | `head` — pointer to **`git_head_sha`** only; `stash` — **`secondary_ref`** holds stash commit OID after **`git stash push -u`**. |
| **`git_head_sha`** | **`git rev-parse HEAD`** at capture (after stash for stash rows). |
| **`secondary_ref`** | Stash OID when **`ref_kind`** is **`stash`**. |
| **`manifest_json`** | Repo-relative paths from **`git status --porcelain=v1`** at capture. |
| **`metadata_json`** | Free-form (e.g. auto trigger command). |

### Modes

- **Head:** No git mutation; **rewind** = **`git reset --hard <git_head_sha>`** (destructive; requires **`force`** if dirty).
- **Stash:** Captures WIP; **rewind** = **`git stash apply <secondary_ref>`** (may conflict).

### Submodule / vendor

- **Rewind** refuses when the manifest intersects **`.gitmodules`** paths, **`node_modules/`**, or top-level **`vendor/`** (explicit errors; no silent reflog tricks).

### Persistence

- Table **`kit_task_checkpoints`** in unified **`workspace-kit.db`**; migrate only via **`prepareKitSqliteDatabase`**.

### Auto-checkpoints

- **`kit.autoCheckpoint.enabled`** (default **false**). When **true**, **`tryAutoCheckpointBeforeRun`** runs after policy approval and before module execution for commands listed in **`kit.autoCheckpoint.beforeCommands`** (default **`run-transition`**). Dirty trees **stash** when **`stashWhenDirty`** is **true**; otherwise the run **fails** with a clear code. Failure never silent when enabled.

## Consequences

- Predictable CLI: **`create-checkpoint`**, **`list-checkpoints`**, **`compare-checkpoint`**, **`rewind-to-checkpoint`**.
- Operators must understand **`reset --hard`** and stash apply risks; runbook references this ADR.
