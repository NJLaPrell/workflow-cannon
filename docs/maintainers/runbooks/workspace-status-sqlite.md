<!-- GENERATED FROM .ai/runbooks/workspace-status-sqlite.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

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

- If **`workspace_revision`** is **0** and **`docs/maintainers/data/workspace-kit-status.yaml`** exists, the kit imports that file into **`kit_workspace_status`** and bumps revision to **1**, recording a **`yaml_seed_import`** event.
- If **`.workspace-kit/config.json`** sets **`kit.currentPhaseNumber`** and YAML **`current_kit_phase`** yields a **different** phase number, open **fails closed** with **`workspace-status-import-conflict`** until the operator aligns sources.

## Migrations

DDL and **`user_version`** steps live in **`src/core/state/workspace-kit-sqlite.ts`** (`migrateV9ToV10`).
