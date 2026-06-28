# Idea Planning Implementation Plan

## Executive Summary

Workflow Cannon needs one clear planning path:

```text
Ideas row
→ click Plan this
→ start-idea-planning command
→ tiny dashboard-generated chat prompt
→ planner-chat brainstorming session
→ complete PlanArtifact draft with WBS
→ deterministic review
→ explicit user approval
→ accepted PlanArtifact becomes durable planning truth
→ WBS can be finalized into Task Engine tasks
```

The goal is not simply to generate tasks. The goal is to turn a raw idea into an approved, structured plan with a complete WBS. Only after approval should the system create executable tasks.

This document is the implementation plan and right-sized WBS for that integration. Each WBS item is scoped so a middle-cost coding model should be able to complete it in one focused session.

## Locked Product Decisions

These decisions are now part of the implementation plan and should not be treated as open questions.

### Decision 1 — `start-idea-planning` is a real command

`start-idea-planning` must be implemented as a real workspace-kit command, not as dashboard-only glue.

Reason:

- The dashboard prompt can stay very small and simple.
- Canonical idea loading, active-session detection, idempotency, and prompt generation belong in the command layer.
- The dashboard should be a control surface, not the owner of planning lifecycle rules.

### Decision 2 — `update-idea-planning-session` is a real command

`update-idea-planning-session` must be implemented as a real workspace-kit command.

Reason:

- Session state transitions need to be durable and inspectable.
- Chat, dashboard, tests, and future automations need one consistent way to move a session through `active`, `draft_ready`, `needs_revision`, `approval_ready`, and `completed`.
- Planner-specific session semantics should not be hidden inside a generic `update-idea` call.

### Decision 3 — Use a derived lifecycle-state reducer for dashboard state

The best direction is to store raw facts separately, then derive one dashboard lifecycle state through a pure helper.

Raw facts may include:

- Idea status.
- Planning session status.
- `linkedPlanArtifact`.
- `activeDraftPlanArtifact`.
- latest review result.
- PlanArtifact status.
- finalize result.

The dashboard must not independently reason about these facts in multiple places. It should call one helper:

```ts
const lifecycle = deriveIdeaPlanningLifecycleState({
  idea,
  planningChatSession,
  linkedPlanArtifact,
  activeDraftPlanArtifact,
  latestReview,
  finalizeResult
});
```

Recommended precedence:

```text
finalized task batch / finalize result
> accepted linkedPlanArtifact
> latest review result for activeDraftPlanArtifact
> activeDraftPlanArtifact
> planningChatSession
> raw idea status
```

Reason:

- This prevents contradictory UI actions.
- Persistence remains flexible.
- The reducer becomes easy to unit test.
- Dashboard rendering stays deterministic.

### Decision 4 — Use both `linkedPlanArtifact` and `activeDraftPlanArtifact`

The Ideas model must support both concepts.

```text
linkedPlanArtifact
  The latest accepted/finalized plan for the idea.

activeDraftPlanArtifact
  The current draft/review candidate plan for the idea.
```

Replanning must not overwrite `linkedPlanArtifact` until the replacement plan is accepted.

### Decision 5 — Default planning profile is `minimal`

Default profile:

```text
minimal
```

The agent may recommend upgrading to `refactor` or `full-feature`, and the user may explicitly choose a higher profile before acceptance.

Reason:

- Small ideas should not be forced through heavyweight architecture and rollout requirements.
- Review strictness must scale with the kind of plan.

### Decision 6 — Warnings do not block acceptance

Review blockers prevent acceptance. Review warnings are visible but non-blocking.

Reason:

- Warnings should inform the operator, not trap the plan.
- The approval step is already explicit.

### Decision 7 — Approval and finalization stay separate

Accepting a plan approves the design and WBS. Finalizing creates Task Engine tasks.

Do not auto-finalize immediately after approval.

### Decision 8 — Subset finalization blocks on unselected dependencies in v1

If a selected WBS row depends on an unselected WBS row, finalization must block in v1.

Later versions may add explicit dependency deferral.

### Decision 9 — One WBS row creates one task draft in v1

For v1, finalization should map:

```text
one WBS row → one Task Engine task draft
```

Grouping and splitting can be added later.

### Decision 10 — Legacy import is documented/deferred until primary path works

Legacy `build-plan` import should be documented as a future compatibility path, but implementation should not block the primary idea → planner-chat → PlanArtifact path.

## Product Outcome

When an operator clicks **Plan this** on an Ideas row, Workflow Cannon must start a guided brainstorming session in Cursor chat. By the end of that session, the operator should have:

1. A saved `PlanArtifact v1` linked to the original idea as `activeDraftPlanArtifact` until acceptance.
2. A complete WBS inside that plan.
3. Review results showing whether the plan is complete enough to accept.
4. An explicit approval/acceptance step.
5. A durable accepted plan promoted to `linkedPlanArtifact`.
6. A finalized task batch only after a separate explicit finalize confirmation.

A successful implementation lets the operator move from idea to approved plan without manually assembling JSON, manually remembering CLI commands, or using the legacy planning wizard as the primary path.

## Core Design Decision

Make `planner-chat + PlanArtifact v1` the flagship planning system.

Keep `build-plan` only as:

- a compatibility path;
- a documented future migration/import source;
- a simple guided-planning fallback;
- a source of reusable question/planning utilities where useful.

Do not center the dashboard around `build-plan` or the in-memory guided wizard.

## Authoritative Roles

```text
Idea
  Raw opportunity, feature request, improvement, bug-driven concept, or product seed.

start-idea-planning
  Real command that owns canonical idea fetch, active session detection, idempotent session start/resume, and prompt generation.

Dashboard Plan this button
  Thin control surface that calls start-idea-planning and opens/prefills Cursor chat with the returned prompt.

Planner Chat Prompt
  Small, safe, context-rich prompt returned by start-idea-planning.

Planning Agent / planner-chat
  Natural brainstorming surface. It asks one useful question at a time, challenges weak assumptions, and guides the operator toward a complete plan.

update-idea-planning-session
  Real command that owns durable planning session state transitions.

PlanArtifact v1
  Durable, structured, versioned planning source of truth. The transcript is not the source of truth.

Review
  Deterministic quality gate that identifies blockers, warnings, missing WBS coverage, and unresolved decisions.

Acceptance
  Explicit human approval that pins a reviewed plan version as accepted.

WBS
  The plan’s decomposition layer. In v1, one WBS row maps to one task draft.

finalize-plan-to-phase
  Deterministic compiler from accepted WBS rows into Task Engine drafts/tasks.

Task Engine
  Execution source of truth after approval and finalize.

Dashboard
  Human control surface. It displays derived state and invokes commands; it must not own planning business logic.
```

## End-to-End Flow

## 1. Capture Idea

The operator creates an Ideas row in the dashboard.

Minimum fields:

- `ideaId`;
- `title`;
- `note`;
- `status`.

Planning-related fields must support or emulate:

```ts
type IdeaPlanningState = {
  linkedPlanArtifact?: string;
  activeDraftPlanArtifact?: string;
  previousPlanArtifacts?: string[];
  planningChatSession?: {
    sessionId: string;
    status: 'active' | 'draft_ready' | 'needs_revision' | 'approval_ready' | 'completed' | 'abandoned' | 'superseded';
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

`linkedPlanArtifact` means the latest accepted/finalized plan. `activeDraftPlanArtifact` means the current draft/review plan. Replanning must not overwrite the accepted plan until the replacement is accepted.

## 2. Click Plan This

The Ideas row exposes **Plan this** when no active planning session or accepted plan blocks the primary action.

When clicked, the dashboard must call `start-idea-planning`.

The command must:

1. Resolve the canonical idea by `ideaId` from the command layer.
2. Determine whether an active planning session already exists for the idea.
3. Resume an active matching session instead of blindly creating another.
4. Build a small planner-chat prompt using canonical idea data.
5. Include plan lineage context:
   - current `linkedPlanArtifact`, when present;
   - `activeDraftPlanArtifact`, when present;
   - `previousPlanArtifacts`, when present;
   - current idea status;
   - existing planning session summary, when present.
6. Persist or update planning-chat session state for the idea.
7. Update the idea status to `planning` when starting a new session.
8. Return prompt/session/status data to the dashboard.
9. Let the dashboard open or prefill Cursor chat with the returned prompt.

Double-clicking **Plan this** must not create competing sessions or conflicting prompt state.

## 3. Planner Chat Session

Because `start-idea-planning` owns context loading and prompt generation, the dashboard-generated prompt can be small.

The returned prompt should tell the agent:

- use `.ai/playbooks/planner-chat.md`;
- preserve `sourceIdeaId` provenance;
- brainstorm naturally;
- ask one useful question at a time;
- target an accepted PlanArtifact with complete WBS;
- use command-layer transitions for draft, review, approval, and session updates.

The agent’s first response should briefly restate the idea and ask the highest-value clarifying question. It should not open with a giant questionnaire.

## 4. Session Completion

The brainstorming session is complete only when there is an accepted PlanArtifact version.

Session states:

```text
active
  Planning chat started, but no saved draft exists yet.

draft_ready
  A PlanArtifact draft exists and is linked as activeDraftPlanArtifact.

needs_revision
  Review found blockers or unresolved critical questions.

approval_ready
  Review passed or warning-only review exists; explicit user approval is still needed.

completed
  User approved the reviewed plan and accept-plan-artifact pinned the accepted version.
```

Do not mark the session `completed` immediately after draft persistence. Draft persistence means the session reached `draft_ready`, not that planning is done.

## 5. PlanArtifact Requirements

The PlanArtifact must remain structured data. Markdown summaries are useful views, not the durable source of truth.

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
    "planningType": "minimal"
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

## 6. WBS Requirements for Generated Plans

Each WBS row inside a PlanArtifact should include:

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

## 7. Dashboard Lifecycle Contract

The dashboard must derive actions from durable state, not from in-memory wizard state.

Implement a pure helper:

```ts
type IdeaPlanningLifecycleState =
  | 'open'
  | 'planning'
  | 'draft_ready'
  | 'needs_revision'
  | 'approval_ready'
  | 'accepted'
  | 'finalized'
  | 'superseded';

function deriveIdeaPlanningLifecycleState(input: {
  idea: IdeaRecord;
  planningChatSession?: PlanningChatSession;
  linkedPlanArtifact?: PlanArtifactSummary;
  activeDraftPlanArtifact?: PlanArtifactSummary;
  latestReview?: PlanArtifactReviewSummary;
  finalizeResult?: PlanFinalizeSummary;
}): IdeaPlanningLifecycleState;
```

Recommended precedence:

```text
finalized task batch / finalize result
> accepted linkedPlanArtifact
> latest review result for activeDraftPlanArtifact
> activeDraftPlanArtifact
> planningChatSession
> raw idea status
```

| Derived State | Meaning | Primary Action | Secondary Action |
|---|---|---|---|
| `open` | Idea exists, no active planning | Plan this | Edit idea |
| `planning` | Planner chat session active | Resume planning | Restart planning |
| `draft_ready` | Draft PlanArtifact exists | Review plan | Resume planning |
| `needs_revision` | Review found blockers | Resume planning | View blockers |
| `approval_ready` | Review passed or warning-only | Accept plan | Resume planning |
| `accepted` | User accepted reviewed plan | Finalize tasks | View plan |
| `finalized` | Tasks created from WBS | View tasks | View plan |
| `superseded` | Newer plan version exists | View latest | View history |

## 8. Command/API Contract

Lifecycle transitions must be owned by command-layer contracts.

### `start-idea-planning`

This must be a real command.

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
  "mode": "started" | "resumed",
  "planningChatPrompt": "...",
  "planningChatSession": {
    "sessionId": "...",
    "status": "active",
    "startedAt": "...",
    "updatedAt": "...",
    "resumePrompt": "..."
  },
  "linkedPlanArtifact": "...",
  "activeDraftPlanArtifact": "...",
  "previousPlanArtifacts": []
}
```

Responsibilities:

- canonical idea fetch;
- active session detection;
- idempotent mutation;
- small prompt generation;
- session persistence;
- dashboard-friendly result.

### `update-idea-planning-session`

This must be a real command.

Input:

```json
{
  "ideaId": "...",
  "sessionId": "...",
  "status": "draft_ready" | "needs_revision" | "approval_ready" | "completed" | "abandoned" | "superseded",
  "currentPlanRef": "plan-artifact:<planId>",
  "currentPlanVersion": 1,
  "summary": "...",
  "clientMutationId": "...",
  "policyApproval": {...},
  "planningGeneration": 123
}
```

Responsibilities:

- update durable planning session state;
- record prompt/resume prompt/summary where applicable;
- move session through the approved state machine;
- keep session tied to one idea and current plan version;
- return a dashboard-friendly result.

### `draft-plan-artifact`

Responsibilities:

- validate PlanArtifact v1 shape;
- validate required profile sections;
- default planning profile to `minimal` when unspecified;
- assign or preserve planId;
- increment version when updating existing plan;
- write artifact to canonical plan-artifact storage;
- return planRef, path, version, status, and summary;
- preserve provenance;
- require `sourceIdeaId` when draft originates from an Ideas row.

### `review-plan-artifact`

Responsibilities:

- produce blocker/warning review result;
- apply profile-aware review rules;
- write or return review record;
- support dashboard-friendly rendering;
- identify exact WBS row or section for each finding;
- call `update-idea-planning-session` to move the session to `needs_revision` or `approval_ready` when idea/session context is present.

### `accept-plan-artifact`

Responsibilities:

- require reviewed version;
- require no blockers;
- allow warnings;
- require resolved/deferred open questions;
- record approval;
- pin approved version;
- mark plan status accepted;
- promote `activeDraftPlanArtifact` to `linkedPlanArtifact`;
- update linked idea to accepted/planned state;
- call `update-idea-planning-session` to move the session to `completed` when idea/session context is present.

### `finalize-plan-to-phase`

Responsibilities:

- require accepted plan;
- keep approval and finalization separate;
- map one WBS row to one task draft in v1;
- block subset finalization when selected WBS rows depend on unselected WBS rows;
- run task draft review;
- dry-run by default;
- persist only after confirmation;
- write plan/WBS provenance;
- update plan and idea status after successful persistence.

## 9. Review Rules

Review is profile-aware.

### Default Profile

```text
minimal
```

The agent may recommend `refactor` or `full-feature`, and the user may override the profile before acceptance.

### Minimal Plan Blockers

- no goals;
- no WBS;
- WBS row lacks acceptance criteria;
- WBS row lacks verification guidance;
- unresolved critical open question.

### Refactor Plan Additional Blockers

- affected systems/files not identified;
- no migration or compatibility notes when behavior changes;
- no test strategy for changed code paths.

### Full-Feature Plan Additional Blockers

- architecture direction missing;
- UI/UX direction missing when a UI surface is affected;
- rollout/rollback missing when persistence, commands, or task generation change;
- task payloads insufficient for finalization.

Warnings should include low sizing confidence, minor test gaps, optional polish gaps, or risks that should be visible but do not block approval.

Warnings do not block acceptance.

## 10. Finalize Algorithm

Finalize uses a two-pass mapping so WBS dependencies resolve cleanly.

```text
Pass 1: create deterministic draft identities for each selected WBS row.
Pass 2: resolve WBS dependencies to task draft IDs or persisted task IDs.
Pass 3: block if selected rows depend on unselected rows.
Pass 4: run task draft review.
Pass 5: dry-run preview by default.
Pass 6: persist transactionally after confirmation.
Pass 7: write created task IDs and provenance back to finalize result and plan/idea metadata.
```

Generated task metadata must include:

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

# Right-Sized Implementation WBS

## Sizing Standard

Each WBS item below should be feasible in one focused session with a middle-cost coding model.

A task is too large if it requires broad dashboard, command, schema, and test changes at once.

A task is too small if it only renames a label, edits one string, or adds one trivial assertion without proving behavior.

## WBS-0 — Baseline and Guardrails

### WBS-0.1 — Run baseline health checks and identify planner test surface

**Goal:** Establish a known starting point.

**Scope:** Run baseline commands, record failures, identify planner/dashboard tests that must remain green.

**Acceptance criteria:**

- `pnpm exec wk doctor` result recorded.
- `pnpm run build` result recorded.
- `pnpm run test` result recorded.
- Existing planner-related tests are listed for follow-up.

**Verification:** Manual command output or CI output.

**Dependencies:** none.

**Sizing:** one short session.

## WBS-1 — Real Idea Planning Commands

### WBS-1.1 — Implement `start-idea-planning` command contract

**Goal:** Make Plan this a command-layer lifecycle transition.

**Scope:** Add a real workspace-kit `start-idea-planning` command that fetches the canonical idea, detects active sessions, handles idempotency, generates the small planner-chat prompt, persists session state, and returns dashboard-ready data.

**Acceptance criteria:**

- Command works with `ideaId` only.
- Missing idea returns actionable error.
- Active session returns `mode: "resumed"` instead of creating another session.
- Open idea returns `mode: "started"` and a prompt.
- Result includes session, linked plan, active draft plan, and previous plan lineage data.

**Verification:** Unit tests for missing idea, open idea, active session, and repeated mutation id.

**Dependencies:** WBS-0.1.

**Sizing:** one medium session.

### WBS-1.2 — Implement `update-idea-planning-session` command contract

**Goal:** Make planning session transitions explicit, durable, and command-owned.

**Scope:** Add a real workspace-kit command that moves a session through `active`, `draft_ready`, `needs_revision`, `approval_ready`, `completed`, `abandoned`, and `superseded` with idea/session/version validation.

**Acceptance criteria:**

- Command updates status, summary, currentPlanRef, and currentPlanVersion.
- Command rejects mismatched idea/session updates.
- Command returns dashboard-ready session state.
- Command is idempotent for repeated mutation ids.

**Verification:** Unit tests for each session state transition and mismatched session rejection.

**Dependencies:** WBS-1.1.

**Sizing:** one medium session.

### WBS-1.3 — Wire dashboard Plan this to `start-idea-planning`

**Goal:** Make the dashboard a thin caller of the command.

**Scope:** Replace direct/scattered Plan this logic in the dashboard provider with a call to `start-idea-planning`.

**Acceptance criteria:**

- Open idea Plan this invokes the command.
- Returned prompt opens/prefills Cursor chat.
- Dashboard row refreshes into planning/resume state.
- User-facing errors are clear.

**Verification:** Dashboard test for Plan this happy path.

**Dependencies:** WBS-1.1.

**Sizing:** one medium session.

### WBS-1.4 — Verify Plan this idempotency from dashboard

**Goal:** Prevent duplicate sessions and conflicting prompts from the real UI path.

**Scope:** Add dashboard-level tests around repeated Plan this clicks and command replay behavior.

**Acceptance criteria:**

- Double click creates one session.
- Repeated mutation returns same prompt/session result.
- Dashboard does not show Plan this and Resume planning simultaneously.

**Verification:** Dashboard or integration test for repeated Plan this click.

**Dependencies:** WBS-1.1, WBS-1.3.

**Sizing:** one small-to-medium session.

## WBS-2 — Planner Chat Prompt and Agent Contract

### WBS-2.1 — Generate a small command-backed planner-chat prompt

**Goal:** Keep the dashboard prompt simple because `start-idea-planning` already loaded context.

**Scope:** Update prompt generation so the returned prompt references the idea/session/plan lineage compactly and delegates details to planner-chat playbook and command layer.

**Acceptance criteria:**

- Prompt includes source idea id and plan lineage summary.
- Prompt states that the target is accepted PlanArtifact + WBS.
- Prompt tells agent to use command-layer transitions.
- Prompt does not expose raw CLI choreography as user-facing instructions.

**Verification:** Unit tests for no plan, active draft plan, linked accepted plan, previous plans, and active session summary.

**Dependencies:** WBS-1.1.

**Sizing:** one medium session.

### WBS-2.2 — Update planner-chat playbook with locked decisions

**Goal:** Make the playbook match the chosen session and approval model.

**Scope:** Update `.ai/playbooks/planner-chat.md` so it references real commands, session states, default minimal profile, warning behavior, approval/finalize separation, and v1 WBS/task mapping rules.

**Acceptance criteria:**

- Playbook distinguishes `draft_ready`, `needs_revision`, `approval_ready`, and `completed`.
- Playbook does not mark a session complete on draft persistence alone.
- Playbook says warnings do not block acceptance.
- Playbook says finalization requires separate confirmation.

**Verification:** Documentation review plus prompt/playbook fixture test if available.

**Dependencies:** WBS-2.1.

**Sizing:** one medium session.

### WBS-2.3 — Add explicit Planning Agent contract or registry entry

**Goal:** Give agents a stable planner role and instruction anchor.

**Scope:** Add a named Planning Agent profile, registry entry, or documented equivalent that references planner-chat, schema, commands, policy rules, and locked product decisions.

**Acceptance criteria:**

- Agent contract defines done state as accepted PlanArtifact with WBS.
- Agent contract references `start-idea-planning` and `update-idea-planning-session`.
- Agent contract stays user-facing in tone and avoids raw command noise.

**Verification:** Static/documentation test if available; otherwise review and one prompt fixture test.

**Dependencies:** WBS-2.2.

**Sizing:** one medium session.

## WBS-3 — PlanArtifact Draft and Lineage

### WBS-3.1 — Enforce source idea provenance on idea-originated drafts

**Goal:** Prevent orphaned plans from Ideas row planning sessions.

**Scope:** Update draft validation so PlanArtifacts from planner-chat require `sourceIdeaId` and preserve previous plan refs.

**Acceptance criteria:**

- Idea-originated draft without `sourceIdeaId` fails validation.
- Draft with previous plan refs persists provenance.
- Non-idea drafts remain supported if currently allowed.

**Verification:** Unit tests for draft validation.

**Dependencies:** WBS-2.1.

**Sizing:** one medium session.

### WBS-3.2 — Link draft PlanArtifact as `activeDraftPlanArtifact`

**Goal:** Prevent replanning from overwriting the last accepted plan too early.

**Scope:** Update idea-plan linking so persisted drafts become `activeDraftPlanArtifact`, not `linkedPlanArtifact`.

**Acceptance criteria:**

- New draft links to idea as active draft.
- Existing accepted linked plan remains unchanged during replanning.
- Previous plan refs are preserved.

**Verification:** Unit test for first draft and replan existing accepted idea.

**Dependencies:** WBS-3.1.

**Sizing:** one medium session.

### WBS-3.3 — Move session to `draft_ready` after draft persistence

**Goal:** Record that the session produced a draft but is not complete.

**Scope:** After draft persistence, call or require `update-idea-planning-session` with `draft_ready`, currentPlanRef, and currentPlanVersion.

**Acceptance criteria:**

- Draft persistence updates session state to `draft_ready`.
- Session is not marked completed.
- Dashboard can resume planning from draft-ready state.

**Verification:** Unit test and dashboard state test.

**Dependencies:** WBS-1.2, WBS-3.2.

**Sizing:** one medium session.

### WBS-3.4 — Add PlanArtifact version immutability checks

**Goal:** Prevent accepted versions from being mutated in place.

**Scope:** Ensure new edits produce new versions and accepted/finalized versions remain immutable.

**Acceptance criteria:**

- Draft update increments version when required.
- Accepted version cannot be overwritten.
- Superseded/lineage metadata remains inspectable.

**Verification:** Unit tests for draft update, accepted version update rejection, and new version creation.

**Dependencies:** WBS-3.2.

**Sizing:** one medium session.

## WBS-4 — Review Gate

### WBS-4.1 — Implement profile-aware core review rules

**Goal:** Catch incomplete plans without overblocking small ideas.

**Scope:** Implement minimal blockers: missing goals, missing WBS, WBS missing acceptance criteria, WBS missing verification, unresolved critical open question. Default unspecified profile to `minimal`.

**Acceptance criteria:**

- Minimal profile validates only core planning completeness.
- Default profile is `minimal`.
- Blockers include path and WBS id when applicable.
- Warnings are distinct from blockers.

**Verification:** Unit tests for missing WBS, missing acceptance criteria, missing verification, unresolved critical question, and unspecified profile.

**Dependencies:** WBS-3.1.

**Sizing:** one medium session.

### WBS-4.2 — Add refactor/full-feature conditional review rules

**Goal:** Make review strict only when the profile requires it.

**Scope:** Add blockers/warnings for affected systems, migration/compatibility, architecture, UI/UX, rollout/rollback, and task payload sufficiency based on planning profile.

**Acceptance criteria:**

- Refactor profile requires affected-system and test strategy coverage.
- Full-feature profile requires architecture and UI/UX when relevant.
- Persistence/task-generation changes require rollout or rollback notes.

**Verification:** Unit tests for refactor and full-feature profiles.

**Dependencies:** WBS-4.1.

**Sizing:** one medium session.

### WBS-4.3 — Persist/expose review records and update session state

**Goal:** Let dashboard render review results and session state without parsing raw validator output.

**Scope:** Return or store review status, blockers, warnings, WBS count, open question count, and coverage summary; call `update-idea-planning-session` when idea/session context exists.

**Acceptance criteria:**

- Review output has stable shape.
- Dashboard can show blocker count and warning count directly.
- Blocked review moves session to `needs_revision`.
- Passed/warning-only review moves session to `approval_ready`.

**Verification:** Unit test for review output shape and session status update.

**Dependencies:** WBS-1.2, WBS-4.1.

**Sizing:** one medium session.

## WBS-5 — Acceptance Gate

### WBS-5.1 — Enforce accept-plan-artifact gate conditions

**Goal:** Make acceptance the only approval path.

**Scope:** Ensure accept requires reviewed version, no blockers, resolved/deferred open questions, user confirmation metadata, and current version match. Warnings must not block.

**Acceptance criteria:**

- Cannot accept unreviewed plan.
- Cannot accept blocked plan.
- Can accept warning-only reviewed plan.
- Cannot accept stale version.
- Acceptance record is written with approved version and metadata.

**Verification:** Unit tests for unreviewed, blocked, warning-only, stale, and successful acceptance.

**Dependencies:** WBS-4.3.

**Sizing:** one medium session.

### WBS-5.2 — Promote accepted draft to linked plan and complete session

**Goal:** Update idea/session state only after approval.

**Scope:** On successful acceptance, promote `activeDraftPlanArtifact` to `linkedPlanArtifact`, preserve previous plan refs, set session `completed`, and update idea lifecycle.

**Acceptance criteria:**

- Accepted plan becomes current linked plan.
- Active draft is cleared or marked accepted according to store design.
- Session status becomes completed through `update-idea-planning-session`.
- Replanning lineage remains intact.

**Verification:** Unit test for first plan acceptance and replan acceptance.

**Dependencies:** WBS-1.2, WBS-5.1, WBS-3.2.

**Sizing:** one medium session.

## WBS-6 — Dashboard Lifecycle UI

### WBS-6.1 — Implement `deriveIdeaPlanningLifecycleState`

**Goal:** Prevent contradictory dashboard actions.

**Scope:** Add a pure reducer/helper that derives UI state from idea, session, linked plan, active draft plan, review, and finalize result using the locked precedence order.

**Acceptance criteria:**

- Helper returns one lifecycle state at a time.
- Precedence matches finalized > accepted > review > active draft > session > idea.
- Impossible action combos are prevented.
- Tests cover open, planning, draft_ready, needs_revision, approval_ready, accepted, finalized, superseded.

**Verification:** Unit tests for state matrix and precedence conflicts.

**Dependencies:** WBS-1.2, WBS-4.3, WBS-5.2.

**Sizing:** one medium session.

### WBS-6.2 — Render Ideas row actions from derived lifecycle state

**Goal:** Make the row action model obvious and correct.

**Scope:** Use the derived helper to show Plan this, Resume planning, Review, Accept, Finalize, View tasks, or View plan.

**Acceptance criteria:**

- Open ideas show Plan this.
- Active sessions show Resume planning.
- Blocked reviews disable Accept.
- Warning-only approval-ready state allows Accept.
- Accepted plans show Finalize.
- Finalized plans show View tasks.

**Verification:** Dashboard tests for each state.

**Dependencies:** WBS-6.1.

**Sizing:** one medium session.

### WBS-6.3 — Render current plan card and review summary

**Goal:** Let the operator inspect plan status without reopening chat.

**Scope:** Add card showing plan title, planRef, version, status, WBS count, blocker count, warning count, open question count, profile, and phase recommendation.

**Acceptance criteria:**

- Draft plan card shows Review.
- Needs-revision plan card shows blockers and Resume planning.
- Approval-ready plan card shows Accept.
- Accepted plan card shows Finalize.

**Verification:** Dashboard rendering tests.

**Dependencies:** WBS-6.1, WBS-4.3.

**Sizing:** one medium session.

### WBS-6.4 — Render WBS preview

**Goal:** Let the user inspect decomposition before finalizing tasks.

**Scope:** Display WBS path, title, phase, dependencies, acceptance criteria summary, verification summary, and generated task title.

**Acceptance criteria:**

- WBS preview renders for draft/reviewed/accepted plan.
- Dependencies are visible.
- Missing acceptance/verification is visibly flagged if review found it.

**Verification:** Dashboard rendering tests with sample WBS rows.

**Dependencies:** WBS-6.3.

**Sizing:** one medium session.

## WBS-7 — Finalize to Task Engine

### WBS-7.1 — Implement one-WBS-row-to-one-task draft normalization

**Goal:** Convert WBS rows into task-engine-compatible drafts with v1 mapping rules.

**Scope:** Map each selected WBS row to exactly one task draft with title, body, acceptance criteria, verification, phase, desired status, dependencies, and metadata.

**Acceptance criteria:**

- Each selected WBS row produces exactly one task draft.
- Draft body includes enough context for implementation.
- Draft metadata includes planRef, planId, planVersion, wbsId, wbsPath, and sourceIdeaId.

**Verification:** Unit tests for basic WBS row, dependency row, and missing optional fields.

**Dependencies:** WBS-5.1.

**Sizing:** one medium session.

### WBS-7.2 — Add two-pass dependency resolution for finalize

**Goal:** Resolve WBS dependencies into task dependencies safely.

**Scope:** Create deterministic draft identities first, then resolve WBS dependency references to task draft IDs or persisted task IDs.

**Acceptance criteria:**

- WBS dependency on selected row resolves to generated task dependency.
- Dependency on unselected row blocks in v1.
- Invalid dependency is reported clearly.

**Verification:** Unit tests for internal dependency, unselected dependency block, and invalid dependency.

**Dependencies:** WBS-7.1.

**Sizing:** one medium session.

### WBS-7.3 — Integrate task draft review into finalize dry-run

**Goal:** Reuse existing task draft validation before task persistence.

**Scope:** Make finalize dry-run run task draft review and return preview plus review findings.

**Acceptance criteria:**

- Dry-run does not mutate tasks.
- Failing task draft review blocks persistence.
- Warning-only result can proceed after confirmation.

**Verification:** Unit/E2E test for dry-run preview and blocked draft review.

**Dependencies:** WBS-7.2.

**Sizing:** one medium session.

### WBS-7.4 — Persist finalized tasks idempotently

**Goal:** Create tasks exactly once from an accepted plan/version.

**Scope:** Persist task batch after explicit confirmation, use client mutation id, write task ids back to finalize result and plan/idea metadata.

**Acceptance criteria:**

- Accepted plan can persist generated tasks.
- Same mutation id returns same batch.
- Already-finalized plan is blocked or returns existing result.
- Plan status becomes finalized only after persistence succeeds.

**Verification:** E2E test for finalize persist and duplicate finalize.

**Dependencies:** WBS-7.3.

**Sizing:** one medium session.

### WBS-7.5 — Render finalize preview and confirm-persist UI

**Goal:** Separate preview from persistence in the dashboard.

**Scope:** Show dry-run task preview first; require explicit confirmation to persist.

**Acceptance criteria:**

- Finalize button opens preview.
- Persist tasks button appears after preview.
- Preview shows task count, task titles, phases, dependencies, and WBS provenance.
- Confirmed persist refreshes task/phase sections.

**Verification:** Dashboard tests for preview and confirm persistence.

**Dependencies:** WBS-7.3, WBS-7.4.

**Sizing:** one medium session.

## WBS-8 — Legacy Cleanup and Deferred Migration

### WBS-8.1 — Demote dashboard planning wizard from primary idea flow

**Goal:** Stop users from entering the legacy path by default.

**Scope:** Move old wizard behind Advanced/Legacy or remove it from the Ideas row primary action path.

**Acceptance criteria:**

- Main Ideas action routes to planner-chat path.
- Legacy wizard is clearly labeled if retained.
- Legacy wizard cannot be mistaken for PlanArtifact planning.

**Verification:** Dashboard test or snapshot verifying primary action labels.

**Dependencies:** WBS-6.2.

**Sizing:** one small-to-medium session.

### WBS-8.2 — Mark direct build-plan task creation as legacy/preview

**Goal:** Preserve compatibility without encouraging the wrong flow.

**Scope:** Update docs/UI labels/messages around `build-plan` direct task output.

**Acceptance criteria:**

- Existing `build-plan` behavior remains compatible.
- Serious planning docs point to PlanArtifact.
- Direct task output from `build-plan` is labeled preview/legacy where surfaced.

**Verification:** Existing tests still pass; doc/static check if available.

**Dependencies:** WBS-8.1.

**Sizing:** one small session.

### WBS-8.3 — Document legacy import path but defer implementation

**Goal:** Preserve the future migration path without delaying the primary integration.

**Scope:** Document how legacy `build-plan`/wishlist output should eventually become a PlanArtifact draft with provenance.

**Acceptance criteria:**

- Documentation describes future `import-build-plan` or equivalent flow.
- Documentation states implementation is deferred until primary path is stable.
- No primary path WBS item depends on legacy import implementation.

**Verification:** Documentation review.

**Dependencies:** WBS-8.2.

**Sizing:** one small session.

## WBS-9 — Reliability and Error Handling

### WBS-9.1 — Add lifecycle invariant tests

**Goal:** Catch contradictory planning states early.

**Scope:** Add tests for impossible states and action combinations.

**Acceptance criteria:**

- Idea cannot show Plan this and Resume planning simultaneously.
- Review-blocked plan cannot show Accept.
- Warning-only review can show Accept.
- Accepted plan cannot have mutable WBS for same version.
- Finalized plan cannot reopen as draft in place.
- Finalized task provenance resolves to existing WBS id.

**Verification:** Unit tests for lifecycle invariants.

**Dependencies:** WBS-6.1, WBS-7.4.

**Sizing:** one medium session.

### WBS-9.2 — Add stale generation and retry handling for planning mutations

**Goal:** Avoid silent overwrites and confusing failures.

**Scope:** Apply generation handling to `start-idea-planning`, `update-idea-planning-session`, draft persistence, acceptance, and finalize persistence.

**Acceptance criteria:**

- Stale generation retries once.
- Repeated mismatch returns clear error.
- No silent overwrites occur.

**Verification:** Unit tests for stale generation on Plan this and accept/finalize if harness supports it.

**Dependencies:** WBS-1.1, WBS-1.2, WBS-5.1, WBS-7.4.

**Sizing:** one medium session.

### WBS-9.3 — Add actionable error messages for blocked transitions

**Goal:** Make failure states repairable by the operator.

**Scope:** Normalize user-facing errors for missing idea, duplicate session, blocked acceptance, unaccepted finalize, invalid WBS dependency, unselected WBS dependency, and duplicate finalize.

**Acceptance criteria:**

- No raw stack traces in dashboard.
- Error includes what blocked and how to fix it.
- Blocked states remain resumable.

**Verification:** Unit tests or dashboard tests for representative blocked errors.

**Dependencies:** WBS-4.3, WBS-5.1, WBS-7.2.

**Sizing:** one medium session.

### WBS-9.4 — Add audit trail metadata for major transitions

**Goal:** Debug planning failures without reading chat transcripts.

**Scope:** Record idea status changes, session start/resume/complete, plan draft versions, review records, approval records, finalize previews, and persisted task batch ids.

**Acceptance criteria:**

- Each major transition has inspectable metadata.
- Plan/task provenance is sufficient for later drift detection.
- Audit metadata does not leak raw chat transcript content.

**Verification:** Unit/E2E test for metadata after golden path.

**Dependencies:** WBS-3.3, WBS-4.3, WBS-5.2, WBS-7.4.

**Sizing:** one medium session.

# Recommended Execution Order

Use this order to avoid integration churn:

1. WBS-0.1
2. WBS-1.1
3. WBS-1.2
4. WBS-2.1
5. WBS-1.3
6. WBS-1.4
7. WBS-2.2
8. WBS-2.3
9. WBS-3.1
10. WBS-3.2
11. WBS-3.3
12. WBS-3.4
13. WBS-4.1
14. WBS-4.2
15. WBS-4.3
16. WBS-5.1
17. WBS-5.2
18. WBS-6.1
19. WBS-6.2
20. WBS-6.3
21. WBS-6.4
22. WBS-7.1
23. WBS-7.2
24. WBS-7.3
25. WBS-7.4
26. WBS-7.5
27. WBS-8.1
28. WBS-8.2
29. WBS-8.3
30. WBS-9.1
31. WBS-9.2
32. WBS-9.3
33. WBS-9.4

# First Shippable Milestone

Milestone 1 should establish the button-to-session foundation before full PlanArtifact hardening:

```text
WBS-1.1 start-idea-planning command
WBS-1.2 update-idea-planning-session command
WBS-2.1 command-backed small prompt
WBS-1.3 dashboard Plan this wiring
WBS-1.4 Plan this idempotency
WBS-6.1 derived lifecycle helper
```

Milestone 1 is successful when clicking Plan this starts or resumes exactly one durable planning session and the dashboard state is derived by one tested lifecycle helper.

# Test Plan

## Unit Tests

Add or extend unit tests for:

- `start-idea-planning` missing idea, open idea, active session, repeated mutation id;
- `update-idea-planning-session` valid transitions and mismatched session rejection;
- small planner-chat prompt with idea-only input;
- prompt with linked accepted plan;
- prompt with active draft plan;
- prompt with previous plan artifacts;
- prompt with active session summary;
- no raw CLI command leakage;
- `deriveIdeaPlanningLifecycleState` precedence and state matrix;
- PlanArtifact schema validation;
- source idea provenance validation;
- `linkedPlanArtifact` / `activeDraftPlanArtifact` promotion rules;
- WBS row validation;
- profile-aware review blockers;
- warning-only review acceptance;
- accept gate behavior;
- one-WBS-row-to-one-task normalization;
- dependency resolution;
- subset finalize dependency block;
- finalize idempotency;
- lifecycle invariants.

## Dashboard Tests

Add or extend dashboard tests for:

- open idea shows Plan this;
- Plan this calls `start-idea-planning`;
- returned prompt opens/prefills Cursor chat;
- double Plan this click is idempotent;
- active session shows Resume planning;
- draft plan shows Review;
- blocked review disables Accept;
- warning-only review allows Accept;
- accepted plan shows Finalize;
- WBS preview renders;
- finalize first shows dry-run preview;
- confirmed finalize creates tasks;
- finalized plan shows task count/links;
- legacy wizard is not primary planning path.

## CLI/E2E Tests

Maintain a golden path:

```text
create idea
→ start-idea-planning
→ generate small planner-chat prompt
→ persist PlanArtifact draft with WBS
→ update session to draft_ready
→ review PlanArtifact
→ update session to approval_ready
→ accept reviewed PlanArtifact
→ promote activeDraftPlanArtifact to linkedPlanArtifact
→ update session to completed
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
- accept warning-only plan succeeds;
- finalize unaccepted plan;
- invalid WBS dependency;
- selected WBS row depends on unselected WBS row;
- duplicate finalize;
- replan accepted idea and preserve lineage.

# Definition of Done

The implementation is done when:

1. Clicking **Plan this** calls `start-idea-planning` and starts or resumes exactly one planning session for that idea.
2. The returned prompt is small, command-backed, and contains idea context, plan lineage, provenance instructions, and the complete session target.
3. `update-idea-planning-session` owns session transitions.
4. The Planning Agent can brainstorm naturally and knows the session is not complete until an accepted PlanArtifact with WBS exists.
5. Draft persistence links a structured PlanArtifact back to the idea as `activeDraftPlanArtifact`.
6. Replanning does not overwrite `linkedPlanArtifact` before replacement acceptance.
7. Review identifies blockers and warnings with actionable messages.
8. Warnings do not block acceptance.
9. The user explicitly accepts a reviewed plan version.
10. Acceptance promotes `activeDraftPlanArtifact` to `linkedPlanArtifact` and completes the session.
11. Finalize remains separate from approval.
12. Finalize creates one task draft per accepted WBS row.
13. Subset finalization blocks on unselected dependencies in v1.
14. WBS dependencies resolve correctly into task dependencies.
15. Persisted tasks include plan and WBS provenance.
16. The dashboard uses `deriveIdeaPlanningLifecycleState` for all planning actions.
17. The dashboard clearly shows the idea’s state from raw idea through finalized tasks.
18. Legacy `build-plan` does not confuse the primary dashboard flow.
19. Legacy import is documented/deferred and does not block the primary path.
20. Tests cover happy path, blocked path, idempotency, lineage, lifecycle invariants, dependency resolution, and finalize provenance.

# Final Target System

```text
Idea = seed
start-idea-planning = command-backed session start and small prompt generation
Planner chat = discovery
update-idea-planning-session = durable session state transitions
PlanArtifact = approved design and WBS truth
Finalize = compile accepted WBS into tasks
Task Engine = execution truth
Dashboard = derived-state control surface
```

Anything that does not support that model should either be demoted, hidden, migrated, or removed.
