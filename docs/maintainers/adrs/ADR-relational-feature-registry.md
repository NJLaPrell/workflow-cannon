# ADR: Relational feature registry (Path A, junction Option 1)

## Status

Accepted — Phase 53 (`v0.53.0`).

## Context

Tasks may carry **feature taxonomy** slugs for reporting, filtering, and roadmap roll-ups. Phase 46 introduced `features_json` on relational SQLite rows and advisory validation against shipped `feature-taxonomy.json`. That model duplicates taxonomy in a JSON file and task JSON without foreign-key integrity.

## Decision

1. **Path A — SQLite registry is the runtime source of truth** for valid feature ids. Seeded from the historical taxonomy JSON on schema upgrade; maintainers sync committed `feature-taxonomy.json` from the registry when taxonomy changes (export command).

2. **Option 1 — Authoritative junction** `task_engine_task_features(task_id, feature_id)` with FKs to `task_engine_tasks` and `task_engine_features`. Task reads assemble `TaskEntity.features` from the junction; **`features_json` is not authoritative** after backfill (persisted as `'[]'` when the registry is active).

3. **Components** — Table `task_engine_components` groups features (one row per distinct former “category” string, stable slug id).

4. **Exceptions** — `improvement` and `wishlist_intake` tasks do not require feature links. Unknown feature ids on those types produce **warnings** only. All other task types **fail closed** on unknown ids when `features` is non-empty.

5. **Reads before backfill** — If the junction is empty for a task but `features_json` still has slugs, assembly uses `features_json` until `backfill-task-feature-links` runs.

6. **ON DELETE** — `task_engine_task_features.task_id` → `ON DELETE CASCADE` from tasks. `feature_id` → `ON DELETE RESTRICT` (do not delete features that are still linked; use explicit registry management in future phases if needed).

7. **Documentation** — `generate-document` for `ROADMAP.md` / `FEATURE-TAXONOMY.md` prefers taxonomy rows from the planning SQLite DB when `user_version >= 5` and the registry is populated; otherwise falls back to `src/modules/documentation/data/feature-taxonomy.json` (CI and fresh clones).

## Non-goals (this ADR)

- UI for editing registry rows beyond export/backfill CLI.
- HTTP APIs for taxonomy.
- Renaming slugs in place (add new slug + migrate tasks instead).

## Consequences

- `PRAGMA user_version` bumps to **5**; `PRAGMA foreign_keys = ON` on kit SQLite connections.
- New read-only commands: `list-components`, `list-features`.
- New maintenance commands: `backfill-task-feature-links`, `export-feature-taxonomy-json` (policy-sensitive writes for export).
- `list-tasks` gains `featureId` and `componentId` filters.
- Unknown feature slug error code: **`unknown-feature-id`** on mutating execution tasks.
