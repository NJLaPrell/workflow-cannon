# Phase journal retention and phase-close hygiene

Canonical phase for **default** phase journal reads is the same as queue health / `get-next-actions`: **`kit_workspace_status.current_kit_phase`** when parseable, else **`kit.currentPhaseNumber`** in workspace config (see **`resolveCanonicalPhase`** in `src/modules/task-engine/phase-resolution.ts`).

## Default reads (current phase only)

These commands scope **active** notes to **one** `phase_key` at a time. When **`phaseKey`** is omitted, workspace-kit resolves it from canonical workspace phase (or from **`taskId`** task metadata when provided):

- **`list-phase-notes`**
- **`get-phase-context`**
- **`propose-tasks-from-phase-notes`**

They **do not** merge notes across phases in one call. To audit another phase, pass an explicit **`phaseKey`** (historical / cross-phase review).

Converted notes remain in SQLite with **`status: converted`** and **`converted_task_id`**; default **`status`** filters on the list command still exclude them from “active work” surfaces unless callers ask for **`status: "converted"`** (or mixed arrays).

## Phase-close checklist (maintainers)

Before treating a phase as closed for **execution** purposes:

1. **Canonical phase** — Rollover via **`workspace-kit run set-current-phase`** (or equivalent) so **`kit_workspace_status`** matches the next phase; see [workspace-status-sqlite.md](./workspace-status-sqlite.md).
2. **Critical follow-ups** — For **blocker**, **risk**, **follow-up**, and **task-suggestion** notes that still matter: **`convert-phase-note-to-task`**, **`dismiss-phase-note`** (with reason), **`supersede-phase-note`**, or add a carry-forward note in the **new** phase.
3. **Agent surfaces** — After rollover, **`get-next-actions`**, **`agent-session-snapshot`**, and phase journal reads without **`phaseKey`** attach to the **new** current phase automatically.
4. **Evidence** — Phase delivery / PR evidence stays on tasks; journal **`converted`** rows keep the link for traceability.

## Related

- Machine canon: **`.ai/runbooks/phase-journal-retention.md`** (this file), **`.ai/cae/phase-journal-operator.md`**, task-engine **`src/modules/task-engine/instructions/*phase-note*.md`**.
- SQLite authority: [workspace-status-sqlite.md](./workspace-status-sqlite.md).
