# Idea Planning System Plan

## Purpose

Workflow Cannon should turn a raw human idea into a reliable execution plan through a natural collaboration between a human operator and a planning agent.

The target loop is:

```text
Idea
→ planner-chat brainstorming
→ PlanArtifact v1 draft
→ deterministic review
→ explicit human acceptance
→ WBS-backed phase/task preview
→ finalized Task Engine tasks
→ dashboard visibility and execution tracking
```

The plan should not be a loose chat summary, a wishlist item, or a manually assembled pile of tasks. The durable planning source of truth is the structured, versioned `PlanArtifact v1`. Chat is the discovery surface. Task Engine remains the execution source of truth.

## Product Goal

Create a stable, efficient, and reliable planning workflow that allows an operator to click **Plan this** for an Ideas row in the dashboard and start a planning session in Cursor chat.

The planning agent should then work with the human user to:

- understand the idea;
- clarify intent, constraints, non-goals, affected systems, and target outcome;
- suggest better options when the first idea is weak or incomplete;
- assess value, risk, technical impact, UI impact, testing needs, and rollout concerns;
- produce a complete PlanArtifact with WBS and task-generation-ready payloads;
- guide the user through review and explicit acceptance;
- generate phase-ready tasks from the accepted WBS only after approval.

## Current State Summary

The repository already contains the correct direction and most of the foundation:

- `PLANNER.md` defines the product direction: PlanArtifact as durable design truth, Task Engine as execution truth, Dashboard as operating surface, and CAE as guidance layer.
- `PLANNER_TASKS.md` contains an implementation WBS for PlanArtifact v1 and the planner lifecycle.
- `PLANNER_SCHEMA.md` defines the field-level contract for PlanArtifact v1.
- `PLANNER_COMMANDS.md` defines command contracts for `draft-plan-artifact`, `review-plan-artifact`, `accept-plan-artifact`, and `finalize-plan-to-phase`.
- `.ai/playbooks/planner-chat.md` defines the natural chat workflow for turning an Ideas row into an accepted plan and executable tasks.
- `extensions/cursor-workflow-cannon/src/planner-chat-prompt.ts` builds the chat prompt used when planning from an Ideas row.
- `src/modules/planning/index.ts` already routes the PlanArtifact lifecycle commands.
- `src/modules/ideas/index.ts` supports Ideas rows, idea status, linked plan artifact metadata, and planning-chat session persistence.
- `test/plan-artifact-e2e-cli.test.mjs` proves the CLI golden path can draft, review, accept, finalize, persist, and list ready tasks.
- `extensions/cursor-workflow-cannon/test/dashboard-plan-artifact-happy-path.test.mjs` already asserts the dashboard should expose Review, Accept, Finalize, Resume planning, and should not leak raw CLI invocations.

The problem is not missing vision. The problem is that the newer PlanArtifact flow and the older guided `build-plan` interview flow still coexist in ways that make the product surface ambiguous.

## Core Architectural Decision

Make the PlanArtifact lifecycle the primary planning path.

Keep `build-plan` as a compatibility path, migration bridge, and optional legacy/simple interview tool. Do not make it the flagship planning experience.

Authoritative boundaries:

```text
Idea
  raw opportunity or seed captured by the operator

planner-chat / Planning Agent
  natural brainstorming and decision-making session

PlanArtifact v1
  durable, structured, versioned design intent and WBS source of truth

finalize-plan-to-phase
  deterministic compiler from accepted WBS rows into task-engine-compatible drafts/tasks

Task Engine
  execution truth, lifecycle, phase membership, dependencies, evidence

Dashboard
  human control surface for idea status, plan state, WBS, review findings, acceptance, finalize preview, created tasks

CAE
  adaptive planning lenses, risk/value/architecture/testing/decomposition guidance
```

## Desired Operator Experience

### 1. Capture Idea

The operator creates an Ideas row in the dashboard with a title and optional note.

The idea starts as `open`.

### 2. Click Plan This

When the operator clicks **Plan this**:

1. The extension resolves the canonical Ideas row.
2. It builds a `planner-chat` prompt containing:
   - `ideaId`;
   - title;
   - note;
   - existing `linkedPlanArtifact`, when present;
   - `previousPlanArtifacts`, when present.
3. It updates the idea to `planning`.
4. It persists a planning-chat session keyed by `ideaId`.
5. It opens or prefills Cursor chat in a new chat session.
6. The dashboard refreshes and shows **Resume planning** for the active planning session.

### 3. Planning Agent Brainstorm

The Planning Agent opens with a concise recap and asks the next most important clarifying question.

The agent should not run a rigid survey unless the user explicitly requests a fast form. It should ask one useful question at a time and maintain a collaborative planning flow.

The agent should proactively cover these planning lenses:

- outcome and success definition;
- value and priority;
- scope and non-goals;
- affected systems and integration points;
- user stories or operator scenarios;
- architecture implications;
- UI/UX implications;
- risk and mitigation;
- testing and verification;
- rollout, migration, rollback, and support concerns;
- decomposition into one-session-sized WBS rows;
- dependencies and recommended work order;
- implementation guidance and anti-patterns.

### 4. Draft PlanArtifact

When enough information exists, the agent drafts a `PlanArtifact v1` object.

The draft should include, as appropriate:

- identity;
- goals;
- non-goals;
- user stories;
- value assessment;
- risk assessment;
- technical impact;
- architecture notes;
- UI/UX direction;
- testing strategy;
- implementation guidance;
- what not to do;
- assumptions;
- open questions;
- WBS rows;
- phase recommendations;
- task-generation payloads or per-WBS generated task payloads;
- provenance.

The provenance must preserve the Ideas row relationship:

```json
{
  "provenance": {
    "source": "draft-plan-artifact",
    "sourceIdeaId": "I001",
    "previousPlanArtifacts": []
  }
}
```

### 5. Validate and Persist Draft

The agent should run `draft-plan-artifact` first as validate-only while shaping the plan.

Once the user agrees the draft is worth saving, the agent persists it using `draft-plan-artifact` with policy approval and planning-generation metadata as required by the command contract.

The dashboard should then show the current PlanArtifact draft associated with the idea.

### 6. Review PlanArtifact

The agent or dashboard runs `review-plan-artifact`.

Review should produce:

- pass/fail state;
- blockers;
- warnings;
- open question count;
- WBS sizing findings;
- goal/story-to-WBS coverage;
- missing architecture/UI/testing/rollout/migration slices when required by profile.

Review findings should be surfaced as human decisions, not diagnostic noise.

Examples:

- “Acceptance criteria are too vague for WBS-2.”
- “No rollback path is defined for the dashboard persistence change.”
- “The UI work is present, but there is no extension test coverage.”

If there are blockers, the dashboard must disable Accept and keep Resume planning available.

### 7. Accept PlanArtifact

The plan can only be accepted after review blockers are resolved or explicitly allowed by policy.

Acceptance must record:

- confirmed approval;
- approved version;
- approver;
- timestamp;
- planRef;
- review summary;
- any accepted/deferred open questions.

Acceptance is the gate between design and execution. No executable task batch should be created from an unaccepted plan.

### 8. Finalize Plan to Phase

After acceptance, `finalize-plan-to-phase` should:

1. Load the accepted PlanArtifact.
2. Validate that the requested version is accepted.
3. Normalize selected WBS rows into task-engine-compatible drafts.
4. Run task draft review.
5. Return a dry-run preview by default.
6. Persist tasks only when the operator explicitly confirms.
7. Write plan provenance onto each generated task.
8. Mark the plan finalized after successful persistence.

Generated task metadata should include at least:

```json
{
  "metadata": {
    "planRef": "plan-artifact:<planId>",
    "planningProvenance": {
      "planId": "<planId>",
      "planVersion": 2,
      "wbsId": "WBS-3",
      "wbsPath": "1.3",
      "source": "finalize-plan-to-phase"
    }
  }
}
```

## Cleanup Strategy

### Keep but Demote

#### `build-plan`

Keep `build-plan` for compatibility and migration. It can remain useful for existing guided planning workflows, old scripts, and potential import into PlanArtifact.

Do not keep it as the primary dashboard planning UX.

#### Fixed planning question engine

Keep as secondary infrastructure. It may help with small/simple planning types, but it should not drive the flagship “Idea to PlanArtifact” flow.

#### Wishlist artifact planning output

Keep as a bridge only. Wishlist artifacts are not the canonical planning source of truth.

### Deprecate or Hide

#### Dashboard planning wizard

The dashboard still has an in-memory `planningWizard` state and `planningWizardStart` / `planningWizardSubmit` flow that calls `build-plan`.

This should be moved to an advanced/legacy section or removed after compatibility coverage exists.

The main dashboard planning surface should be:

```text
Ideas row
→ Plan this / Resume planning
→ current PlanArtifact status
→ Review / Accept / Finalize
```

#### Direct task creation from `build-plan`

Do not use direct task output from `build-plan` for serious planning. WBS-driven task generation should flow through accepted PlanArtifact and `finalize-plan-to-phase`.

## Implementation Plan

## Phase 0 — Baseline and Safety

### Task 0.1 — Confirm Current Health

Run the baseline commands from repo root:

```bash
pnpm exec wk doctor
pnpm run build
pnpm run test
```

Record any pre-existing failures separately. Do not mix planner work with unrelated store hygiene repairs.

### Task 0.2 — Confirm Existing PlanArtifact Golden Path

Run or preserve coverage for:

- `test/plan-artifact-e2e-cli.test.mjs`;
- `extensions/cursor-workflow-cannon/test/dashboard-plan-artifact-happy-path.test.mjs`.

Acceptance criteria:

- CLI golden path passes.
- Dashboard happy path asserts Review / Accept / Finalize behavior.
- Dashboard tests verify raw CLI invocations are not leaked.

## Phase 1 — Stabilize Ideas → Planner Chat Entry Point

### Task 1.1 — Resolve Canonical Idea Before Prompt Generation

Update `onPrefillIdeaPlanningChat` so it calls `get-idea` or otherwise reads canonical idea state before building the prompt.

Why:

- The webview row payload can be stale or incomplete.
- The playbook explicitly expects existing data to be loaded instead of asking the operator to restate it.

Acceptance criteria:

- If only `ideaId` is supplied, the handler can still build a full prompt from canonical data.
- Missing idea returns a clear dashboard mutation result.
- Tests cover stale/missing title and note inputs.

### Task 1.2 — Carry PlanArtifact History Into Prompt

Update `onPrefillIdeaPlanningChat` to pass:

- `linkedPlanArtifact` as part of context when present;
- `previousPlanArtifacts` into `buildPlannerChatPrompt`.

If `linkedPlanArtifact` exists and the user starts a new planning pass, move or preserve it consistently as part of prior artifact lineage according to the Ideas/PlanArtifact compatibility policy.

Acceptance criteria:

- Prompt includes previous plan artifact refs when present.
- Provenance instructions remain clear.
- Tests cover idea with no artifact, one linked artifact, and multiple previous artifacts.

### Task 1.3 — Make Plan This Idempotent

Repeated clicks on **Plan this** should not create conflicting planning-chat state.

Behavior:

- If an active planning-chat session already exists for the same idea, show/open Resume planning rather than rewriting everything blindly.
- If no active session exists, create/update session and open a new chat prompt.
- Use a stable `clientMutationId` for the dashboard plan action where appropriate.

Acceptance criteria:

- Double-clicking Plan this does not produce duplicate sessions or confusing dashboard state.
- Dashboard message says whether planning was opened, resumed, copied, or prepared.

### Task 1.4 — Improve Resume Planning

Resume should use the latest durable planning-chat session and plan state.

Acceptance criteria:

- Resume planning appears only for matching active session and idea.
- Resume prompt includes latest draft/review context when available.
- Closed/mismatched sessions do not show Resume planning.

## Phase 2 — Add Explicit Planning Agent Surface

### Task 2.1 — Define Planning Agent Contract

Add a named planning agent profile or equivalent registry entry if the project’s agent model supports it.

The Planning Agent should reference:

- `.ai/playbooks/planner-chat.md`;
- `PLANNER_SCHEMA.md`;
- `PLANNER_COMMANDS.md`;
- `.ai/AGENT-CLI-MAP.md`;
- `.ai/POLICY-APPROVAL.md`;
- CAE planning lenses.

Behavioral contract:

- ask one useful question at a time;
- challenge weak assumptions;
- assess value and risk;
- suggest better options;
- create PlanArtifact v1;
- review before acceptance;
- finalize only accepted plans;
- keep user-facing chat focused on planning decisions, not raw command choreography.

Acceptance criteria:

- The dashboard prompt clearly asks for the planning agent/playbook.
- Agents can discover the planner workflow from a stable documented entry.
- Existing tests still assert no raw CLI invocation leaks into prompt text.

### Task 2.2 — Add CAE Planning Lens Activation

Ensure CAE can activate planning lenses for:

- completeness;
- architecture;
- risk;
- testing;
- UI/UX;
- decomposition;
- implementation anti-patterns;
- task sizing;
- rollout/rollback.

Acceptance criteria:

- The planner-chat flow has a documented way to use CAE guidance without becoming a rigid questionnaire.
- Lens wording is specific enough to improve plan quality.

## Phase 3 — Make PlanArtifact the Dashboard Planning Center

### Task 3.1 — Render Idea Planning State

For each Ideas row, show planning status derived from durable state:

- open idea;
- active planning-chat session;
- linked/current PlanArtifact;
- draft/reviewed/accepted/finalized state;
- blocker/warning count;
- WBS count;
- open question count.

Acceptance criteria:

- Operator can understand where each idea is in the planning lifecycle without opening chat.
- Planned and finalized ideas are visually distinct from raw open ideas.

### Task 3.2 — Render PlanArtifact Current Card

The dashboard planning tab should show the current PlanArtifact card:

- title;
- planRef;
- version;
- status;
- planning type;
- updated time;
- WBS row count;
- open question count;
- phase recommendation;
- review findings.

Acceptance criteria:

- Draft plans show Review.
- Reviewed plans show Accept when no blockers exist.
- Reviewed plans with blockers disable Accept and keep Resume planning available.
- Accepted plans show Finalize.
- Finalized plans show created task links or task count.

### Task 3.3 — Show Review Findings as Decisions

Review findings should be displayed in a concise operator-oriented form.

Acceptance criteria:

- Blockers are visually distinct from warnings.
- Findings include enough path/WBS context to repair the plan.
- Accept is blocked when blockers exist.
- The UI avoids dumping raw validator output.

### Task 3.4 — Show Finalize Preview

Before persisting tasks, the dashboard should show a dry-run preview:

- task titles;
- target phase;
- desired status;
- dependencies;
- WBS id/path;
- acceptance criteria summary;
- review result.

Acceptance criteria:

- `finalize-plan-to-phase` defaults to dry-run preview.
- Persist requires explicit operator confirmation.
- Persist uses policy approval and planning generation correctly.

## Phase 4 — Harden PlanArtifact Commands

### Task 4.1 — Draft Command Hardening

Ensure `draft-plan-artifact` validates shape, assigns/stabilizes `planId`, increments version correctly, handles idempotency, and returns storage path and planRef.

Acceptance criteria:

- Validate-only mode does not mutate state.
- Persist mode respects policy and planning-generation gates.
- Idempotent replay returns the same artifact metadata.

### Task 4.2 — Review Command Hardening

Ensure `review-plan-artifact` checks:

- required core sections;
- conditional profile requirements;
- open questions;
- WBS completeness;
- goal/story coverage;
- acceptance criteria quality;
- test coverage;
- architecture/UI/rollout/migration coverage when applicable;
- task sizing and dependency sanity.

Acceptance criteria:

- Review returns actionable blockers/warnings.
- Dashboard can render findings without transformation hacks.
- Tests cover minimal, refactor, full-feature, blocked, and warning-only cases.

### Task 4.3 — Acceptance Command Hardening

Ensure `accept-plan-artifact` refuses acceptance when:

- plan is missing;
- version mismatches latest accepted/reviewed version;
- review blockers remain;
- open questions remain without explicit deferral;
- policy approval is missing.

Acceptance criteria:

- Acceptance pins `approvedVersion`.
- Acceptance writes a complete `approvalRecord`.
- Repeated accept with same version is idempotent.

### Task 4.4 — Finalize Command Hardening

Ensure `finalize-plan-to-phase`:

- requires accepted plan status;
- normalizes WBS rows into task drafts;
- runs task draft review;
- dry-runs by default;
- persists only after explicit approval;
- writes plan provenance onto every task;
- updates plan status to finalized after successful persistence;
- avoids duplicate task creation through idempotency.

Acceptance criteria:

- Finalize before acceptance is blocked.
- Dry-run does not mutate tasks.
- Persist creates correct task count.
- Generated tasks link back to planRef and WBS id/path.

## Phase 5 — Legacy Migration and Deprecation

### Task 5.1 — Label Legacy Planning Interview

Rename or visually demote dashboard guided interview surfaces.

Recommended labels:

- “Legacy planning interview”;
- “Simple guided planning”;
- “Compatibility planner”.

Acceptance criteria:

- The primary dashboard action for ideas is Plan this / Resume planning.
- The old wizard is not confused with the PlanArtifact planner.

### Task 5.2 — Add Build-Plan to PlanArtifact Import Path

Create or document a path to convert old `build-plan` / wishlist planning artifacts into PlanArtifact v1.

Acceptance criteria:

- Existing planning outputs are not stranded.
- Legacy artifacts can become PlanArtifact drafts with clear provenance: `import-build-plan` or `import-wishlist`.

### Task 5.3 — Remove Direct Serious Task Creation From Build-Plan UX

Do not encourage direct task creation from `build-plan` for serious planning.

Acceptance criteria:

- Documentation points serious planning to PlanArtifact.
- Any direct `build-plan` task output is marked preview/compatibility.
- Dashboard task creation from plans routes through `finalize-plan-to-phase`.

## Phase 6 — Reliability and Efficiency

### Task 6.1 — Planning Generation Retry Discipline

Use the existing dashboard mutation retry pattern where appropriate for idea planning mutations, plan acceptance, and finalize persistence.

Acceptance criteria:

- Common planning-generation mismatch is retried once after ingesting fresh generation.
- Repeated mismatch returns a clear error.

### Task 6.2 — Refresh Discipline

Planner actions should not trigger excessive full dashboard refreshes.

Acceptance criteria:

- Idea mutation invalidates only relevant slices/sections.
- PlanArtifact review/accept/finalize refreshes planning and queue sections as needed.
- Active drawer/chat interaction is not disrupted by background refresh.

### Task 6.3 — Idempotency Everywhere

Use client mutation ids for:

- idea planning status updates;
- PlanArtifact draft persistence;
- acceptance;
- finalize persist.

Acceptance criteria:

- Retry does not duplicate plans or tasks.
- The same finalized plan cannot create the same task batch twice under the same mutation id.

### Task 6.4 — Provenance and Drift Readiness

Every generated task should retain enough plan metadata to support future drift detection.

Acceptance criteria:

- Task metadata includes `planRef`, `planId`, `planVersion`, `wbsId`, `wbsPath`, and `source`.
- Dashboard can later compare task scope/status against the originating WBS row.

## Phase 7 — Tests

### Unit Tests

Add or extend tests for:

- `buildPlannerChatPrompt` with prior artifacts;
- idea plan action with canonical idea fetch;
- planning-chat session persistence;
- PlanArtifact schema validation;
- WBS normalization;
- review blocker/warning rules;
- acceptance gate behavior;
- finalize dry-run and persist behavior.

### Dashboard Tests

Add or extend tests for:

- Plan this button shows for open idea;
- Resume planning shows only for active matching session;
- Review button appears for draft PlanArtifact;
- Accept button appears for reviewed plan with no blockers;
- Accept disabled when blockers exist;
- Finalize button appears for accepted plan;
- Finalized plan shows generated task links/count;
- raw CLI invocations do not appear in dashboard HTML.

### E2E Tests

Maintain a golden path:

```text
create idea
→ click/prefill planning chat
→ draft plan artifact
→ review plan artifact
→ accept plan artifact
→ finalize dry-run
→ finalize persist
→ list ready tasks by phase
→ verify task provenance
```

Maintain blocked paths:

- finalize before accept;
- accept with review blockers;
- accept with unresolved open questions and no deferral;
- duplicate finalize mutation;
- stale planning generation.

## Success Criteria

This plan is complete when an operator can reliably do the following from the dashboard:

1. Create an idea.
2. Click **Plan this**.
3. Start a planner-chat session with the Planning Agent.
4. Brainstorm naturally and answer targeted clarifying questions.
5. Produce a valid PlanArtifact v1 draft.
6. Review the plan and see actionable findings.
7. Accept the reviewed plan explicitly.
8. Preview generated phase-ready tasks from the WBS.
9. Persist those tasks through Task Engine.
10. See the idea, plan, WBS, phase recommendation, created tasks, and status in the dashboard.

The implementation is successful only if task generation is gated by explicit plan acceptance and every generated task can be traced back to the accepted PlanArtifact and WBS row.

## Non-Goals

Do not:

- replace Task Engine with PlanArtifact;
- make chat transcripts the source of truth;
- make markdown the only plan representation;
- force every idea through a rigid questionnaire;
- require every optional PlanArtifact section for tiny plans;
- create execution tasks from half-baked planning chat;
- let the dashboard own planning business logic;
- delete `build-plan` before compatibility and import paths are safe.

## Strong Recommendation

The project should treat `planner-chat + PlanArtifact v1` as the flagship planning system immediately.

The old `build-plan` wizard should become compatibility infrastructure, not the visible center of the product.

This gives Workflow Cannon a coherent and defensible product loop:

```text
ideas become plans
plans become WBS rows
accepted WBS rows become tasks
tasks produce execution evidence
```

That is the system to stabilize.
