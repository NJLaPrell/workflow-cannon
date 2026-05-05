# Phase Journal operator runbook (CAE artifact)

Short checklist for agents and operators using **Phase Journal** commands during phase-scoped work. CAE may surface this artifact when evaluation matches registry activations — **CAE does not run commands for you** (no hidden `wk run` side effects).

## Scope and phase matching

- Registry activations for Phase Journal use **`{ "kind": "phaseKey", "value": "79" }`** (and future phase rows as maintainers add them) combined with specific **`commandName`** conditions.
- **`evaluation-context-builder`** sets `task.phaseKey` from the task row when present, otherwise from **`workspace.currentKitPhase`** (digits-only string). See **`.ai/cae/evaluation-context.md`** field table. `cae-evaluate` **only** compares `ctx.task.phaseKey` — there is no separate workspace-phase predicate.

## Priority ladder (does not override pilot policy bundles)

Phase **79** journal activations ship at priority **72** (`think`) and **71** (`do`, advisory). Pilot policy surfaces such as **`cae.activation.policy.document-project`** (75) and **`cae.activation.policy.phase70-playbook`** (100) stay **above** this bundle so journal nudges never silently supersede policy activation rows.

## Read surfaces (Tier C unless noted)

1. **`get-phase-context`** — bounded relevance-ranked notes for a task or phase. Prefer stable projections over ad hoc prose.
2. **`list-phase-notes`** — inventory when you need filters (`status`, `limit`, `includeExpired`).
3. **`get-next-actions`** / **`agent-session-snapshot`** — already embed **`phaseContext`** / **`phaseJournal`** summaries; drill down with **`get-phase-context`** when needed.

Schema + argv discovery: **`.ai/agent-cli-snippets/by-command/get-phase-context.json`**, **`list-phase-notes.json`**.

Example:

```bash
pnpm exec wk run get-phase-context '{"taskId":"T100041","limit":10}'
```

## Writes and mutators

- **`add-phase-note`** — idempotent when **`clientMutationId`** repeats; respect token caps in **`PHASE_JOURNAL.md`**. Snippet: **`.ai/agent-cli-snippets/by-command/add-phase-note.json`**.
- **`dismiss-phase-note`**, **`supersede-phase-note`**, **`update-phase-note`**, **`convert-phase-note-to-task`** — follow Tier **B** / sensitivity from **`--schema-only`** / **`src/modules/task-engine/instructions/*.md`**; use JSON **`policyApproval`** when the manifest requires it (**`.ai/POLICY-APPROVAL.md`**).
- **`propose-tasks-from-phase-notes`** — harvest proposals; does not substitute lifecycle policy.

## Task transitions + journal

Optional **`phaseNotes`** on **`run-transition`** attach notes in the **same transaction** as the transition. Validate shapes against the **`add-phase-note`** subset; Tier **A** **`policyApproval`** applies to **`run-transition`** when policy-sensitive.

Snippet: **`.ai/agent-cli-snippets/by-command/run-transition.json`**. Extended narrative: **`PHASE_JOURNAL.md`** → **Integration points** → **`run-transition`**.

Example skeleton:

```bash
pnpm exec wk run run-transition '{"taskId":"T100041","action":"complete","phaseNotes":[{"noteType":"gotcha","summary":"…","idempotencyKey":"79:T100041:…"}],"policyApproval":{"confirmed":true,"rationale":"…"},"expectedPlanningGeneration":2136}'
```

## Registry pointers

- Artifact id: **`cae.runbook.phase-journal-operator`** (**`.ai/cae/registry/artifacts.v1.json`**).
- Activation ids: **`cae.activation.think.phase79-phase-journal-run-transition`**, **`cae.activation.think.phase79-phase-journal-get-context`**, **`cae.activation.do.phase79-phase-journal-add-note`** (**`.ai/cae/registry/activations.v1.json`**).

## Explicit non-goals

- Do not paste raw SQLite from **`phase_notes`** into CAE traces or chat.
- Do not treat CAE surfacing this artifact as approval to skip **`policyApproval`** on Tier A/B commands.
