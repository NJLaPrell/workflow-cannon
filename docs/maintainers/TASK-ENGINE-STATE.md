# Task engine state (persistence)

## Default: SQLite

The task engine **defaults** to **SQLite** under **`tasks.sqliteDatabaseRelativePath`** (typically **`.workspace-kit/tasks/workspace-kit.db`**). The runtime uses relational rows (plus planning envelope columns) as described in **`docs/maintainers/runbooks/task-persistence-operator.md`** and **`docs/maintainers/workbooks/task-engine-workbook.md`**.

Treat **hand-editing the database** as risky—same class of problem as hand-editing JSON. Prefer **`workspace-kit run`** task-derived commands (e.g. **`run-transition`**, **`update-task`**) per **`docs/maintainers/AGENT-CLI-MAP.md`**.

## JSON opt-out / legacy import

A JSON document at **`.workspace-kit/tasks/state.json`** (path from **`tasks.storeRelativePath`**) is supported as an **opt-out** persistence shape when configured, and remains the **legacy import** surface for **`migrate-task-persistence`**. **`tasks.persistenceBackend: "json"`** is **not** valid for default runtime configuration on current kit versions—see **`docs/maintainers/ADR-json-persistence-deprecation.md`** / **`docs/maintainers/runbooks/json-to-sqlite-one-shot-upgrade.md`**.

When the engine loads that JSON document, it uses **`JSON.parse`** and expects:

- Top-level **`schemaVersion`** (number) and **`tasks`** (array).
- **`transitionLog`** (array) for audit history when present.
- Each task object includes at minimum: **`id`**, **`status`**, **`type`**, **`title`**, **`createdAt`**, **`updatedAt`**, **`priority`**, **`phase`** (string), plus optional **`dependsOn`**, **`unblocks`**, **`approach`**, **`technicalScope`**, **`acceptanceCriteria`**, **`metadata`**.

There is **no separate JSON Schema file enforced at load time** in the published CLI for that document; invalid shapes surface as runtime errors when code reads specific fields.

## Maintainer expectations

- **Canonical queue:** **`docs/maintainers/ROADMAP.md`** is strategic; **task ids and `status` live in the configured task store** (default SQLite path above; JSON path when opted in).
- **Narrow planning guard:** **`pnpm run check-planning-consistency`** (**`scripts/check-planning-doc-consistency.mjs`**) compares **Phase 4** narrative alignment only (roadmap vs feature matrix vs task state for **`T193`–`T195`**). It is **not** a general “queue vs roadmap” validator for current phases. When **`state.json`** is absent, the script can fall back to SQLite or roadmap-only behavior (see script header comments and **`CHANGELOG.md`**).

## Optional JSON Schema (editor assist)

For IDE validation only, a **non-authoritative** starter schema lives at **`schemas/task-engine-state.schema.json`**. It documents a **subset** of fields for the **JSON task document** shape; the engine does not load this file for SQLite-backed workspaces.
