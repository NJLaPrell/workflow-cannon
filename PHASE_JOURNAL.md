# PHASE_JOURNAL.md

## Purpose

Phase Journal is a proposed **task-engine feature** for Workflow Cannon.

It gives agents a lightweight, phase-scoped way to leave short operational notes while working on tasks. Those notes can later guide other agents working in the same phase, surface in task-engine readout commands, and become proposed or approved follow-up tasks.

This is **not** a general AI memory system. It is a structured, auditable, task-engine-backed phase note ledger.

## Product sentence

Task engine remembers what agents learned during this phase.

## Architectural decision

Build Phase Journal inside the **task-engine module** first.

Rationale:

- Notes are phase/task operational state.
- Notes need to interact with task IDs, stable phase keys, transitions, blockers, evidence, and next-action selection.
- Notes should surface through task-engine read models such as `agent-session-snapshot`, `get-next-actions`, and a dedicated `get-phase-context` command.
- Notes may create proposed tasks through existing task-engine task creation paths.
- Agents must consume stable command projections, not raw SQLite tables.

If the feature later grows beyond task-engine boundaries, it may be extracted into a dedicated module that depends on `task-engine`. That is not the MVP.

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
- Attach notes to a stable `phaseKey`, and optionally to a task, module, file, command, doc, test, or decision.
- Surface relevant notes when agents start or continue other tasks in the same phase.
- Support follow-up task suggestions from notes.
- Support converting notes into proposed tasks through normal task-engine paths.
- Keep notes short enough to control token usage.
- Preserve task engine as the authority for actual work status.

## Non-goals

- Do not build general long-term AI memory.
- Do not store full chat transcripts.
- Do not replace tasks, task status, dependencies, acceptance criteria, or transition evidence.
- Do not auto-create tasks from notes without review.
- Do not surface every note in every prompt.
- Do not make notes authoritative over task-engine state.
- Do not expose raw `phase_notes` tables as the agent read contract.
- Do not add embeddings, semantic search, summarization, or vector memory in the MVP.
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

## Phase identity

Use `phaseKey` as the stable phase identity.

Do **not** use loose `phaseId` as the primary field. Task-engine already distinguishes stable phase keys from human phase labels. Human labels may drift; phase keys should be used for joins, filters, relevance, and phase-close behavior.

Command inputs may accept `phaseKey` directly. If a command only receives `taskId`, it should infer `phaseKey` from the task when possible.

Optional `phaseLabel` may be stored for display only.

## Core concepts

### Phase note

A phase note is a short structured record attached to a stable phase key.

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

Phase context is the bounded subset of active phase notes relevant to the current task, module, file, or phase.

### Task suggestion

A task suggestion is a proposed follow-up captured from a note. It is not a real task until converted through task-engine commands.

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

| Status | Meaning |
| --- | --- |
| `active` | Relevant and should be considered. |
| `converted` | Converted into a task or task proposal. |
| `superseded` | Replaced by a newer note. |
| `dismissed` | Reviewed and intentionally ignored. |
| `expired` | No longer relevant because time, phase, or context passed. |

## Token-control rules

Hard limits should be enforced by command validation:

| Field | Limit |
| --- | ---: |
| `summary` | 280 characters |
| `details` | 1,200 characters |
| `refs` | 10 refs max |
| notes returned by default | 8 max |
| notes returned in `agent-session-snapshot` by default | 3 max |
| task suggestions returned by default | 5 max |

Notes should be optimized for future usefulness, not completeness.

## Privacy and secret-safety rules

Phase notes must not contain:

- secrets
- credentials
- tokens
- private keys
- full stack traces unless explicitly needed and scrubbed
- large copied source/doc excerpts
- private user data not needed for workflow execution

If Workflow Cannon has an active secret-guard or redaction utility, Phase Journal writes should reuse it before persistence. At minimum, command instructions must tell agents to summarize sensitive findings without copying secrets.

## Data model

### `phase_notes`

Use `phase_key`, not `phase_id`, as the stable join key.

```sql
CREATE TABLE phase_notes (
  id TEXT PRIMARY KEY,
  phase_key TEXT NOT NULL,
  phase_label TEXT,
  task_id TEXT,
  author TEXT,
  author_kind TEXT,
  session_id TEXT,
  source_command TEXT,
  planning_generation INTEGER,
  policy_trace_id TEXT,
  note_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  superseded_by TEXT,
  converted_task_id TEXT,
  idempotency_key TEXT
);
```

### `phase_note_refs`

```sql
CREATE TABLE phase_note_refs (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_value TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES phase_notes(id)
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
  suggested_phase_key TEXT NOT NULL,
  suggested_phase_label TEXT,
  suggested_task_type TEXT,
  acceptance_criteria_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES phase_notes(id)
);
```

### Required indexes

Add indexes in the first schema migration. Do not defer these.

```sql
CREATE INDEX idx_phase_notes_phase_status
ON phase_notes (phase_key, status, priority, created_at);

CREATE INDEX idx_phase_notes_task
ON phase_notes (task_id);

CREATE INDEX idx_phase_notes_idempotency
ON phase_notes (idempotency_key);

CREATE INDEX idx_phase_note_refs_note
ON phase_note_refs (note_id);

CREATE INDEX idx_phase_note_refs_lookup
ON phase_note_refs (ref_type, ref_value);
```

If SQLite uniqueness around nullable idempotency keys is needed, use a partial unique index where supported:

```sql
CREATE UNIQUE INDEX idx_phase_notes_idempotency_unique
ON phase_notes (idempotency_key)
WHERE idempotency_key IS NOT NULL;
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

## Idempotency

`add-phase-note` and transition-attached `phaseNotes` must support idempotency.

Recommended input field:

```json
{
  "idempotencyKey": "phase-7:T238:config-defaults-gotcha"
}
```

If omitted, the implementation may derive a stable digest from:

```text
phaseKey + taskId + noteType + summary + normalized refs
```

Repeated calls with the same idempotency key should return the existing note rather than creating duplicates.

## Commands

### MVP commands

#### `add-phase-note`

Adds a short note to a phase.

Example:

```bash
wk run add-phase-note '{
  "phaseKey": "phase-7",
  "phaseLabel": "Phase 7",
  "taskId": "T238",
  "noteType": "gotcha",
  "summary": "Do not move config defaults until config ownership decision lands.",
  "details": "skills/plugins currently receive discovery roots through centralized config contributions.",
  "refs": [
    {"type": "file", "value": "src/core/workspace-kit-config.ts"},
    {"type": "task", "value": "T-MOD-010"}
  ],
  "idempotencyKey": "phase-7:T238:config-defaults-gotcha"
}'
```

Suggested behavior:

- Policy sensitivity: non-sensitive by default.
- Validates note type, priority, summary length, details length, refs count, and secret-safety rules.
- Validates phase/task existence when possible.
- Infers `phaseKey` from `taskId` when possible.
- Returns created or existing note ID and normalized note payload.

#### `list-phase-notes`

Lists notes for a phase.

Example:

```bash
wk run list-phase-notes '{
  "phaseKey": "phase-7",
  "status": "active",
  "limit": 20
}'
```

Suggested behavior:

- Defaults to active notes.
- Supports filters by `noteType`, `taskId`, `module`, `ref`, `priority`, and status.
- Returns newest or highest-priority notes first.
- Returns bounded projections, not raw rows.

#### `get-phase-context`

Returns the most relevant notes for current work.

Example:

```bash
wk run get-phase-context '{
  "phaseKey": "phase-7",
  "taskId": "T241",
  "refs": [
    {"type": "module", "value": "task-engine"},
    {"type": "file", "value": "src/modules/task-engine/task-engine-internal.ts"}
  ],
  "limit": 8
}'
```

Suggested behavior:

Prefer notes matching:

1. same stable phase key
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
- Policy sensitivity: non-sensitive for ordinary notes.
- May be sensitive for `critical` notes if configured.
- Should preserve an audit trail through updated status, timestamp, and provenance.

#### `supersede-phase-note`

Marks one note as superseded by another.

Example:

```bash
wk run supersede-phase-note '{
  "noteId": "PN-014",
  "supersededBy": "PN-022"
}'
```

Suggested behavior:

- Requires `supersededBy` to refer to an existing note.
- May be sensitive for `critical` notes if configured.

### Second-pass commands

#### `convert-phase-note-to-task`

Converts a note into a task in the same phase unless overridden.

Example:

```bash
wk run convert-phase-note-to-task '{
  "noteId": "PN-014",
  "status": "proposed"
}'
```

Suggested behavior:

- Reuse existing task-engine task creation paths such as `create-task` / task row mutation helpers.
- Defaults new task `phaseKey` to the note's `phase_key`.
- Defaults new task phase label to the note's `phase_label` when present.
- Marks note `converted` and stores `converted_task_id`.
- Policy sensitivity should align with existing task creation behavior:
  - converting to `proposed`: non-sensitive, consistent with ordinary task creation if current project policy treats create-task as non-sensitive
  - converting directly to `ready` or `in_progress`: sensitive or must use existing lifecycle transition path

#### `propose-tasks-from-phase-notes`

Returns candidate tasks from active notes without creating them by default.

Example:

```bash
wk run propose-tasks-from-phase-notes '{
  "phaseKey": "phase-7",
  "limit": 5
}'
```

Suggested behavior:

- Read-only.
- Identifies active `follow-up`, `task-suggestion`, `risk`, and unresolved `blocker` notes.
- Returns task proposal payloads that can be reviewed and then converted.

## Integration points

### `agent-session-snapshot`

Add a **small summary only** by default.

Suggested shape:

```json
{
  "phaseJournal": {
    "phaseKey": "phase-7",
    "phaseLabel": "Phase 7",
    "activeNoteCount": 12,
    "criticalCount": 1,
    "openFollowUpCount": 3,
    "topNotes": [
      {
        "id": "PN-014",
        "noteType": "gotcha",
        "priority": "high",
        "summary": "Config defaults for skills/plugins are centralized in MODULE_CONFIG_CONTRIBUTIONS."
      }
    ]
  }
}
```

Do not include full note `details` in the default snapshot. Agents should call `get-phase-context` or `list-phase-notes` when they need more.

### `get-next-actions`

Include relevant phase context when suggesting work.

Suggested shape:

```json
{
  "phaseContext": {
    "phaseKey": "phase-7",
    "relevantNotes": [],
    "taskSuggestionsFromNotes": []
  }
}
```

Notes must not override task status, dependencies, priority, or selection rules. Notes explain context and suggest follow-up work; tasks remain authoritative.

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
      "summary": "The README table is stale but should eventually become generated, not hand-maintained.",
      "idempotencyKey": "phase-7:T238:readme-table-generated-gotcha"
    }
  ],
  "policyApproval": {
    "confirmed": true,
    "rationale": "Complete task with phase note evidence."
  }
}
```

Suggested behavior:

- Notes added during task transition should inherit the task's `phaseKey` when possible.
- If `phaseKey` cannot be inferred, require it explicitly.
- Transition and note writes must be transactional.
- Validation failure must prevent mutation before writes.
- Existing transition behavior must remain unchanged when `phaseNotes` is omitted.

## Agent read contract

Agents must not read Phase Journal SQLite tables directly.

Supported agent-facing read surfaces:

- `get-phase-context`
- `list-phase-notes`
- `agent-session-snapshot`
- `get-next-actions`
- future stable task-engine read projections

When implemented, update the agent read contract and schemas so the new fields are additive and bounded.

## Command manifest and contract requirements

Each new command must update the same surfaces used by existing task-engine commands:

- `src/contracts/builtin-run-command-manifest.json`
- `src/modules/task-engine/instructions/<command>.md`
- `schemas/task-engine-run-contracts.schema.json`, if the current run-contract checker requires it
- tests for command manifest / instruction parity
- tests for task-engine run contracts

Do not add commands that bypass the builtin manifest and instruction-file pattern.

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

Wire commands through the existing task-engine planning-store dispatch path. Add a resolver similar to other grouped task-engine command resolvers:

```ts
const phaseJournal = await resolvePhaseJournalCommands(command, ctx, planning, store);
if (phaseJournal !== null) return phaseJournal;
```

If the module refactor introduces a standardized `commands/` or `state/` layout first, adapt this feature to that pattern.

## Relevance scoring

`get-phase-context` should rank notes deterministically.

Suggested initial scoring:

| Signal | Points |
| --- | ---: |
| Same task | +50 |
| Same phase key | required |
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
| `dismiss-phase-note` | No by default; maybe for `critical` | Can hide context, but does not mutate task state. Require reason. |
| `supersede-phase-note` | No by default; maybe for `critical` | Can hide context, but keeps supersession chain. |
| `propose-tasks-from-phase-notes` | No | Read-only proposals. |
| `convert-phase-note-to-task` to `proposed` | Match existing `create-task` policy | Reuse existing task creation path. |
| `convert-phase-note-to-task` to `ready` / `in_progress` | Sensitive or use lifecycle transition | Avoid lifecycle bypass. |
| phase notes attached to `run-transition` | Covered by transition policy | Transactional with transition. |

## Retention and phase-close behavior

At phase close, Phase Journal should not leak stale context into future work.

Recommended behavior:

- Active blockers, risks, and follow-ups must be converted, dismissed, superseded, or explicitly carried forward.
- Ordinary notes remain queryable by phase key but are not surfaced by default outside that phase.
- Converted notes remain linked to their converted tasks.
- Notes should be archived by status, not deleted.
- `get-phase-context` should default to the current phase unless a historical phase key is explicitly provided.

## MVP build plan

### T-PJ-001 — Add phase journal schema and store

Acceptance criteria:

- `phase_notes` table exists with `phase_key`, optional `phase_label`, provenance fields, and `idempotency_key`.
- `phase_note_refs` table exists.
- Required indexes exist.
- Store can create, list, retrieve, dismiss, and supersede notes.
- Store supports idempotent create.
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
- Run-contract schemas/checks are updated if required by existing task-engine standards.
- Commands validate limits, enums, refs, phase key, and secret-safety rules.

### T-PJ-003 — Surface bounded notes in agent snapshots

Acceptance criteria:

- `agent-session-snapshot` includes summary-only `phaseJournal` when a phase can be inferred or provided.
- Snapshot returns at most the default snapshot note limit.
- Snapshot excludes non-active notes by default.
- Snapshot does not include full `details` by default.
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
- Phase key can be inferred from the task when possible.
- Transition and note writes are transactional.
- Validation failure prevents mutation before writes.
- Idempotency prevents duplicate transition-attached notes.
- Existing transition behavior is unchanged when `phaseNotes` is omitted.

### T-PJ-006 — Add task proposal path

Acceptance criteria:

- `propose-tasks-from-phase-notes` returns task candidates without creating tasks.
- `convert-phase-note-to-task` reuses existing task creation paths.
- Converted notes are marked `converted`.
- Converted note stores `converted_task_id`.
- Direct conversion to lifecycle states beyond `proposed` cannot bypass transition policy.

## Example workflow

1. Agent starts `T238` in `phase-7`.
2. Agent calls `get-phase-context` for `phase-7` and `T238`.
3. Agent works the task.
4. Agent discovers a useful gotcha.
5. Agent calls `add-phase-note`.
6. Agent completes the task with optional `phaseNotes` on `run-transition`.
7. Another agent starts `T241` in `phase-7`.
8. `agent-session-snapshot` surfaces a bounded summary of relevant phase notes.
9. `get-next-actions` suggests a follow-up from unresolved phase notes.
10. Maintainer or agent converts the note to a proposed task through the existing task-engine creation path.

## Success criteria

Phase Journal is working when:

- agents stop rediscovering the same phase-specific gotchas
- long chat recovery uses task-engine output instead of memory
- follow-up tasks can be proposed from notes without free-form chat archaeology
- phase notes stay short, bounded, and relevant
- task-engine remains the authority for task state
- no agent needs to read raw SQLite to use the feature

## Strong recommendation

Keep the MVP boring and deterministic.

Do not add embedding search, summarization, or semantic memory first. Start with structured notes, refs, indexes, idempotency, filters, stable read models, and deterministic relevance scoring. If the boring version gets used, then consider richer retrieval later.
