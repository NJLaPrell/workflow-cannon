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

The goal is not simply to generate tasks. The goal is to turn a raw idea into an approved, structured plan with a complete WBS. Only after approval should the system create executable tasks.

This document is the implementation plan and right-sized WBS for that integration. Each WBS item is scoped so a middle-cost coding model should be able to complete it in one focused session.

## Product Outcome

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
  Safe, context-rich prompt that tells Cursor to run the planner-chat playbook for the selected idea.

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

Dashboard
  Human control surface. It displays state and invokes commands; it must not own planning business logic.
```

## End-to-End Flow

## 1. Capture Idea

The operator creates an Ideas row in the dashboard.

Minimum fields:

- `ideaId`;
- `title`;
- `note`;
- `status`.

Planning-related fields should support or emulate:

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

`linkedPlanArtifact` should mean the latest accepted/finalized plan. `activeDraftPlanArtifact` should mean the current draft/review plan. Replanning must not overwrite the accepted plan until the replacement is accepted.

## 2. Click Plan This

The Ideas row exposes **Plan this** when no active planning session or accepted plan blocks the primary action.

When clicked, the system must:

1. Resolve the canonical idea by `ideaId` from the command layer.
2. Determine whether an active planning session already exists for the idea.
3. Resume an active matching session instead of blindly creating another.
4. Build a planner-chat prompt using canonical idea data.
5. Include plan lineage context:
   - current `linkedPlanArtifact`, when present;
   - `activeDraftPlanArtifact`, when present;
   - `previousPlanArtifacts`, when present;
   - current idea status;
   - existing planning session summary, when present.
6. Persist or update planning-chat session state for the idea.
7. Update the idea status to `planning`.
8. Open or prefill Cursor chat with the generated prompt.
9. Refresh dashboard state so the row shows **Resume planning** and lifecycle status.

Double-clicking **Plan this** must not create competing sessions or conflicting prompt state.

## 3. Planner Chat Session

The generated prompt should make the agent:

- load the selected Ideas row;
- preserve `sourceIdeaId` provenance;
- use `.ai/playbooks/planner-chat.md` as the controlling workflow;
- avoid exposing raw CLI choreography to the operator;
- ask one useful question at a time;
- keep an evolving session summary;
- know the target output is a complete PlanArtifact with WBS, review, and approval.

The agent’s first response should briefly restate the idea and ask the highest-value clarifying question. It should not open with a giant questionnaire.

## 4. Session Completion

The brainstorming session is complete only when there is an accepted PlanArtifact version.

Recommended session states:

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

The dashboard should derive actions from durable state, not from in-memory wizard state.

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

Implement one deterministic derived-state helper rather than scattering this logic across the dashboard.

## 8. Command/API Contract

Prefer command-layer ownership for lifecycle transitions.

### `start-idea-planning`

Input:

```json
{
  "ideaId": "...",
  "clientMutationId": "...",
  "policyApproval": {...},
  "planningGeneration": 123
}
```

Responsibilities:

- canonical idea fetch;
- active session detection;
- idempotent mutation;
- prompt generation;
- session persistence;
- dashboard-friendly result.

### `update-idea-planning-session`

Responsibilities:

- update planning session state;
- record prompt/resume prompt/summary;
- move session to `draft_ready`, `needs_revision`, `approval_ready`, or `completed`;
- keep session tied to one idea and current plan version.

### `draft-plan-artifact`

Responsibilities:

- validate PlanArtifact v1 shape;
- validate required profile sections;
- assign or preserve planId;
- increment version when updating existing plan;
- write artifact to canonical plan-artifact storage;
- return planRef, path, version, status, and summary;
- preserve provenance.

### `review-plan-artifact`

Responsibilities:

- produce blocker/warning review result;
- write or return review record;
- support dashboard-friendly rendering;
- identify exact WBS row or section for each finding.

### `accept-plan-artifact`

Responsibilities:

- require reviewed version;
- require no blockers unless override is intentionally supported;
- record approval;
- pin approved version;
- mark plan status accepted;
- promote `activeDraftPlanArtifact` to `linkedPlanArtifact`;
- update linked idea to accepted/planned state.

### `finalize-plan-to-phase`

Responsibilities:

- require accepted plan;
- map WBS rows to task drafts;
- run task draft review;
- dry-run by default;
- persist only after confirmation;
- write plan/WBS provenance;
- update plan and idea status after successful persistence.

## 9. Review Rules

Review should be profile-aware.

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

## 10. Finalize Algorithm

Finalize should use a two-pass mapping so WBS dependencies resolve cleanly.

```text
Pass 1: create deterministic draft identities for each selected WBS row.
Pass 2: resolve WBS dependencies to task draft IDs or persisted task IDs.
Pass 3: run task draft review.
Pass 4: dry-run preview by default.
Pass 5: persist transactionally after confirmation.
Pass 6: write created task IDs and provenance back to finalize result and plan/idea metadata.
```

If a user finalizes a subset of WBS rows and a selected row depends on an unselected row, finalize should either block or require explicit dependency deferral.

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

**Files likely touched:** none, unless adding a short note to existing planner task docs.

**Acceptance criteria:**

- `pnpm exec wk doctor` result recorded.
- `pnpm run build` result recorded.
- `pnpm run test` result recorded.
- Existing planner-related tests are listed for follow-up.

**Verification:** Manual command output or CI output.

**Dependencies:** none.

**Sizing:** one short session.

## WBS-1 — Idea Planning Entry Point

### WBS-1.1 — Add or centralize canonical idea planning start helper

**Goal:** Stop the dashboard from owning scattered Plan this business logic.

**Scope:** Implement a command-layer helper or workspace-kit command equivalent to `start-idea-planning` that fetches the canonical idea, detects active session state, and returns a dashboard-friendly planning-start result.

**Acceptance criteria:**

- Helper works with `ideaId` only.
- Missing idea returns actionable error.
- Active session returns resume result instead of creating a new session.
- Result includes prompt/session/status data needed by the dashboard.

**Verification:** Unit test for missing idea, open idea, active session.

**Dependencies:** WBS-0.1.

**Sizing:** one medium session.

### WBS-1.2 — Make Plan this dashboard action call the centralized start helper

**Goal:** Wire the dashboard button to the correct integration boundary.

**Scope:** Replace direct or scattered Plan this logic in the dashboard provider with a call to the centralized helper/command.

**Acceptance criteria:**

- Open idea Plan this creates or resumes planning through the helper.
- Dashboard row refreshes into planning/resume state.
- User-facing errors are clear.

**Verification:** Dashboard test for Plan this happy path.

**Dependencies:** WBS-1.1.

**Sizing:** one medium session.

### WBS-1.3 — Make Plan this idempotent under repeated clicks

**Goal:** Prevent duplicate sessions and conflicting prompts.

**Scope:** Add client mutation id handling and active-session reuse behavior for repeated Plan this clicks.

**Acceptance criteria:**

- Double click creates one session.
- Repeated mutation returns same prompt/session result.
- Dashboard does not show Plan this and Resume planning simultaneously.

**Verification:** Unit or dashboard test for repeated Plan this click.

**Dependencies:** WBS-1.1, WBS-1.2.

**Sizing:** one medium session.

### WBS-1.4 — Persist resumable planning session state

**Goal:** Make planning sessions durable across dashboard reloads.

**Scope:** Persist session id, idea id, prompt, resume prompt, status, timestamps, summary, and current planRef/version if present.

**Acceptance criteria:**

- Dashboard reload still shows Resume planning for active session.
- Session appears only on the matching idea.
- Mismatched/stale sessions do not leak to other ideas.

**Verification:** Unit test for session persistence and dashboard test for reload state if test harness supports it.

**Dependencies:** WBS-1.1.

**Sizing:** one medium session.

## WBS-2 — Planner Chat Prompt and Agent Contract

### WBS-2.1 — Extend planner-chat prompt with lineage and completion target

**Goal:** Ensure the agent knows the full target: PlanArtifact + WBS + review + approval.

**Scope:** Update `buildPlannerChatPrompt` to include linked plan, active draft plan, previous plans, active session summary, source idea id, and session completion rules.

**Acceptance criteria:**

- Prompt includes idea context and plan lineage.
- Prompt states that the session is not complete until an accepted PlanArtifact exists.
- Prompt does not expose raw CLI choreography as user-facing instructions.

**Verification:** Unit tests for no plan, active draft plan, linked accepted plan, previous plans, active session summary.

**Dependencies:** WBS-1.1.

**Sizing:** one medium session.

### WBS-2.2 — Update planner-chat playbook with session state transitions

**Goal:** Make the playbook match the desired completion handshake.

**Scope:** Update `.ai/playbooks/planner-chat.md` so draft, review blocked, approval ready, accepted, and finalized states are explicit.

**Acceptance criteria:**

- Playbook distinguishes `draft_ready`, `needs_revision`, `approval_ready`, and `completed`.
- Playbook tells the agent not to mark session complete on draft persistence alone.
- Playbook tells the agent how to proceed after blockers.

**Verification:** Documentation review plus prompt unit test if playbook text is imported into prompt tests.

**Dependencies:** WBS-2.1.

**Sizing:** one small-to-medium session.

### WBS-2.3 — Add explicit Planning Agent contract or registry entry

**Goal:** Give agents a stable planner role and instruction anchor.

**Scope:** Add a named Planning Agent profile, registry entry, or documented equivalent that references planner-chat, schema, commands, and policy rules.

**Acceptance criteria:**

- Agent contract defines done state.
- Agent contract references PlanArtifact schema and command contracts.
- Agent contract stays user-facing in tone and avoids raw command noise.

**Verification:** Static/documentation test if available; otherwise review and one prompt fixture test.

**Dependencies:** WBS-2.2.

**Sizing:** one medium session.

## WBS-3 — PlanArtifact Draft and Session Completion

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

### WBS-3.2 — Link draft PlanArtifact as active draft without replacing accepted plan

**Goal:** Prevent replanning from overwriting the last accepted plan too early.

**Scope:** Update idea-plan linking so persisted drafts become `activeDraftPlanArtifact`, not `linkedPlanArtifact`, unless no accepted plan concept exists yet and compatibility requires fallback.

**Acceptance criteria:**

- New draft links to idea as active draft.
- Existing accepted linked plan remains unchanged during replanning.
- Previous plan refs are preserved.

**Verification:** Unit test for first draft and replan existing accepted idea.

**Dependencies:** WBS-3.1.

**Sizing:** one medium session.

### WBS-3.3 — Add session-state update after draft persistence

**Goal:** Move planning session to `draft_ready` after a draft is saved.

**Scope:** Add or update session mutation so the draft planRef/version is recorded and session status becomes `draft_ready`.

**Acceptance criteria:**

- Draft persistence updates session state.
- Session is not marked completed.
- Dashboard can resume planning from draft-ready state.

**Verification:** Unit test and dashboard state test.

**Dependencies:** WBS-3.2.

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

**Scope:** Implement minimal blockers: missing goals, missing WBS, WBS missing acceptance criteria, WBS missing verification, unresolved critical open question.

**Acceptance criteria:**

- Minimal profile validates only core planning completeness.
- Blockers include path and WBS id when applicable.
- Warnings are distinct from blockers.

**Verification:** Unit tests for missing WBS, missing acceptance criteria, missing verification, unresolved critical question.

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

### WBS-4.3 — Persist or expose dashboard-friendly review records

**Goal:** Let dashboard render review results without parsing raw validator output.

**Scope:** Return or store review status, blockers, warnings, WBS count, open question count, and coverage summary.

**Acceptance criteria:**

- Review output has stable shape.
- Dashboard can show blocker count and warning count directly.
- Review result updates session status to `needs_revision` or `approval_ready`.

**Verification:** Unit test for review output shape and session status update.

**Dependencies:** WBS-4.1.

**Sizing:** one medium session.

## WBS-5 — Acceptance Gate

### WBS-5.1 — Enforce accept-plan-artifact gate conditions

**Goal:** Make acceptance the only approval path.

**Scope:** Ensure accept requires reviewed version, no blockers unless explicit override exists, resolved/deferred open questions, user confirmation metadata, and current version match.

**Acceptance criteria:**

- Cannot accept unreviewed plan.
- Cannot accept blocked plan.
- Cannot accept stale version.
- Acceptance record is written with approved version and metadata.

**Verification:** Unit tests for unreviewed, blocked, stale, and successful acceptance.

**Dependencies:** WBS-4.3.

**Sizing:** one medium session.

### WBS-5.2 — Promote accepted draft to linked plan and complete session

**Goal:** Update idea/session state only after approval.

**Scope:** On successful acceptance, promote `activeDraftPlanArtifact` to `linkedPlanArtifact`, preserve previous plan refs, set session `completed`, and update idea lifecycle.

**Acceptance criteria:**

- Accepted plan becomes current linked plan.
- Active draft is cleared or marked accepted according to store design.
- Session status becomes completed.
- Replanning lineage remains intact.

**Verification:** Unit test for first plan acceptance and replan acceptance.

**Dependencies:** WBS-5.1, WBS-3.2.

**Sizing:** one medium session.

## WBS-6 — Dashboard Lifecycle UI

### WBS-6.1 — Implement derived idea planning lifecycle helper

**Goal:** Prevent contradictory dashboard actions.

**Scope:** Add a pure helper that derives UI state from idea, session, current draft/linked plan, review, and finalize result.

**Acceptance criteria:**

- Helper returns one lifecycle state at a time.
- Impossible action combos are prevented.
- Tests cover open, planning, draft_ready, needs_revision, approval_ready, accepted, finalized, superseded.

**Verification:** Unit tests for state matrix.

**Dependencies:** WBS-1.4, WBS-4.3, WBS-5.2.

**Sizing:** one medium session.

### WBS-6.2 — Render Ideas row actions from derived lifecycle state

**Goal:** Make the row action model obvious and correct.

**Scope:** Use derived helper to show Plan this, Resume planning, Review, Accept, Finalize, View tasks, or View plan.

**Acceptance criteria:**

- Open ideas show Plan this.
- Active sessions show Resume planning.
- Blocked reviews disable Accept.
- Accepted plans show Finalize.
- Finalized plans show View tasks.

**Verification:** Dashboard tests for each state.

**Dependencies:** WBS-6.1.

**Sizing:** one medium session.

### WBS-6.3 — Render current plan card and review summary

**Goal:** Let the operator inspect plan status without reopening chat.

**Scope:** Add card showing plan title, planRef, version, status, WBS count, blocker count, warning count, open question count, and phase recommendation.

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

### WBS-7.1 — Implement WBS-to-task draft normalization

**Goal:** Convert WBS rows into task-engine-compatible drafts.

**Scope:** Map WBS title, body, acceptance criteria, verification, phase, desired status, dependencies, and metadata into draft payloads.

**Acceptance criteria:**

- Each selected WBS row produces one task draft or an explicit grouped draft according to plan data.
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
- Dependency on unselected row blocks or requires explicit deferral.
- Invalid dependency is reported clearly.

**Verification:** Unit tests for internal dependency, unselected dependency, invalid dependency.

**Dependencies:** WBS-7.1.

**Sizing:** one medium session.

### WBS-7.3 — Integrate task draft review into finalize dry-run

**Goal:** Reuse existing task draft validation before task persistence.

**Scope:** Make finalize dry-run run task draft review and return preview plus review findings.

**Acceptance criteria:**

- Dry-run does not mutate tasks.
- Failing task draft review blocks persistence.
- Warning-only review can proceed after confirmation.

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

## WBS-8 — Legacy Cleanup and Migration

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

### WBS-8.3 — Add legacy planning import to PlanArtifact draft

**Goal:** Keep old planning artifacts useful.

**Scope:** Implement or document conversion from legacy `build-plan`/wishlist output into PlanArtifact draft with provenance.

**Acceptance criteria:**

- Legacy output can become draft PlanArtifact.
- Provenance records import source.
- Imported plan can be reviewed and accepted like any other draft.

**Verification:** Unit test for import conversion or documentation example if implementation is deferred.

**Dependencies:** WBS-3.1, WBS-4.1.

**Sizing:** one medium session.

## WBS-9 — Reliability and Error Handling

### WBS-9.1 — Add lifecycle invariant tests

**Goal:** Catch contradictory planning states early.

**Scope:** Add tests for impossible states and action combinations.

**Acceptance criteria:**

- Idea cannot show Plan this and Resume planning simultaneously.
- Review-blocked plan cannot show Accept.
- Accepted plan cannot have mutable WBS for same version.
- Finalized plan cannot reopen as draft in place.
- Finalized task provenance resolves to existing WBS id.

**Verification:** Unit tests for lifecycle invariants.

**Dependencies:** WBS-6.1, WBS-7.4.

**Sizing:** one medium session.

### WBS-9.2 — Add stale generation and retry handling for planning mutations

**Goal:** Avoid silent overwrites and confusing failures.

**Scope:** Apply generation handling to Plan this, session updates, draft persistence, acceptance, and finalize persistence.

**Acceptance criteria:**

- Stale generation retries once.
- Repeated mismatch returns clear error.
- No silent overwrites occur.

**Verification:** Unit tests for stale generation on Plan this and accept/finalize if harness supports it.

**Dependencies:** WBS-1.3, WBS-5.1, WBS-7.4.

**Sizing:** one medium session.

### WBS-9.3 — Add actionable error messages for blocked transitions

**Goal:** Make failure states repairable by the operator.

**Scope:** Normalize user-facing errors for missing idea, duplicate session, blocked acceptance, unaccepted finalize, invalid WBS dependency, and duplicate finalize.

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
- Audit metadata does not leak raw prompt content unless intentionally stored.

**Verification:** Unit/E2E test for metadata after golden path.

**Dependencies:** WBS-3.3, WBS-4.3, WBS-5.2, WBS-7.4.

**Sizing:** one medium session.

# Recommended Execution Order

Use this order to avoid integration churn:

1. WBS-0.1
2. WBS-1.1
3. WBS-2.1
4. WBS-1.2
5. WBS-1.3
6. WBS-1.4
7. WBS-2.2
8. WBS-2.3
9. WBS-3.1
10. WBS-3.2
11. WBS-3.3
12. WBS-4.1
13. WBS-4.2
14. WBS-4.3
15. WBS-5.1
16. WBS-5.2
17. WBS-6.1
18. WBS-6.2
19. WBS-6.3
20. WBS-6.4
21. WBS-7.1
22. WBS-7.2
23. WBS-7.3
24. WBS-7.4
25. WBS-7.5
26. WBS-8.1
27. WBS-8.2
28. WBS-8.3
29. WBS-9.1
30. WBS-9.2
31. WBS-9.3
32. WBS-9.4

# Tasks That Were Intentionally Split

The earlier plan had several tasks that were too large for one middle-tier coding session. These are now split:

| Original Broad Area | Split Into |
|---|---|
| Make Plan this correct and idempotent | WBS-1.1, WBS-1.2, WBS-1.3, WBS-1.4 |
| Make planner chat produce complete plan | WBS-2.1, WBS-2.2, WBS-2.3, WBS-3.1, WBS-3.3 |
| PlanArtifact and review hardening | WBS-3.1, WBS-3.2, WBS-3.4, WBS-4.1, WBS-4.2, WBS-4.3 |
| Dashboard lifecycle | WBS-6.1, WBS-6.2, WBS-6.3, WBS-6.4, WBS-7.5 |
| Finalize to Task Engine | WBS-7.1, WBS-7.2, WBS-7.3, WBS-7.4 |
| Reliability/error handling | WBS-9.1, WBS-9.2, WBS-9.3, WBS-9.4 |

# Tasks That Were Intentionally Combined

Some tiny actions should not be standalone tasks:

| Tiny Action | Combined Into |
|---|---|
| Rename one dashboard button | WBS-8.1 |
| Add one prompt sentence | WBS-2.1 |
| Add one review warning field | WBS-4.3 |
| Add one provenance metadata key | WBS-7.1 or WBS-7.4 |
| Add one dashboard assertion | WBS-6.2, WBS-6.3, or WBS-9.1 |

# Test Plan

## Unit Tests

Add or extend unit tests for:

- `buildPlannerChatPrompt` with idea-only input;
- prompt with linked accepted plan;
- prompt with active draft plan;
- prompt with previous plan artifacts;
- prompt with active session summary;
- no raw CLI command leakage;
- Plan this idempotency;
- PlanArtifact schema validation;
- source idea provenance validation;
- WBS row validation;
- profile-aware review blockers;
- review warning generation;
- accept gate behavior;
- derived dashboard lifecycle helper;
- WBS-to-task draft normalization;
- dependency resolution;
- finalize idempotency;
- lifecycle invariants.

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
- WBS preview renders;
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
→ mark session draft_ready
→ review PlanArtifact
→ mark session approval_ready
→ accept reviewed PlanArtifact
→ mark session completed
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
- invalid WBS dependency;
- duplicate finalize;
- replan accepted idea and preserve lineage.

# Definition of Done

The implementation is done when:

1. Clicking **Plan this** starts or resumes exactly one planning session for that idea.
2. The generated prompt contains idea context, plan lineage, provenance instructions, and the complete session target.
3. The Planning Agent can brainstorm naturally and knows the session is not complete until an accepted PlanArtifact with WBS exists.
4. Draft persistence links a structured PlanArtifact back to the idea as an active draft.
5. Replanning does not overwrite the current accepted plan before replacement acceptance.
6. Review identifies blockers and warnings with actionable messages.
7. The user explicitly accepts a reviewed plan version.
8. Acceptance promotes the active draft to the linked accepted plan and completes the session.
9. Finalize creates task drafts from accepted WBS rows only.
10. WBS dependencies resolve correctly into task dependencies.
11. Persisted tasks include plan and WBS provenance.
12. The dashboard clearly shows the idea’s state from raw idea through finalized tasks.
13. Legacy `build-plan` does not confuse the primary dashboard flow.
14. Tests cover happy path, blocked path, idempotency, lineage, lifecycle invariants, dependency resolution, and finalize provenance.

# Final Target System

```text
Idea = seed
Planner chat = discovery
PlanArtifact = approved design and WBS truth
Finalize = compile accepted WBS into tasks
Task Engine = execution truth
Dashboard = control surface
```

Anything that does not support that model should either be demoted, hidden, migrated, or removed.
