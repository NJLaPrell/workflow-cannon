<!--
agentCapsule|v=1|command=propose-tasks-from-phase-notes|module=task-engine|schema_only=pnpm exec wk run propose-tasks-from-phase-notes --schema-only '{}'
-->

# propose-tasks-from-phase-notes

Read-only harvest of **active** phase notes whose `noteType` is **`task-suggestion`** or **`follow-up`**, as candidates for later **`convert-phase-note-to-task`**. Does **not** create or mutate **tasks**.

When **`persist`** is **`true`**, upserts one bounded row per candidate into planning SQLite **`phase_note_task_suggestions`** (requires kit SQLite **`user_version` ≥ 20**). Default **`persist`** is **`false`** (no suggestion-table writes).

When **`phaseKey`** is omitted, phase scope follows the **canonical current workspace phase** (`kit_workspace_status` / config fallback) or **`taskId`** inference, same as **`list-phase-notes`**.

## Usage

```
workspace-kit run propose-tasks-from-phase-notes '{"phaseKey":"78"}'
workspace-kit run propose-tasks-from-phase-notes '{"taskId":"T100","limit":5}'
workspace-kit run propose-tasks-from-phase-notes '{"phaseKey":"78","persist":true}'
workspace-kit run propose-tasks-from-phase-notes '{"persist":true}'
```

## Arguments

Provide **`phaseKey`** or **`taskId`** (for phase inference), optional **`limit`** (bounded like **`list-phase-notes`**), optional **`persist`** (**`boolean`**, default **`false`**) to upsert **`phase_note_task_suggestions`** rows.
