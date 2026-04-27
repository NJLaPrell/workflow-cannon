# Workspace status in kit SQLite (Phase 67)

**ADR:** `.ai/adrs/ADR-workspace-status-sqlite-authority-v1.md`  
**Tasks:** **T817** (schema + YAML seed), **T818**+ (CLI and reader cutover).

## Tables (`PRAGMA user_version` ≥ 10)

### `kit_workspace_status`

Singleton row **`id = 1`**.

| Column | Purpose |
| --- | --- |
| **`workspace_revision`** | Optimistic-lock counter for workspace status (starts at **0**; **1** after first YAML seed or first CLI update). |
| **`current_kit_phase`** / **`next_kit_phase`** | Phase scalars (string), analogous to maintainer YAML. |
| **`active_focus`** / **`last_updated`** | Maintainer narrative fields. |
| **`blockers_json`** / **`pending_decisions_json`** / **`next_agent_actions_json`** | JSON arrays of strings (same semantics as YAML lists). |
| **`updated_at`** | ISO-8601 last mutation. |

### `kit_workspace_status_events`

Append-only audit log: **`event_kind`**, optional **`actor`** / **`command`**, **`revision_before`** / **`revision_after`**, **`details_json`**.

## YAML seed (T817)

On **`SqliteDualPlanningStore.loadFromDisk`**, after migrations:

- If **`workspace_revision`** is **0** and **`docs/maintainers/data/workspace-kit-status.yaml`** exists, the kit imports that file into **`kit_workspace_status`** and bumps revision to **1**, recording a **`yaml_seed_import`** event. **`kit.currentPhaseNumber`** is **not** consulted for this seed (YAML row content wins).
- **`UnifiedStateDb.ensureDb`** (module state opens) also runs **`syncWorkspaceKitStatusFromYamlIfNeeded`** after **`prepareKitSqliteDatabase`**, so revision-0 seed is not skipped when only **`UnifiedStateDb`** touched the file before **`SqliteDualPlanningStore.loadFromDisk`**.

## Migrations

DDL and **`user_version`** steps live in **`src/core/state/workspace-kit-sqlite.ts`** (`migrateV9ToV10`).

## CLI (T818)

- **`get-workspace-status`** — read singleton row + **`kitSqliteUserVersion`**.
- **`phase-status`** — focused read-only phase answer: canonical current/next phase, config hint drift, export freshness, and optional task counts.
- **`set-current-phase`** — SQLite-first happy-path phase rollover: patches **`kit_workspace_status`**, aligns config hints, and writes the non-authoritative DB export.
- **`update-workspace-status`** — patch with **`expectedWorkspaceRevision`** (optimistic concurrency).
- **`export-workspace-status`** — write **`docs/maintainers/data/workspace-kit-status.db-export.yaml`** (non-authoritative); use **`dryRun`** to preview **`yamlBody`**.
- **`workspace-status-history`** — list **`kit_workspace_status_events`** (optional **`limit`**).

**`update-workspace-phase-snapshot`** still updates maintainer YAML for compatibility, but live runs update SQLite/export first and then write the legacy YAML surface. When **`currentKitPhase`** is provided, it delegates through **`set-current-phase`**; when only **`nextKitPhase`** is provided, it patches **`kit_workspace_status.next_kit_phase`** and exports before touching YAML. New operator flows should start with **`phase-status`** / **`set-current-phase`** unless maintaining legacy YAML compatibility is the point.

### Migration note: T546 / T547 / T836

**`T546`** and **`T547`** shipped the older YAML-first phase snapshot workflow, and **`T836`** captured the follow-up pain around keeping phase snapshot data and **`kit.currentPhaseLabel`** aligned. Treat those rows as provenance for why the compatibility command exists, not as current operator guidance. The current happy path is **`phase-status`** for read-only discovery and **`set-current-phase`** for rollover; per-task **`phaseKey`** remains independent execution metadata and does not move the workspace phase.

## Readers (T819)

**`dashboard-summary`**, **`queue-health`**, **`list-tasks`** (queue hints), and **`agent-session-snapshot` / `agent-bootstrap`** compose paths read **`workspaceStatus`** from **`readWorkspaceStatusSnapshotFromDual`** only (no shallow-parse of maintainer YAML for those payloads). When the table or row is absent, **`workspaceStatus`** is **`null`**.

## Doctor (T820 / T821)

**`workspace-kit doctor`** workspace-status checks use **SQLite only** when **`PRAGMA user_version` ≥ 10** and **`kit_workspace_status`** exists:

- Maintainer YAML **`docs/maintainers/data/workspace-kit-status.yaml`** is **not** consulted for drift (YAML may lag; authority is the DB row).
- Failure code: **`kit-workspace-status-row-missing`** when the table exists but the singleton row is absent.
- Config vs DB phase **mismatch is not a failure** after **T821**: runtime readers use **`kit_workspace_status`**. When **`kit.currentPhaseNumber`** disagrees with the DB phase, doctor may print a **non-fatal note** after a successful pass (operator UX / bootstrap hint only).
- Legacy remediation code **`kit-phase-config-workspace-status-mismatch`** may still appear in catalogs for older tooling; **`doctor`** no longer emits it.
- When **`user_version` < 10**, doctor **skips** this slice (no YAML fallback).

After doctor passes, if **`user_version` ≥ 10** and **`workspace-kit-status.db-export.yaml`** exists with an **mtime older** than the planning SQLite file, doctor prints a **non-fatal note** suggesting **`export-workspace-status`** (export remains non-authoritative).
