# PHASE_JOURNAL.md

## Purpose

Phase Journal is a proposed **task-engine feature** for Workflow Cannon.

It gives agents a lightweight, phase-scoped way to leave short operational notes while working on tasks. Those notes can later guide other agents working in the same phase, surface in task-engine context commands, and become proposed or approved follow-up tasks.

This is **not** a general AI memory system. It is a structured, auditable, task-engine-backed phase note ledger.

## Product sentence

Task engine remembers what agents learned during this phase.

## Problem

During a phase, agents repeatedly discover small but important facts:

- a module has a hidden dependency
- a doc table is stale but should later become generated
- a command has a gotcha
- a test is the right validation path
- a follow-up task should be created
- a decision is pending and should not be bypassed

Today that knowledge often lives in chat. Long chats get compacted, restarted, or ignored. The next agent may rediscover the same thing and burn tokens.

Phase Journal moves that context into task-engine state where it can be retrieved deterministically.

## Goals

- Let agents leave short, structured notes while doing phase work.
- Attach notes to a phase, and optionally to a task, module, file, command, or decision.
- Surface relevant notes when agents start or continue other tasks in the same phase.
- Support follow-up task suggestions from notes.
- Support converting notes into proposed or active tasks through the normal task-engine policy path.
- Keep notes short enough to control token usage.
- Preserve task engine as the authority for actual work status.

## Non-goals

- Do not build general long-term AI memory.
- Do not store full chat transcripts.
- Do not replace tasks, task status, dependencies, or acceptance criteria.
- Do not auto-create tasks from notes without review or policy approval.
- Do not surface every note in every prompt.
- Do not make notes authoritative over task-engine state.
- Do not require agents to write long summaries.

## Design principle

Phase Journal notes are **operational breadcrumbs**, not essays.

A good note is short, specific, and useful to another agent later.

Bad note:

```text
I explored the module system and it seems like maybe config is kind of spread around and we should maybe think about improving it later.
```

Good note:

```text
Config defaults for skills/plugins are centralized in MODULE_CONFIG_CONTRIBUTIONS. Do not add module-local defaults until T-MOD-010 decides ownership.
```

## Placement

Build Phase Journal inside the **task-engine module** first.

Rationale:

- Notes are phase/task operational state.
- Notes need to interact with task IDs, phases, transitions, blockers, and next-action selection.
- Notes should surface in `agent-session-snapshot` and `get-next-actions`.
- Notes may create proposed tasks through task-engine policy gates.

If the feature grows beyond task-engine boundaries later, it can be extracted into a dedicated module that depends on task-engine.

## Core concepts

### Phase note

A phase note is a short structured record attached to a phase.

It may also reference:

- task
- module
- file
- command
- doc
- decision
- test
- generated artifact

### Phase context

Phase context is the subset of active phase notes relevant to the current task or module.

### Task suggestion

A task suggestion is a proposed follow-up captured from a note. It is not a real task until converted through task-engine commands and required policy approval.

## Note types

Use a small fixed set at first:

```text
finding
gotcha
decision
blocker
follow-up
task-suggestion
risk
reusable-context
```

Do not allow unlimited custom note types in the MVP.

## Note statuses

Use explicit lifecycle statuses:

```text
active
converted
superseded
dismissed
expired
```

Meaning:

| Status | Meaning |
| --- | --- |
| `active` | Relevant and should be considered. |
| `converted` | Converted into a task or task proposal. |
| `superseded` | Replaced by a newer note. |
| `dismissed` | Reviewed and intentionally ignored. |
| `expired` | No longer relevant because time/phase/context passed. |

## Token-control rules

Hard limits should be enforced by command validation:

| Field | Limit |
| --- | --- |
| `summary` | 280 characters |
| `details` | 1,200 characters |
| `refs` | 10 refs max |
| notes returned by default | 8 max |
| task suggestions returned by default | 5 max |

Notes should be optimized for future usefulness, not completeness.

## Data model

### `phase_notes`

```sql
CREATE TABLE phase_notes (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL,
  task_id TEXT,
  author TEXT,
  note_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  superseded_by TEXT,
  converted_task_id TEXT
);
```

### `phase_note_refs`

```sql
CREATE TABLE phase_note_refs (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_value TEXT NOT NULL
);
```

Suggested `ref_type` values:

```text
file
command
task
module
doc
decision
test
generated-artifact
```

### `phase_note_task_suggestions`

This table can be deferred until the second pass, but the design should leave room for it.

```sql
CREATE TABLE phase_note_task_suggestions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suggested_status TEXT NOT NULL DEFAULT 'proposed',
  suggested_phase_id TEXT NOT NULL,
  suggested_task_type TEXT,
  acceptance_criteria_json TEXT
);
```

## Priority values

Keep priority simple:

```text
low
normal
high
critical
```

Default: `normal`.

Use `critical` sparingly for notes that should interrupt task selection, such as active risks or blockers.

## Commands

### MVP commands

#### `add-phase-note`

Adds a short note to a phase.

Example:

```bash
wk run add-phase-note '{
  "phaseId": "phase-7",
  "taskId": "T238",
  "noteType": "gotcha",
  "summary": "Do not move config defaults until config ownership decision lands.",
  "details": "skills/plugins currently receive discovery roots through centralized config contributions.",
  "refs": [
    {"type": "file", "value": "src/core/workspace-kit-config.ts"},
    {"type": "task", "value": "T-MOD-010"}
  ]
}'
```

Suggested behavior:

- Does not require heavy policy approval for ordinary notes.
- Validates note type, summary length, details length, refs count, and phase/task existence when possible.
- Returns created note ID and normalized note payload.

#### `list-phase-notes`

Lists notes for a phase.

Example:

```bash
wk run list-phase-notes '{
  "phaseId": "phase-7",
  "status": "active",
  "limit": 20
}'
```

Suggested behavior:

- Defaults to active notes.
- Supports filters by `noteType`, `taskId`, `module`, `ref`, `priority`, and status.
- Returns newest or highest-priority notes first.

#### `get-phase-context`

Returns the most relevant notes for current work.

Example:

```bash
wk run get-phase-context '{
  "phaseId": "phase-7",
  "taskId": "T241",
  "limit": 8
}'
```

Suggested behavior:

Prefer notes matching:

1. same phase
2. same task
3. same module refs
4. same file refs
5. active blockers/risks
6. high priority notes
7. recent notes
8. note types `decision`, `gotcha`, `risk`, `reusable-context`, `follow-up`

This should become the main read path used by agents.

#### `dismiss-phase-note`

Marks a note as dismissed.

Example:

```bash
wk run dismiss-phase-note '{
  "noteId": "PN-014",
  "reason": "No longer relevant after module standard decision landed."
}'
```

Suggested behavior:

- Requires a reason.
- May require policy approval if dismissal affects high-priority or blocker notes.

#### `supersede-phase-note`

Marks one note as superseded by another.

Example:

```bash
wk run supersede-phase-note '{
  "noteId": "PN-014",
  "supersededBy": "PN-022"
}'
```

### Second-pass commands

#### `convert-phase-note-to-task`

Converts a note into a task in the same phase unless overridden.

Example:

```bash
wk run convert-phase-note-to-task '{
  "noteId": "PN-014",
  "status": "proposed",
  "policyApproval": {
    "confirmed": true,
    "rationale": "Convert reusable phase note into proposed follow-up task."
  }
}'
```

Suggested behavior:

- Requires policy approval because it mutates task state.
- Defaults new task phase to the note's phase.
- Marks note `converted` and stores `converted_task_id`.

#### `propose-tasks-from-phase-notes`

Returns candidate tasks from active notes without creating them by default.

Example:

```bash
wk run propose-tasks-from-phase-notes '{
  "phaseId": "phase-7",
  "limit": 5
}'
```

Suggested behavior:

- Read-only by default.
- Identifies active `follow-up`, `task-suggestion`, `risk`, and unresolved `blocker` notes.
- Returns task proposal payloads that can be reviewed and then converted.

## Integration points

### `agent-session-snapshot`

Add phase journal context to the snapshot output.

Suggested shape:

```json
{
  "phaseJournal": {
    "phaseId": "phase-7",
    "activeNotes": [],
    "risks": [],
    "openFollowUps": []
  }
}
```

This helps agents recover after long or compacted sessions without rereading long chat history.

### `get-next-actions`

Include relevant phase context when suggesting work.

Suggested shape:

```json
{
  "phaseContext": {
    "relevantNotes": [],
    "taskSuggestionsFromNotes": []
  }
}
```

Do not let notes override task status. Notes should explain context and suggest follow-up work, not replace task-engine authority.

### `run-transition`

Allow optional phase notes during transitions.

Example:

```json
{
  "taskId": "T238",
  "action": "complete",
  "phaseNotes": [
    {
      "noteType": "gotcha",
      "summary": "The README table is stale but should eventually become generated, not hand-maintained."
    }
  ],
  "policyApproval": {
    "confirmed": true,
    "rationale": "Complete task with phase note evidence."
  }
}
```

Suggested behavior:

- Notes added during task transition should inherit the task's phase when possible.
- If `phaseId` cannot be inferred, require it explicitly.
- Note creation should not cause the transition to partially succeed. Either write both transactionally or return a clear error before mutation.

## Suggested task-engine API surface

Add internal helpers similar to:

```ts
addPhaseNote(input, ctx)
listPhaseNotes(input, ctx)
getPhaseContext(input, ctx)
dismissPhaseNote(input, ctx)
supersedePhaseNote(input, ctx)
convertPhaseNoteToTask(input, ctx)
proposeTasksFromPhaseNotes(input, ctx)
```

Suggested files, subject to current task-engine layout:

```text
src/modules/task-engine/phase-journal/
  index.ts
  schema.ts
  store.ts
  relevance.ts
  commands.ts
  types.ts
```

If the module refactor has already introduced a standardized `commands/` or `state/` layout, adapt this feature to that pattern.

## Relevance scoring

`get-phase-context` should rank notes deterministically.

Suggested initial scoring:

| Signal | Points |
| --- | ---: |
| Same task | +50 |
| Same phase | required |
| Ref matches current module | +25 |
| Ref matches current file | +25 |
| Note type `decision` | +20 |
| Note type `gotcha` | +20 |
| Note type `risk` | +20 |
| Note type `blocker` | +20 |
| Priority `critical` | +40 |
| Priority `high` | +20 |
| Created in last 7 days | +10 |
| Status is not `active` | exclude by default |

The first implementation can be simple. Determinism matters more than cleverness.

## Policy and approval guidance

Recommended policy split:

| Command | Policy approval? | Reason |
| --- | --- | --- |
| `add-phase-note` | No, unless configured otherwise | Low-risk context append. |
| `list-phase-notes` | No | Read-only. |
| `get-phase-context` | No | Read-only. |
| `dismiss-phase-note` | Maybe | Can hide context. Require reason at minimum. |
| `supersede-phase-note` | Maybe | Can hide context. Require target note. |
| `propose-tasks-from-phase-notes` | No if read-only | Produces proposals only. |
| `convert-phase-note-to-task` | Yes | Mutates task state. |
| phase notes attached to `run-transition` | Covered by transition policy | Should be transactional with transition. |

## MVP build plan

### T-PJ-001 — Add phase journal schema and store

Acceptance criteria:

- `phase_notes` table exists.
- `phase_note_refs` table exists.
- Store can create, list, retrieve, dismiss, and supersede notes.
- Migration is idempotent.
- Existing task-engine persistence behavior is unchanged.

### T-PJ-002 — Add MVP commands

Acceptance criteria:

- `add-phase-note` works.
- `list-phase-notes` works.
- `get-phase-context` works.
- `dismiss-phase-note` works.
- `supersede-phase-note` works.
- Command manifest and instruction files are updated.
- Commands validate limits and enums.

### T-PJ-003 — Surface notes in agent snapshots

Acceptance criteria:

- `agent-session-snapshot` includes `phaseJournal` when a phase can be inferred or provided.
- Snapshot returns at most the default note limit.
- Snapshot excludes non-active notes by default.
- Output remains bounded and deterministic.

### T-PJ-004 — Surface notes in next-action selection

Acceptance criteria:

- `get-next-actions` includes relevant phase context when phase is known.
- Notes do not override task status or selection rules.
- Notes can contribute follow-up suggestions.
- Output remains bounded and deterministic.

### T-PJ-005 — Add optional notes to task transitions

Acceptance criteria:

- `run-transition` accepts optional `phaseNotes`.
- Phase can be inferred from the task when possible.
- Transition and note writes are transactional.
- Validation failure prevents mutation before writes.
- Existing transition behavior is unchanged when `phaseNotes` is omitted.

### T-PJ-006 — Add task proposal path

Acceptance criteria:

- `propose-tasks-from-phase-notes` returns task candidates without creating tasks.
- `convert-phase-note-to-task` creates a proposed task with policy approval.
- Converted notes are marked `converted`.
- Converted note stores `converted_task_id`.

## Example workflow

1. Agent starts `T238` in `phase-7`.
2. Agent calls `get-phase-context` for `phase-7` and `T238`.
3. Agent works the task.
4. Agent discovers a useful gotcha.
5. Agent calls `add-phase-note`.
6. Agent completes the task with optional `phaseNotes` on `run-transition`.
7. Another agent starts `T241` in `phase-7`.
8. `agent-session-snapshot` surfaces the relevant note.
9. `get-next-actions` suggests a follow-up from unresolved phase notes.
10. Maintainer or agent converts the note to a proposed task through policy-approved command.

## Success criteria

Phase Journal is working when:

- agents stop rediscovering the same phase-specific gotchas
- long chat recovery uses task-engine output instead of memory
- follow-up tasks can be proposed from notes without free-form chat archaeology
- phase notes stay short, bounded, and relevant
- task-engine remains the authority for task state

## Strong recommendation

Keep the MVP boring and deterministic.

Do not add embedding search, summarization, or semantic memory first. Start with structured notes, refs, filters, and deterministic relevance scoring. If the boring version gets used, then consider richer retrieval later.
