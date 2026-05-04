<!--
agentCapsule|v=1|command=convert-phase-note-to-task|module=task-engine|schema_only=pnpm exec wk run convert-phase-note-to-task --schema-only '{}'
-->

# convert-phase-note-to-task

Create a **`proposed`** execution task from an **active** phase note of type **`task-suggestion`** or **`follow-up`**, and mark the note **`converted`** with **`converted_task_id`** in the **same** planning SQLite transaction as the task persist.

Promotion beyond **`proposed`** uses **`run-transition`** (and normal policy gates) only.

## Usage

```
workspace-kit run convert-phase-note-to-task '{"noteId":"<uuid>","expectedPlanningGeneration":1}'
```

## Arguments

- **`noteId`** (required): Phase note id (UUID).
- **`allocateId`**: Must be **`true`** or omitted (default **`true`**); server allocates the next **`T###`** id.
- **`expectedPlanningGeneration`**: Required when **`tasks.planningGenerationPolicy`** is **`require`** (same as **`create-task`**).
- **`suggestionId`** (optional): When **`phase_note_task_suggestions`** rows exist, pin the convert to a persisted suggestion id for that **`noteId`**; the row’s **`converted_task_id`** is set in the same transaction as the note + task flush.
- Optional task body overrides: **`title`**, **`summary`**, **`description`**, **`type`**, **`phase`**, **`phaseKey`**, **`priority`**, **`dependsOn`**, **`unblocks`**, **`metadata`**, **`features`**, … — defaults are derived from the note.
- **`dryRun`**: When **`true`**, validates without persisting.
- **`clientMutationId`**: Optional idempotency key (same semantics as **`create-task`** with **`allocateId:true`**).
