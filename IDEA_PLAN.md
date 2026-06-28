# Idea Planning Implementation Plan

## Executive Summary

Workflow Cannon needs one clear planning path:

```text
Ideas row
→ click Plan this
→ planner-chat brainstorming session
→ complete PlanArtifact draft with WBS
→ deterministic review
→ explicit user approval
→ accepted PlanArtifact becomes durable planning truth
→ WBS can be finalized into Task Engine tasks
```

The product goal is not simply to generate tasks. The goal is to turn a raw idea into an approved, structured plan with a complete WBS. Only after that approval should the system create executable tasks.

This document is the implementation plan for making that flow stable, reliable, efficient, and obvious in the dashboard.

## Non-Negotiable Product Outcome

When an operator clicks **Plan this** on an Ideas row, Workflow Cannon must start a guided brainstorming session in Cursor chat. By the end of that session, the operator should have:

1. A saved `PlanArtifact v1` linked to the original idea.
2. A complete WBS inside that plan.
3. Review results showing whether the plan is complete enough to accept.
4. An explicit approval/acceptance step.
5. A durable accepted plan that can later be finalized into phase-ready Task Engine tasks.

A successful implementation lets the operator move from idea to approved plan without manually assembling JSON, manually remembering CLI commands, or using the legacy planning wizard as the primary path.

## Core Design Decision

Make `planner-chat + PlanArtifact v1` the flagship planning system.

Keep `build-plan` only as:

- a compatibility path;
- a migration/import source;
- a simple guided-planning fallback;
- a source of reusable question/planning utilities where useful.

Do not center the dashboard around `build-plan` or the in-memory guided wizard.

## Authoritative Roles

```text
Idea
  Raw opportunity, feature request, improvement, bug-driven concept, or product seed.

Dashboard Plan this button
  Entry point that starts or resumes a planning session for exactly one Ideas row.

Planner Chat Prompt
  A safe, context-rich prompt that tells Cursor to run the planner-chat playbook for the selected idea.

Planning Agent / planner-chat
  Natural brainstorming surface. It asks one useful question at a time, challenges weak assumptions, and guides the operator toward a complete plan.

PlanArtifact v1
  Durable, structured, versioned planning source of truth. The transcript is not the source of truth.

Review
  Deterministic quality gate that identifies blockers, warnings, missing WBS coverage, and unresolved decisions.

Acceptance
  Explicit human approval that pins a reviewed plan version as accepted.

WBS
  The plan’s decomposition layer. Each WBS item should be small enough to become one focused execution task or a clearly bounded task group.

finalize-plan-to-phase
  Deterministic compiler from accepted WBS rows into Task Engine drafts/tasks.

Task Engine
  Execution source of truth after approval and finalize.
```

## End-to-End User Flow

## 1. Idea Capture

The operator creates an Ideas row in the dashboard.

Minimum fields:

- `ideaId`;
- `title`;
- `note`;
- `status`.

Optional planning fields:

- `linkedPlanArtifact`;
- `previousPlanArtifacts`;
- `planningChatSession`;
- `planningStartedAt`;
- `planningCompletedAt`;
- `lastPlanningPrompt`;
- `lastPlanningSummary`.

Initial status should be `open`.

## 2. Click Plan This

The Ideas row exposes a primary **Plan this** button when no active planning session or accepted plan exists.

When clicked, the extension must:

1. Resolve the canonical idea by `ideaId` from the workspace kit command layer, not only from stale webview row data.
2. Determine whether an active planning session already exists for the idea.
3. If an active matching session exists, offer/resume that session instead of blindly creating another.
4. Build a planner-chat prompt using canonical idea data.
5. Include plan lineage context:
   - current `linkedPlanArtifact`, when present;
   - `previousPlanArtifacts`, when present;
   - current idea status;
   - existing planning session summary, when present.
6. Persist or update planning-chat session state for the idea.
7. Update the idea status to `planning`.
8. Open or prefill Cursor chat with the generated planner-chat prompt.
9. Refresh dashboard state so the row shows **Resume planning** and planning lifecycle status.

The handler should be idempotent. Double-clicking **Plan this** must not create competing planning sessions or conflicting prompt state.

## 3. Planner Chat Session Start

The generated prompt should make the agent do the following:

- load the selected Ideas row;
- preserve `sourceIdeaId` provenance;
- use `.ai/playbooks/planner-chat.md` as the controlling workflow;
- avoid exposing raw CLI choreography to the operator;
- ask one useful question at a time;
- keep an evolving session summary;
- know that the target output is a complete PlanArtifact with WBS and approval-ready review.

The agent’s first message should not be a giant questionnaire. It should briefly restate the idea and ask the highest-value clarifying question.

Example opening behavior:

```text
I found the idea: “Add recurring task schedules.”
Before I draft the plan, I need to clarify the execution target: should this support one-time reminders only, recurring schedules, or both in the first version?
```

## 4. Brainstorming and Discovery

The Planning Agent must gather enough information to create a plan that can survive review.

It should cover these lenses naturally during conversation:

- desired outcome;
- user/operator problem;
- success criteria;
- non-goals;
- affected modules/files/surfaces;
- dashboard/UI impact;
- command/API impact;
- persistence/data model impact;
- compatibility and migration concerns;
- safety/policy concerns;
- failure modes;
- test strategy;
- rollout and rollback;
- likely WBS decomposition;
- task sizing and dependencies;
- open questions and assumptions.

The agent should actively improve the idea, not merely record it. If the requested idea is under-scoped, risky, or unclear, the agent should suggest a better shape.

## 5. Session Completion Criteria

The brainstorming session is complete only when the Planning Agent can produce a PlanArtifact draft that includes:

- a clear title;
- planning type/profile;
- goals;
- non-goals;
- user stories or operator scenarios;
- value assessment;
- risk assessment;
- technical impact;
- architecture direction;
- UI/UX direction, when applicable;
- testing strategy;
- implementation guidance;
- what not to do;
- assumptions;
- open questions with disposition;
- WBS rows;
- phase recommendations;
- generated task payload guidance or per-WBS task payloads;
- provenance linking back to the Ideas row.

A session is not complete just because the chat feels done. It is complete when the plan can be reviewed, accepted, and later finalized into tasks.

## 6. PlanArtifact Draft

The Planning Agent drafts a `PlanArtifact v1` object.

The plan must be structured data. Markdown summaries are allowed as human-readable views, but they are not the durable source of truth.

Minimum envelope:

```json
{
  "schemaVersion": "plan-artifact/v1",
  "planId": "plan_<stable-id>",
  "version": 1,
  "planRef": "plan-artifact:plan_<stable-id>",
  "status": "draft",
  "identity": {
    "title": "...",
    "planningType": "full-feature"
  },
  "provenance": {
    "source": "planner-chat",
    "sourceIdeaId": "...",
    "previousPlanArtifacts": []
  },
  "sections": {}
}
```

The exact shape should continue to follow `PLANNER_SCHEMA.md`.

## 7. WBS Requirements

The WBS is the heart of the implementation plan.

Each WBS row should include:

- `wbsId`;
- `path`;
- `title`;
- mapped goal or story;
- suggested task title;
- approach;
- technical scope;
- acceptance criteria;
- testing/verification;
- dependencies;
- recommended phase;
- recommended order;
- sizing confidence;
- risk notes;
- definition of done;
- generated task payload or enough data to produce one.

WBS rows should be sized for execution:

- one focused coding/agent session where possible;
- clear boundaries;
- no vague “implement everything” tasks;
- no hidden dependencies;
- no task without acceptance criteria;
- no task without verification guidance.

Good WBS examples:

```text
WBS-1 — Normalize idea planning session state
Scope: canonical idea fetch, active session detection, idempotent session update.
Done means: Plan this creates or resumes exactly one planning session per idea.
Verification: dashboard test for repeated Plan this click and matching Resume planning state.
```

```text
WBS-2 — Add plan lineage to planner-chat prompt
Scope: include linkedPlanArtifact and previousPlanArtifacts in the prompt context.
Done means: resumed planning sessions preserve prior plan context and provenance.
Verification: unit tests for prompt with no prior plan, one linked plan, and multiple previous plans.
```

Bad WBS examples:

```text
WBS-1 — Build planner
```

```text
WBS-2 — Improve dashboard
```

## 8. Draft Validation and Persistence

The Planning Agent should validate before persisting.

Flow:

1. Create draft PlanArtifact in memory/chat.
2. Run `draft-plan-artifact` in validate-only mode, if supported.
3. Repair schema or completeness issues.
4. Ask operator whether to save the draft.
5. Persist with policy approval, planning generation, and client mutation id.
6. Link the persisted PlanArtifact to the source idea.
7. Mark idea as `plan_drafted` or equivalent durable planning state.

If the command set does not yet expose all of these semantics, implement the missing command behavior as part of this plan.

## 9. Review

A draft plan must be reviewed before acceptance.

`review-plan-artifact` should check:

- required sections exist;
- profile-specific sections are present;
- goals map to WBS rows;
- user stories map to WBS rows;
- each WBS row has acceptance criteria;
- each WBS row has verification guidance;
- dependencies are valid;
- technical impact is concrete;
- architecture is adequate for the profile;
- UI/UX direction exists when a UI surface is affected;
- migration/rollback exists when persistence or task generation changes;
- open questions are either resolved or explicitly deferred;
- generated task payloads are sufficient for `finalize-plan-to-phase`.

Review result should return a dashboard-friendly shape:

```json
{
  "status": "blocked",
  "blockers": [
    {
      "code": "missing-rollback-plan",
      "message": "The plan changes persisted planning session state but does not define rollback behavior.",
      "path": "sections.riskAssessment",
      "wbsId": "WBS-1"
    }
  ],
  "warnings": [],
  "summary": {
    "wbsCount": 8,
    "openQuestionCount": 1,
    "coverage": "partial"
  }
}
```

The dashboard should display review findings as decisions to fix, not raw validator noise.

## 10. Approval / Acceptance

The user must explicitly approve the reviewed plan.

Approval is not implied by drafting, saving, or reviewing the plan.

Acceptance requires:

- reviewed plan version;
- no blockers, unless an explicit policy allows override;
- open questions resolved or explicitly deferred;
- user confirmation;
- approval metadata;
- idempotent acceptance behavior.

Approval record should include:

```json
{
  "approved": true,
  "approvedVersion": 2,
  "approvedAt": "<iso timestamp>",
  "approvedBy": "operator",
  "reviewStatus": "passed",
  "deferredQuestions": [],
  "notes": "Approved from dashboard after planner-chat review."
}
```

After acceptance:

- plan status becomes `accepted`;
- idea status becomes `planned` or equivalent;
- dashboard shows Accepted and Finalize actions;
- WBS is locked for task generation unless a new plan version is drafted and accepted.

## 11. Finalize to Tasks

Finalizing is separate from approval.

Approval means the plan and WBS are accepted. Finalize means creating Task Engine tasks from the accepted WBS.

`finalize-plan-to-phase` should:

1. Require an accepted PlanArtifact version.
2. Select all WBS rows by default or a user-selected subset if explicitly requested.
3. Normalize WBS rows into task-engine-compatible drafts.
4. Run task draft review.
5. Return a dry-run preview by default.
6. Require explicit confirmation before persistence.
7. Persist tasks only once per accepted plan/version/client mutation id.
8. Write plan and WBS provenance onto every task.
9. Link created tasks back to the idea and plan.
10. Mark plan status `finalized` only after successful task persistence.

Generated task metadata should include:

```json
{
  "metadata": {
    "planRef": "plan-artifact:<planId>",
    "planningProvenance": {
      "planId": "<planId>",
      "planVersion": 2,
      "wbsId": "WBS-3",
      "wbsPath": "1.3",
      "sourceIdeaId": "<ideaId>",
      "source": "finalize-plan-to-phase"
    }
  }
}
```

## Dashboard UX Contract

## Ideas Row States

The Ideas row should expose actions based on durable planning state.

| State | Meaning | Primary Action | Secondary Action |
|---|---|---|---|
| `open` | Idea exists, no active planning | Plan this | Edit idea |
| `planning` | Planner chat session active | Resume planning | Restart planning |
| `drafted` | Draft PlanArtifact exists | Review plan | Resume planning |
| `review_blocked` | Review found blockers | Resume planning | View blockers |
| `reviewed` | Review passed or warning-only | Accept plan | Resume planning |
| `planned` / `accepted` | User accepted reviewed plan | Finalize tasks | View plan |
| `finalized` | Tasks created from WBS | View tasks | View plan |
| `superseded` | Newer plan version exists | View latest | View history |

Use existing status names where possible, but the UI must represent this lifecycle clearly even if the underlying enum names differ.

## Dashboard Panels

The dashboard should include:

### Idea Planning Summary

- idea title;
- idea status;
- planning session status;
- current planRef;
- current plan version;
- current plan status;
- last planning activity;
- linked task count after finalize.

### Current Plan Card

- plan title;
- planRef;
- version;
- status;
- planning type/profile;
- WBS count;
- open question count;
- blocker count;
- warning count;
- phase recommendation;
- available actions.

### WBS Preview

Show each WBS row with:

- path;
- title;
- recommended phase;
- dependencies;
- acceptance criteria summary;
- verification summary;
- generated task title.

### Review Findings

Show blockers and warnings as repairable decisions.

### Finalize Preview

Show generated tasks before persistence:

- title;
- target phase;
- desired status;
- dependency links;
- source WBS row;
- planRef;
- acceptance criteria;
- verification summary.

## Command/API Contract

## `start-idea-planning` or Equivalent Handler

If this command does not exist, implement the behavior inside the dashboard extension first, then consider promoting it into a workspace-kit command.

Input:

```json
{
  "ideaId": "...",
  "clientMutationId": "...",
  "policyApproval": {...},
  "planningGeneration": 123
}
```

Output:

```json
{
  "ideaId": "...",
  "status": "planning",
  "planningChatPrompt": "...",
  "planningChatSession": {
    "sessionId": "...",
    "status": "active",
    "startedAt": "...",
    "resumePrompt": "..."
  },
  "currentPlanArtifact": null
}
```

Responsibilities:

- canonical idea fetch;
- active session detection;
- idempotent mutation;
- prompt generation;
- session persistence;
- dashboard-friendly result.

## `complete-idea-planning` or Equivalent Session Completion Update

The first plan version can be persisted by `draft-plan-artifact`, but the idea also needs to know that the planning session produced a plan.

Input:

```json
{
  "ideaId": "...",
  "planRef": "plan-artifact:<planId>",
  "planId": "...",
  "version": 1,
  "sessionId": "...",
  "summary": "...",
  "clientMutationId": "..."
}
```

Output:

```json
{
  "ideaId": "...",
  "status": "drafted",
  "linkedPlanArtifact": "plan-artifact:<planId>",
  "planningChatSession": {
    "status": "completed"
  }
}
```

Responsibilities:

- link idea to plan;
- mark planning session complete;
- preserve session summary;
- keep Resume planning available when review blockers later require more work.

## `draft-plan-artifact`

Responsibilities:

- validate PlanArtifact v1 shape;
- validate required profile sections;
- assign or preserve planId;
- increment version when updating existing plan;
- write artifact to canonical plan-artifact storage;
- return planRef, path, version, status, and summary;
- preserve provenance.

Acceptance criteria:

- validate-only does not mutate state;
- persist requires policy approval;
- same client mutation does not create duplicate plan versions;
- sourceIdeaId is required when draft originates from an Ideas row.

## `review-plan-artifact`

Responsibilities:

- produce blocker/warning review result;
- write or return review record;
- support dashboard-friendly rendering;
- identify exact WBS row or section for each finding.

Acceptance criteria:

- blocker prevents acceptance;
- warning does not prevent acceptance;
- review result is stable enough for dashboard display;
- tests cover missing WBS, vague acceptance criteria, missing verification, and unresolved open questions.

## `accept-plan-artifact`

Responsibilities:

- require reviewed version;
- require no blockers unless override is intentionally supported;
- record approval;
- pin approved version;
- mark plan status accepted;
- update linked idea to planned/accepted state.

Acceptance criteria:

- acceptance is explicit;
- acceptance is idempotent;
- stale version acceptance is blocked;
- accepted plan can be finalized;
- unaccepted plan cannot be finalized.

## `finalize-plan-to-phase`

Responsibilities:

- require accepted plan;
- map WBS rows to task drafts;
- run task draft review;
- dry-run by default;
- persist only after confirmation;
- write plan/WBS provenance;
- update plan and idea status after successful persistence.

Acceptance criteria:

- no task batch from draft/reviewed/unaccepted plan;
- dry run is mutation-free;
- persisted tasks are traceable to plan and WBS;
- duplicate finalize is prevented.

## Data Model Additions / Clarifications

## Idea Planning Fields

The Ideas model should support or emulate:

```ts
type IdeaPlanningState = {
  linkedPlanArtifact?: string;
  previousPlanArtifacts?: string[];
  planningChatSession?: {
    sessionId: string;
    status: 'active' | 'completed' | 'abandoned' | 'superseded';
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
    prompt?: string;
    resumePrompt?: string;
    summary?: string;
    currentPlanRef?: string;
    currentPlanVersion?: number;
  };
};
```

If the existing store already represents some of this differently, adapt to the existing shape while preserving the semantics.

## PlanArtifact Statuses

Recommended statuses:

```text
draft
reviewed
blocked
accepted
finalized
superseded
abandoned
```

Status transitions:

```text
draft → reviewed
reviewed → accepted
blocked → draft/reviewed after repair
accepted → finalized
accepted → superseded if new version is drafted and accepted
```

Do not allow:

```text
draft → finalized
reviewed → finalized
blocked → accepted
finalized → draft in-place
```

## Plan Lineage

When a user replans an idea that already has a linked plan:

1. Keep the existing accepted/finalized plan immutable.
2. Create a new draft version or new plan artifact according to schema rules.
3. Preserve old planRef in `previousPlanArtifacts`.
4. Mark old plan as superseded only after the new plan is accepted.

## Implementation Phases

## Phase 0 — Baseline and Current-State Verification

### Task 0.1 — Run Baseline Health Checks

Run:

```bash
pnpm exec wk doctor
pnpm run build
pnpm run test
```

Acceptance criteria:

- failures are recorded before implementation;
- unrelated failures are not silently mixed with planner changes;
- planner-specific tests are identified.

### Task 0.2 — Confirm Existing Golden Paths

Confirm these tests still reflect the intended direction:

- `test/plan-artifact-e2e-cli.test.mjs`;
- `extensions/cursor-workflow-cannon/test/dashboard-plan-artifact-happy-path.test.mjs`.

Acceptance criteria:

- CLI path proves draft → review → accept → finalize dry-run → finalize persist;
- dashboard path proves Review / Accept / Finalize / Resume behavior;
- raw CLI invocations are not exposed in dashboard HTML or prompt text.

## Phase 1 — Make Plan This Correct and Idempotent

### Task 1.1 — Canonical Idea Fetch

Update the dashboard `Plan this` handler so it fetches the canonical idea by `ideaId` before building the prompt.

Acceptance criteria:

- handler works with only `ideaId`;
- stale title/note from webview do not corrupt prompt;
- missing idea produces clear error;
- test covers stale webview payload.

### Task 1.2 — Include Plan Lineage in Prompt

Update `buildPlannerChatPrompt` and caller logic so the prompt includes:

- linked current plan;
- previous plans;
- active session summary;
- source idea id;
- explicit target: produce PlanArtifact + WBS + review + approval.

Acceptance criteria:

- prompt has enough context for replanning;
- prompt does not expose raw CLI command choreography;
- provenance instructions are explicit;
- tests cover no plan, one linked plan, and prior plans.

### Task 1.3 — Idempotent Session Start

Plan this should create or resume one session per idea.

Acceptance criteria:

- double-click Plan this is safe;
- repeated mutation id returns same session/prompt;
- active session causes Resume planning state;
- stale generation retries once and then fails clearly.

### Task 1.4 — Persist Planning Session State

Persist session state with enough data to resume:

- session id;
- idea id;
- prompt;
- resume prompt;
- status;
- started/updated timestamps;
- current planRef/version if available;
- summary if available.

Acceptance criteria:

- dashboard survives reload and still shows Resume planning;
- session state is tied to the correct idea;
- mismatched sessions are not displayed on unrelated ideas.

## Phase 2 — Make Planner Chat Produce a Complete Plan

### Task 2.1 — Strengthen Planner Chat Prompt

The prompt must explicitly state the required output and lifecycle:

1. brainstorm;
2. draft PlanArtifact;
3. validate/persist draft;
4. run review;
5. ask user for approval;
6. accept the approved plan;
7. optionally finalize after separate confirmation.

Acceptance criteria:

- agent knows the session is not done until there is a reviewed/approval-ready PlanArtifact with WBS;
- agent asks focused questions instead of dumping a survey;
- agent preserves idea provenance.

### Task 2.2 — Add Planning Agent Contract

Add a named Planning Agent profile or equivalent if supported by the project.

The agent should reference:

- `.ai/playbooks/planner-chat.md`;
- `PLANNER_SCHEMA.md`;
- `PLANNER_COMMANDS.md`;
- CAE planning lenses;
- policy approval rules;
- command map.

Acceptance criteria:

- the prompt can call for a stable planning agent/playbook;
- agent instructions define done state;
- user-facing output remains product/planning-oriented.

### Task 2.3 — Add Session Completion Handshake

Define how planner-chat marks a planning session complete.

Recommended completion sequence:

```text
Agent drafts plan
→ validates draft
→ persists PlanArtifact
→ runs review
→ asks operator to approve or revise
→ user approves
→ agent runs accept-plan-artifact
→ idea updates to planned/accepted
→ session status becomes completed
```

Acceptance criteria:

- completed session always has a linked planRef;
- completed session records summary and approved version;
- incomplete sessions remain resumable;
- reviewed-but-blocked sessions remain resumable.

## Phase 3 — PlanArtifact and Review Hardening

### Task 3.1 — Enforce PlanArtifact Schema

Make sure draft persistence enforces the schema required by `PLANNER_SCHEMA.md`.

Acceptance criteria:

- required core sections validated;
- conditional profile sections validated;
- WBS rows validated;
- generated task payload requirements validated;
- errors are actionable.

### Task 3.2 — Versioning and Lineage

Ensure plan updates are versioned, not overwritten destructively.

Acceptance criteria:

- accepted versions remain immutable;
- new revisions increment version;
- old plan/version can be referenced;
- superseded state is explicit.

### Task 3.3 — Review Quality Gate

Implement review rules that catch actual planning weakness.

Blockers should include:

- no WBS;
- WBS without acceptance criteria;
- WBS without verification;
- missing affected-system analysis for code changes;
- unresolved critical open questions;
- missing rollback/migration plan for persistence changes;
- task payloads insufficient for finalization.

Warnings should include:

- low sizing confidence;
- optional UI polish missing;
- minor test gaps;
- implementation risk that does not block planning approval.

Acceptance criteria:

- review output is deterministic;
- dashboard can render it directly;
- tests cover blocker and warning cases.

### Task 3.4 — Acceptance Gate

`accept-plan-artifact` must be the only way to mark a plan approved.

Acceptance criteria:

- cannot accept unreviewed plan;
- cannot accept blocked plan unless explicit override exists;
- open questions must be resolved or deferred;
- acceptance pins version;
- idea linked state updates after acceptance.

## Phase 4 — Dashboard Planning Lifecycle

### Task 4.1 — Ideas Row Actions

Replace primary planning affordance with the PlanArtifact lifecycle.

Acceptance criteria:

- open ideas show Plan this;
- active sessions show Resume planning;
- draft plans show Review;
- blocked reviews show Resume planning and View blockers;
- reviewed plans show Accept;
- accepted plans show Finalize;
- finalized plans show View tasks.

### Task 4.2 — Current Plan Card

Render the current linked PlanArtifact in the dashboard.

Acceptance criteria:

- status, version, planRef, WBS count, blocker count, warning count, and open question count are visible;
- actions are derived from durable plan state;
- UI does not depend on in-memory wizard state.

### Task 4.3 — WBS Preview

Show WBS rows before finalize.

Acceptance criteria:

- operator can inspect decomposition before task creation;
- rows show acceptance criteria and verification summary;
- phase/order/dependencies are visible.

### Task 4.4 — Review and Approval UI

Review/Accept should feel like product decisions, not raw command output.

Acceptance criteria:

- blockers disable Accept;
- warnings allow Accept;
- open questions are visible;
- approval requires explicit click/confirmation.

### Task 4.5 — Finalize Preview UI

Before persisting tasks, show dry-run generated tasks.

Acceptance criteria:

- Finalize first previews;
- Persist tasks requires separate confirmation;
- generated task count and provenance are visible;
- duplicates are prevented.

## Phase 5 — Finalize to Task Engine

### Task 5.1 — WBS to Task Draft Normalization

Map each WBS row into task-engine-compatible draft payload.

Acceptance criteria:

- title, body, status, phase, acceptance criteria, verification, dependencies, and metadata are populated;
- task body retains enough context for implementation agent;
- all generated tasks include plan provenance.

### Task 5.2 — Task Draft Review

Reuse existing task draft review instead of duplicating validation.

Acceptance criteria:

- finalize previews review findings before persistence;
- failing task draft review blocks persistence;
- warning-only results can proceed with confirmation.

### Task 5.3 — Idempotent Task Persistence

Prevent duplicate task creation from repeated finalize calls.

Acceptance criteria:

- same plan/version/mutation id returns same task batch;
- subsequent finalize of already-finalized plan is blocked or returns existing result;
- task links are stored back to plan/idea if supported.

## Phase 6 — Legacy Cleanup

### Task 6.1 — Demote Dashboard Planning Wizard

Move the existing in-memory planning wizard out of the primary flow.

Acceptance criteria:

- main Ideas action no longer routes to `build-plan` wizard;
- legacy path is clearly labeled if retained;
- old wizard cannot be mistaken for PlanArtifact planning.

### Task 6.2 — Preserve `build-plan` Compatibility

Keep `build-plan` available for old workflows.

Acceptance criteria:

- old tests continue to pass;
- docs state that serious planning uses PlanArtifact;
- any direct task creation from `build-plan` is marked preview/legacy.

### Task 6.3 — Add Import/Migration Path

Create or document conversion from legacy planning outputs to PlanArtifact draft.

Acceptance criteria:

- legacy output can become draft PlanArtifact;
- provenance shows `import-build-plan` or equivalent;
- user can review/accept imported plan like any other PlanArtifact.

## Phase 7 — Reliability, Error Handling, and Efficiency

### Task 7.1 — Generation Handling

Use planning generation/store generation consistently.

Acceptance criteria:

- stale generation retries once;
- repeated mismatch shows clear message;
- no silent overwrites.

### Task 7.2 — Clear User-Facing Errors

Errors should explain the repair path.

Examples:

```text
Cannot accept this plan yet: WBS-3 has no verification strategy.
```

```text
Cannot finalize this plan because version 2 is not accepted.
```

```text
This idea already has an active planning session. Resume that session or restart planning.
```

Acceptance criteria:

- no raw stack traces in dashboard;
- command errors include actionable messages;
- blocked states remain resumable.

### Task 7.3 — Refresh Discipline

Avoid excessive full dashboard refreshes.

Acceptance criteria:

- Plan this refreshes idea/planning state;
- Review/Accept refresh plan card and idea row;
- Finalize refreshes plan, idea, and task/phase sections;
- active chat/prompt state is not lost during refresh.

### Task 7.4 — Audit Trail

Every major transition should be inspectable.

Track:

- idea status changes;
- planning session start/resume/complete;
- plan draft versions;
- review records;
- approval records;
- finalize previews;
- persisted task batch ids.

Acceptance criteria:

- debugging a planning failure does not require reading the chat transcript;
- plan and task provenance are sufficient for later drift detection.

## Test Plan

## Unit Tests

Add or extend unit tests for:

- `buildPlannerChatPrompt` with idea-only input;
- prompt with linked plan;
- prompt with previous plan artifacts;
- prompt with active session summary;
- no raw CLI command leakage;
- PlanArtifact schema validation;
- WBS row validation;
- review blocker generation;
- review warning generation;
- accept gate behavior;
- finalize gate behavior;
- WBS-to-task draft normalization;
- finalize idempotency.

## Dashboard Tests

Add or extend dashboard tests for:

- open idea shows Plan this;
- Plan this uses canonical idea data;
- double Plan this click is idempotent;
- active session shows Resume planning;
- draft plan shows Review;
- blocked review disables Accept;
- warning-only review allows Accept;
- accepted plan shows Finalize;
- finalize first shows dry-run preview;
- confirmed finalize creates tasks;
- finalized plan shows task count/links;
- legacy wizard is not primary planning path.

## CLI/E2E Tests

Maintain a golden path:

```text
create idea
→ start idea planning
→ generate planner-chat prompt
→ persist PlanArtifact draft with WBS
→ complete idea planning session
→ review PlanArtifact
→ accept reviewed PlanArtifact
→ finalize dry-run
→ finalize persist
→ list created tasks
→ verify task provenance
```

Maintain blocked paths:

- missing idea;
- duplicate Plan this click;
- stale planning generation;
- draft without WBS;
- review blockers;
- accept before review;
- accept blocked plan;
- finalize unaccepted plan;
- duplicate finalize;
- replan accepted idea and preserve lineage.

## Documentation Updates

Update or cross-link:

- `PLANNER.md` with this final product flow;
- `PLANNER_TASKS.md` with current task order;
- `PLANNER_SCHEMA.md` with any status/lineage clarifications;
- `PLANNER_COMMANDS.md` with `start-idea-planning` / `complete-idea-planning` semantics if promoted to commands;
- `.ai/playbooks/planner-chat.md` with session completion and approval handshake;
- dashboard extension docs/readme if present.

## Definition of Done

The implementation is done when:

1. Clicking **Plan this** on an Ideas row starts or resumes exactly one planning session for that idea.
2. The generated planner-chat prompt contains the idea context, plan lineage, provenance instructions, and complete session target.
3. The Planning Agent can brainstorm naturally and knows the session is not complete until a reviewed approval-ready PlanArtifact with WBS exists.
4. The PlanArtifact draft persists as structured data and links back to the idea.
5. The WBS is complete enough to create execution tasks later.
6. Review identifies blockers and warnings with actionable messages.
7. The user explicitly accepts a reviewed plan version.
8. Accepted plans are immutable for task generation.
9. Finalize creates task drafts from accepted WBS rows only.
10. Persisted tasks include plan and WBS provenance.
11. The dashboard clearly shows the idea’s state from raw idea through finalized tasks.
12. Legacy `build-plan` does not confuse the primary dashboard flow.
13. Tests cover happy path, blocked path, idempotency, lineage, and finalize provenance.

## Final Target System

The final mental model should be simple:

```text
Idea = seed
Planner chat = discovery
PlanArtifact = approved design and WBS truth
Finalize = compile accepted WBS into tasks
Task Engine = execution truth
Dashboard = control surface
```

Anything that does not support that model should either be demoted, hidden, migrated, or removed.
