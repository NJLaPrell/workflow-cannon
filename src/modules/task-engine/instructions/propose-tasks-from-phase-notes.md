<!--
agentCapsule|v=1|command=propose-tasks-from-phase-notes|module=task-engine|schema_only=pnpm exec wk run propose-tasks-from-phase-notes --schema-only '{}'
-->

# propose-tasks-from-phase-notes

Read-only harvest of **active** phase notes whose `noteType` is **`task-suggestion`** or **`follow-up`**, as candidates for later **`convert-phase-note-to-task`**. Does **not** create or mutate tasks.

## Usage

```
workspace-kit run propose-tasks-from-phase-notes '{"phaseKey":"78"}'
workspace-kit run propose-tasks-from-phase-notes '{"taskId":"T100","limit":5}'
```

## Arguments

Provide **`phaseKey`** or **`taskId`** (for phase inference), optional **`limit`** (bounded like **`list-phase-notes`**).
