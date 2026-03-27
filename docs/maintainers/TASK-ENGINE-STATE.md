# Task engine state (`.workspace-kit/tasks/state.json`)

## What is validated today

The task engine persists tasks in a JSON document. The runtime **loads JSON with `JSON.parse`** and expects:

- Top-level **`schemaVersion`** (number) and **`tasks`** (array).
- **`transitionLog`** (array) for audit history when present.
- Each task object includes at minimum: **`id`**, **`status`**, **`type`**, **`title`**, **`createdAt`**, **`updatedAt`**, **`priority`**, **`phase`** (string), plus optional **`dependsOn`**, **`unblocks`**, **`approach`**, **`technicalScope`**, **`acceptanceCriteria`**, **`metadata`**.

There is **no separate JSON Schema file enforced at load time** in the published CLI today; invalid shapes surface as runtime errors when code reads specific fields. Treat hand-edits as risky—prefer **`workspace-kit run`** task-derived transitions when your workspace kit profile enables them.

## Maintainer expectations

- **Canonical queue:** `docs/maintainers/ROADMAP.md` is strategic; **task ids and status live in state**.
- **Planning check:** `pnpm run check-planning-consistency` aligns high-level Phase 4 narrative across roadmap, feature matrix, and task state (see script for scope).

## Optional JSON Schema (editor assist)

For IDE validation only, a **non-authoritative** starter schema lives at **`schemas/task-engine-state.schema.json`**. It documents a **subset** of fields for autocomplete; the engine does not load this file.
