# Workflow Planning Future-State Implementation Plan

This plan defines the work breakdown structure for implementing the selected future-state planning workflow in Workflow Cannon.

## Selected Direction

Implement the future state in three coordinated phases:

1. **Phase A — Deterministic Backend Flow**
   - Add a single orchestration command that turns an accepted plan into a new phase and a full set of execution tasks.
2. **Phase B — WBS Quality Rules**
   - Strengthen review and validation so generated work breakdown structures are complete, appropriately sized, and safe to persist.
3. **Phase C — Dashboard Plan Builder**
   - Surface the deterministic backend flow in the Dashboard UI Plugin as the primary human workflow.

The backend command comes first. The Dashboard must call the workflow; it must not become the owner of planning logic.

## Product Goal

A user should be able to brainstorm a plan with an agent, approve the completed plan, and then have Workflow Cannon deterministically produce and persist a phase-ready work breakdown structure.

Future-state flow:

```text
brainstorm in chat
→ build/review plan
→ user accepts plan
→ agent creates full WBS
→ Workflow Cannon validates WBS
→ Workflow Cannon registers a new phase
→ Workflow Cannon opens all WBS items as tasks
→ Dashboard shows the new phase and task queue
```

## Core Command Target

Create a deterministic command:

```bash
wk run finalize-plan-to-phase '<json>'
```

The command should orchestrate the existing planning and task-engine machinery rather than replace it.

It should consume:

- a completed planning session, planning artifact, or explicit plan payload
- explicit user acceptance
- a proposed WBS/task draft payload
- optional phase label / phase key preferences
- expected planning generation when required
- policy approval when mutation rules require it

It should produce:

- a normalized phase proposal
- validated task drafts
- WBS completeness findings
- task-sizing findings
- created task ids when persisted
- new phase metadata
- next actions
- durable evidence

## Current Building Blocks To Reuse

Workflow Cannon already has these relevant pieces:

| Existing capability | Use in this plan |
| --- | --- |
| `build-plan` | Guided planning, plan artifact generation, multi-task draft preview |
| `review-planning-execution-drafts` | Dry-run review of draft execution tasks before persistence |
| `persist-planning-execution-drafts` | Transactional creation of multiple execution tasks for a target phase |
| `create-task` | Direct task creation path and validation model |
| `phaseKey` / `phase` fields | Existing task phase assignment mechanism |
| planning generation policy | Optimistic concurrency protection for planning/task mutations |
| Dashboard UI Plugin | Primary human surface after backend flow exists |

## Non-Goals

This plan does not initially require:

- replacing `build-plan`
- replacing wishlist intake
- creating a brand-new planning database model before the orchestration command exists
- making the Dashboard own planning state transitions
- fully automated AI-only WBS generation without user acceptance
- estimating calendar timelines or engineering days as authoritative commitments

## Phase A — Deterministic Backend Flow

### WBS-A1 — Define `finalize-plan-to-phase` command contract

**Goal:** Define the command input/output contract before implementation.

**Suggested task title:** Define finalize-plan-to-phase contract

**Type:** execution task

**Priority:** P1

**Dependencies:** none

**Technical scope:**

- Add command instruction document under the relevant module instructions path.
- Define request schema for `finalize-plan-to-phase`.
- Define response schema and response codes.
- Define dry-run and persist modes.
- Define user acceptance requirement.
- Define policy approval behavior.
- Define planning generation behavior.
- Define idempotency behavior.
- Define relationship to `build-plan`, `review-planning-execution-drafts`, and `persist-planning-execution-drafts`.

**Request shape draft:**

```json
{
  "planRef": "planning:new-feature:2026-...",
  "planningType": "new-feature",
  "acceptedPlan": {
    "confirmed": true,
    "acceptedBy": "operator",
    "rationale": "User approved the completed plan in chat"
  },
  "phase": {
    "mode": "new",
    "preferredPhaseKey": "77",
    "label": "Plan Builder Backend",
    "description": "Plan Builder Backend"
  },
  "wbs": {
    "summary": "Implement deterministic plan-to-phase workflow",
    "tasks": []
  },
  "desiredStatus": "ready",
  "dryRun": true,
  "expectedPlanningGeneration": 123,
  "clientMutationId": "finalize-plan-to-phase-example"
}
```

**Response shape draft:**

```json
{
  "ok": true,
  "code": "plan-phase-finalization-preview",
  "message": "Plan can be finalized into a new phase",
  "data": {
    "responseSchemaVersion": 1,
    "mode": "dry-run",
    "planRef": "...",
    "phaseProposal": {
      "phaseKey": "77",
      "label": "Plan Builder Backend",
      "description": "Plan Builder Backend"
    },
    "review": {
      "passed": true,
      "findings": []
    },
    "taskDrafts": [],
    "createdTasks": [],
    "nextActions": []
  }
}
```

**Acceptance criteria:**

- Contract document exists and is discoverable by agents.
- Contract names all required fields.
- Contract distinguishes dry-run from persistence.
- Contract defines all response codes.
- Contract specifies how existing commands are reused.
- Contract includes at least one preview example and one persist example.

---

### WBS-A2 — Implement phase proposal resolver

**Goal:** Add deterministic phase selection and short-description validation.

**Suggested task title:** Implement phase proposal resolver

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-A1

**Technical scope:**

- Add helper to resolve the target phase for a plan.
- Support explicit `preferredPhaseKey`.
- Support automatic next phase key selection.
- Reject collisions with existing active phase tasks unless explicitly allowed.
- Normalize `phase` and `phaseKey` values for task creation.
- Enforce short phase description rule: around five words max.
- Return structured findings instead of silently rewriting ambiguous input.

**Rules:**

- If user provides `preferredPhaseKey`, validate it is available or intentionally reusable.
- If not provided, use the smallest integer phase key greater than the current max active phase key.
- Generate default `phase` label as `Phase <phaseKey>` when no label is provided.
- `description` should be concise, ideally five words or fewer.
- If description exceeds the limit, return a warning or blocker depending on strictness mode.

**Acceptance criteria:**

- Resolver works without writing state.
- Resolver returns deterministic same input → same output.
- Resolver detects phase key collisions.
- Resolver validates short descriptions.
- Tests cover explicit phase, auto phase, collision, and long description cases.

---

### WBS-A3 — Implement WBS normalization

**Goal:** Normalize user/agent-generated WBS items into task-engine-compatible task drafts.

**Suggested task title:** Normalize WBS into task drafts

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-A1, WBS-A2

**Technical scope:**

- Accept WBS items from command input.
- Normalize each WBS item into the same row shape accepted by `persist-planning-execution-drafts`.
- Ensure required fields are present or reported as findings.
- Apply command-level `targetPhaseKey`, `targetPhase`, and `desiredStatus` defaults.
- Preserve plan provenance in task metadata.
- Preserve dependency relationships.
- Support idempotency keys per generated task.

**WBS item draft shape:**

```json
{
  "title": "Implement phase resolver",
  "summary": "Resolve target phase key and label for finalized plans.",
  "approach": "Add a pure resolver helper and command integration tests.",
  "technicalScope": [
    "Add phase resolver helper",
    "Check active phase collisions",
    "Validate short phase descriptions"
  ],
  "acceptanceCriteria": [
    "Resolver returns deterministic phase proposal",
    "Long descriptions produce structured findings",
    "Collision cases are tested"
  ],
  "dependsOn": [],
  "priority": "P1",
  "metadata": {
    "wbsPath": "A.2",
    "planRef": "planning:new-feature:..."
  }
}
```

**Acceptance criteria:**

- Normalizer creates task-engine-compatible drafts.
- Missing required fields return structured findings.
- Provenance is attached to each draft.
- Dependencies are preserved.
- Tests cover minimal valid row, full row, missing fields, and dependency mapping.

---

### WBS-A4 — Implement `finalize-plan-to-phase` dry-run path

**Goal:** Build the command in preview mode first.

**Suggested task title:** Implement finalize-plan preview path

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-A1, WBS-A2, WBS-A3

**Technical scope:**

- Register `finalize-plan-to-phase` in the appropriate module.
- Implement `dryRun:true` path.
- Validate accepted plan object.
- Resolve phase proposal.
- Normalize WBS into task drafts.
- Call or reuse review logic equivalent to `review-planning-execution-drafts`.
- Return pass/fail findings without writing task rows.
- Include suggested next invocation for persistence.

**Acceptance criteria:**

- Command returns preview result without mutating state.
- Missing user acceptance blocks finalization.
- Invalid WBS returns findings.
- Valid WBS returns normalized task drafts and phase proposal.
- Preview result includes next action guidance.

---

### WBS-A5 — Implement `finalize-plan-to-phase` persist path

**Goal:** Persist a validated WBS into a new phase as execution tasks.

**Suggested task title:** Implement finalize-plan persist path

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-A4

**Technical scope:**

- Implement `dryRun:false` path.
- Enforce planning generation policy.
- Enforce policy approval if the command is classified as sensitive.
- Reuse `persist-planning-execution-drafts` normalization and transactional behavior where possible.
- Persist all task rows in one transaction.
- Store plan provenance and phase metadata on tasks.
- Return created task ids and final phase proposal.
- Support idempotent replay with `clientMutationId`.

**Acceptance criteria:**

- Valid persist creates all tasks in one transaction.
- Partial task creation cannot occur on validation failure.
- Planning generation mismatch fails safely.
- Idempotent replay works for identical payloads.
- Reusing idempotency key with different payload fails.
- Response includes created task ids and next actions.

---

### WBS-A6 — Add command docs, schema, and CLI map entries

**Goal:** Make the new command discoverable and safe for agents.

**Suggested task title:** Document finalize-plan-to-phase usage

**Type:** execution task

**Priority:** P2

**Dependencies:** WBS-A4, WBS-A5

**Technical scope:**

- Add instruction file examples.
- Add schema-only behavior if applicable.
- Add command to CLI map/snippets.
- Add response code documentation.
- Add policy approval examples.
- Add planning generation examples.
- Add dry-run-first agent guidance.

**Acceptance criteria:**

- Agents can discover command shape via instruction docs or schema-only.
- Docs include dry-run and persist examples.
- Docs specify approval and concurrency behavior.
- No docs instruct agents to hand-edit task stores.

---

## Phase B — WBS Quality Rules

### WBS-B1 — Define WBS quality rubric

**Goal:** Define what makes a generated WBS complete and task-ready.

**Suggested task title:** Define WBS quality rubric

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-A1

**Technical scope:**

- Define task sizing rules for advanced-agent single-session work.
- Define completeness rules for implementation coverage.
- Define verification/test coverage expectations.
- Define documentation/update coverage expectations.
- Define rollback/fallback coverage expectations where relevant.
- Define dependency clarity expectations.
- Define acceptance criteria quality rules.

**Sizing rule draft:**

A task is appropriately sized when an advanced coding agent can complete it in one focused session without needing major additional planning. It should have:

- one primary implementation outcome
- clear files/modules likely to be touched, or a bounded discovery scope
- concrete acceptance criteria
- explicit verification expectations
- no hidden cross-cutting release work unless that is the task's whole purpose

**Acceptance criteria:**

- Rubric is documented.
- Rubric distinguishes blockers from warnings.
- Rubric can be translated into deterministic checks.
- Rubric references existing review command behavior where possible.

---

### WBS-B2 — Strengthen planning draft review profiles

**Goal:** Expand review logic so WBS drafts are checked against the new quality rubric.

**Suggested task title:** Strengthen WBS review checks

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-B1

**Technical scope:**

- Extend or add review profile for plan-to-phase WBS drafts.
- Detect oversized tasks.
- Detect vague acceptance criteria.
- Detect missing verification/test coverage.
- Detect missing docs/dashboard/update work where relevant.
- Detect missing rollback/fallback work where relevant.
- Detect dependency cycles or dangling dependencies.
- Detect duplicate or overlapping tasks.

**Acceptance criteria:**

- Review command returns structured findings.
- Findings include severity and remediation hints.
- Oversized task examples are caught in tests.
- Missing verification examples are caught in tests.
- Dependency cycle examples are caught in tests.
- Valid WBS passes without blockers.

---

### WBS-B3 — Add WBS completeness checks

**Goal:** Verify that a WBS appears to implement the approved plan fully.

**Suggested task title:** Add WBS completeness checks

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-B1, WBS-B2

**Technical scope:**

- Compare plan goals/outcomes to WBS task coverage.
- Require each major plan objective to map to one or more WBS tasks.
- Require each WBS task to map back to a plan objective.
- Flag uncovered objectives.
- Flag orphan tasks.
- Support explicit user waiver for intentional omissions.

**Coverage map draft:**

```json
{
  "objectives": [
    {
      "id": "OBJ-1",
      "summary": "Create finalize-plan command",
      "coveredBy": ["WBS-A1", "WBS-A4", "WBS-A5"]
    }
  ],
  "uncoveredObjectives": [],
  "orphanTasks": []
}
```

**Acceptance criteria:**

- Coverage map is returned in preview output.
- Uncovered objectives block persistence unless waived.
- Orphan tasks produce findings.
- Tests cover complete, incomplete, and waived coverage cases.

---

### WBS-B4 — Add plan acceptance artifact

**Goal:** Make user approval of a plan explicit and inspectable.

**Suggested task title:** Add plan acceptance artifact

**Type:** execution task

**Priority:** P2

**Dependencies:** WBS-A4

**Technical scope:**

- Define accepted plan structure.
- Require `acceptedPlan.confirmed === true` before persistence.
- Capture accepted by, timestamp, rationale, and plan summary.
- Attach acceptance provenance to created tasks.
- Return acceptance evidence in command output.

**Acceptance criteria:**

- Persistence is blocked without explicit plan acceptance.
- Acceptance provenance appears in created task metadata.
- Dry-run can show missing acceptance as a blocker.
- Tests cover missing, invalid, and valid acceptance.

---

## Phase C — Dashboard Plan Builder

### WBS-C1 — Define Dashboard Plan Builder UX contract

**Goal:** Define the Dashboard workflow that will call the backend command.

**Suggested task title:** Define Dashboard Plan Builder contract

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-A4

**Technical scope:**

- Define UI states for plan creation.
- Define UI states for plan review.
- Define UI states for WBS preview.
- Define UI states for findings/remediation.
- Define UI approval action for opening the phase.
- Define dashboard command calls.
- Define error/remediation display contract.

**Dashboard flow:**

```text
New Plan
→ Brainstorm / collect answers
→ Review Plan
→ Generate or paste WBS
→ Preview Phase Tasks
→ Fix Findings
→ Approve Open Phase
→ Created Phase Tasks
```

**Acceptance criteria:**

- UX contract names all UI states.
- UX contract maps each state to backend command calls.
- UX contract does not put planning logic in the Dashboard.
- UX contract includes failure states.

---

### WBS-C2 — Add Dashboard backend integration for plan preview

**Goal:** Let the Dashboard call preview mode and render findings.

**Suggested task title:** Add Dashboard plan preview integration

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-C1, WBS-A4, WBS-B2

**Technical scope:**

- Add Dashboard action to call `finalize-plan-to-phase` with `dryRun:true`.
- Render phase proposal.
- Render task draft list.
- Render WBS findings.
- Render coverage findings.
- Render next action guidance.

**Acceptance criteria:**

- Dashboard preview works against a consumer workspace.
- Findings are visible and actionable.
- No mutation occurs during preview.
- Tests cover preview rendering with pass and fail results.

---

### WBS-C3 — Add Dashboard approval and persist action

**Goal:** Let the user approve opening a phase from the Dashboard.

**Suggested task title:** Add Dashboard open phase action

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-C2, WBS-A5

**Technical scope:**

- Add explicit approval UI for phase creation.
- Call `finalize-plan-to-phase` with persistence enabled.
- Pass expected planning generation when required.
- Pass policy approval through the correct lane.
- Render created task ids and phase state.
- Refresh Dashboard task queue after success.

**Acceptance criteria:**

- Dashboard requires explicit user approval before persistence.
- Successful persist creates tasks and refreshes visible queue.
- Policy/planning generation failures display remediation.
- Duplicate submission is protected by idempotency.

---

### WBS-C4 — Add Dashboard Plan Builder tests

**Goal:** Validate the Dashboard Plan Builder against realistic command responses.

**Suggested task title:** Test Dashboard Plan Builder flow

**Type:** execution task

**Priority:** P2

**Dependencies:** WBS-C2, WBS-C3

**Technical scope:**

- Add renderer tests for preview success.
- Add renderer tests for preview blockers.
- Add tests for persist success.
- Add tests for policy denied.
- Add tests for planning generation mismatch.
- Add tests for stale/missing kit state.

**Acceptance criteria:**

- Dashboard tests cover all major Plan Builder states.
- Failure states include actionable remediation.
- Tests do not require Workflow Cannon repo-local state.

---

## Cross-Cutting Work

### WBS-X1 — Add tests and fixtures for full plan-to-phase flow

**Goal:** Add end-to-end confidence for the complete backend flow.

**Suggested task title:** Test full plan-to-phase flow

**Type:** execution task

**Priority:** P1

**Dependencies:** WBS-A5, WBS-B2, WBS-B3

**Technical scope:**

- Add fixture plan payload.
- Add fixture accepted plan artifact.
- Add valid WBS fixture.
- Add invalid WBS fixture.
- Add oversized task fixture.
- Add phase collision fixture.
- Add idempotency fixture.
- Test dry-run and persist paths.

**Acceptance criteria:**

- End-to-end dry-run test passes.
- End-to-end persist test creates expected tasks.
- Invalid WBS is blocked.
- Phase collision is blocked or warned according to policy.
- Idempotent replay is tested.

---

### WBS-X2 — Add docs and examples for agent-driven planning

**Goal:** Document the supported future-state workflow for agents and maintainers.

**Suggested task title:** Document plan-to-phase workflow

**Type:** execution task

**Priority:** P2

**Dependencies:** WBS-A6, WBS-B1

**Technical scope:**

- Add runbook for plan-to-phase flow.
- Add agent-safe command examples.
- Add Dashboard user-facing flow docs.
- Add WBS quality examples.
- Add guidance on when to use wishlist vs direct plan-to-phase.
- Add guidance on dry-run-first behavior.

**Acceptance criteria:**

- Docs explain current recommended flow.
- Docs distinguish brainstorm/AI work from deterministic persistence.
- Docs include task payload examples.
- Docs do not instruct hand-editing task stores.

---

### WBS-X3 — Add release/readiness gate for planning future state

**Goal:** Make this workflow part of release confidence once implemented.

**Suggested task title:** Add plan-to-phase release gate

**Type:** execution task

**Priority:** P2

**Dependencies:** WBS-X1

**Technical scope:**

- Add CI or maintainer gate for plan-to-phase fixtures.
- Add command to release evidence bundle once available.
- Add package/consumer install validation for the command.
- Add Dashboard compatibility validation when Plan Builder lands.

**Acceptance criteria:**

- CI catches regressions in plan-to-phase flow.
- Release evidence includes plan-to-phase validation.
- Consumer install validation proves command works outside source repo.

---

## Suggested Task Creation Payloads

The following task payloads are intentionally ready to convert into task-engine rows. Allocate real task ids at creation time.

```json
[
  {
    "title": "Define finalize-plan-to-phase contract",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "approach": "Specify the command contract before implementation so the backend, agents, and Dashboard share the same shape.",
    "technicalScope": [
      "Create command instruction document",
      "Define request and response shapes",
      "Define dry-run and persist modes",
      "Define response codes",
      "Define policy, planning generation, and idempotency behavior"
    ],
    "acceptanceCriteria": [
      "Contract document exists and is discoverable",
      "Contract includes preview and persist examples",
      "Contract specifies how existing planning/task commands are reused",
      "Contract defines required user acceptance behavior"
    ]
  },
  {
    "title": "Implement phase proposal resolver",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Define finalize-plan-to-phase contract"],
    "approach": "Create a pure resolver for phase key, phase label, collision detection, and short description validation.",
    "technicalScope": [
      "Resolve explicit preferred phase key",
      "Resolve automatic next phase key",
      "Detect active phase collisions",
      "Normalize phase and phaseKey for task creation",
      "Validate short phase descriptions"
    ],
    "acceptanceCriteria": [
      "Resolver returns deterministic output",
      "Explicit and automatic phase selection are tested",
      "Phase collisions are detected",
      "Long descriptions return structured findings"
    ]
  },
  {
    "title": "Normalize WBS into task drafts",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Define finalize-plan-to-phase contract", "Implement phase proposal resolver"],
    "approach": "Translate WBS items into persist-planning-execution-drafts-compatible task rows with provenance and dependency mapping.",
    "technicalScope": [
      "Accept WBS input payload",
      "Normalize WBS items to task drafts",
      "Apply target phase and desired status defaults",
      "Attach plan provenance metadata",
      "Preserve dependencies"
    ],
    "acceptanceCriteria": [
      "Valid WBS items become task-engine-compatible drafts",
      "Missing required fields return structured findings",
      "Plan provenance is attached to each draft",
      "Dependency mapping is preserved and tested"
    ]
  },
  {
    "title": "Implement finalize-plan preview path",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Normalize WBS into task drafts"],
    "approach": "Register finalize-plan-to-phase and implement dry-run preview that validates acceptance, phase proposal, WBS normalization, and review findings without mutation.",
    "technicalScope": [
      "Register command",
      "Validate accepted plan object",
      "Resolve phase proposal",
      "Normalize WBS",
      "Run draft review logic",
      "Return preview response"
    ],
    "acceptanceCriteria": [
      "Dry-run does not mutate state",
      "Missing user acceptance blocks finalization",
      "Invalid WBS returns findings",
      "Valid WBS returns phase proposal and task drafts"
    ]
  },
  {
    "title": "Implement finalize-plan persist path",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Implement finalize-plan preview path"],
    "approach": "Persist validated plan WBS tasks transactionally using existing planning execution draft persistence behavior where possible.",
    "technicalScope": [
      "Implement non-dry-run path",
      "Enforce planning generation policy",
      "Enforce policy approval when sensitive",
      "Persist all task rows transactionally",
      "Attach plan and acceptance provenance",
      "Support idempotent replay"
    ],
    "acceptanceCriteria": [
      "Valid persist creates all tasks in one transaction",
      "Validation failure creates no partial task rows",
      "Planning generation mismatch fails safely",
      "Idempotent replay works for identical payloads",
      "Response includes created task ids"
    ]
  },
  {
    "title": "Define WBS quality rubric",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "approach": "Define the quality standard for complete, right-sized, advanced-agent-ready WBS tasks.",
    "technicalScope": [
      "Define sizing rules",
      "Define completeness rules",
      "Define verification expectations",
      "Define dependency clarity expectations",
      "Define acceptance criteria quality rules"
    ],
    "acceptanceCriteria": [
      "Rubric is documented",
      "Rubric separates blockers from warnings",
      "Rubric can be translated into deterministic checks",
      "Rubric includes examples of valid and invalid tasks"
    ]
  },
  {
    "title": "Strengthen WBS review checks",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Define WBS quality rubric"],
    "approach": "Extend draft review to detect WBS issues that would make agent execution unreliable or incomplete.",
    "technicalScope": [
      "Detect oversized tasks",
      "Detect vague acceptance criteria",
      "Detect missing verification coverage",
      "Detect dependency cycles",
      "Detect duplicate or overlapping tasks"
    ],
    "acceptanceCriteria": [
      "Review returns structured findings with severity",
      "Oversized tasks are caught in tests",
      "Missing verification is caught in tests",
      "Dependency cycles are caught in tests",
      "Valid WBS passes without blockers"
    ]
  },
  {
    "title": "Add WBS completeness checks",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Strengthen WBS review checks"],
    "approach": "Map plan objectives to WBS tasks and block persistence when approved plan objectives are not represented.",
    "technicalScope": [
      "Create coverage map shape",
      "Map objectives to WBS tasks",
      "Detect uncovered objectives",
      "Detect orphan tasks",
      "Support explicit omission waivers"
    ],
    "acceptanceCriteria": [
      "Coverage map is returned in preview output",
      "Uncovered objectives block persistence unless waived",
      "Orphan tasks produce findings",
      "Complete, incomplete, and waived cases are tested"
    ]
  },
  {
    "title": "Define Dashboard Plan Builder contract",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Implement finalize-plan preview path"],
    "approach": "Specify the Dashboard Plan Builder UX states and backend command calls before implementation.",
    "technicalScope": [
      "Define plan creation UI states",
      "Define WBS preview UI states",
      "Define findings and remediation UI states",
      "Define approval action",
      "Map UI states to backend commands"
    ],
    "acceptanceCriteria": [
      "UX contract names all major states",
      "Each state maps to backend command calls",
      "Planning logic remains in backend commands",
      "Failure states are included"
    ]
  },
  {
    "title": "Add Dashboard plan preview integration",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Define Dashboard Plan Builder contract", "Strengthen WBS review checks"],
    "approach": "Let the Dashboard call finalize-plan-to-phase in dry-run mode and render phase proposal, task drafts, and findings.",
    "technicalScope": [
      "Add preview action",
      "Render phase proposal",
      "Render task drafts",
      "Render WBS findings",
      "Render next actions"
    ],
    "acceptanceCriteria": [
      "Dashboard preview works against consumer workspace state",
      "Preview does not mutate state",
      "Findings are visible and actionable",
      "Preview rendering tests cover pass and fail results"
    ]
  },
  {
    "title": "Add Dashboard open phase action",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Add Dashboard plan preview integration", "Implement finalize-plan persist path"],
    "approach": "Add explicit Dashboard approval and persistence flow for opening a new phase from a validated WBS.",
    "technicalScope": [
      "Add approval UI",
      "Call persist path",
      "Pass planning generation token",
      "Pass policy approval correctly",
      "Render created task ids",
      "Refresh task queue"
    ],
    "acceptanceCriteria": [
      "Dashboard requires explicit approval before persistence",
      "Successful persist creates tasks and refreshes queue",
      "Policy and planning-generation failures show remediation",
      "Duplicate submission is protected by idempotency"
    ]
  },
  {
    "title": "Test full plan-to-phase flow",
    "phase": "Phase TBD",
    "phaseKey": "TBD",
    "priority": "P1",
    "type": "task",
    "dependsOn": ["Implement finalize-plan persist path", "Add WBS completeness checks"],
    "approach": "Add end-to-end fixtures and tests for dry-run, persist, invalid WBS, phase collision, and idempotency.",
    "technicalScope": [
      "Add fixture plan payload",
      "Add accepted plan fixture",
      "Add valid and invalid WBS fixtures",
      "Add oversized task fixture",
      "Add phase collision fixture",
      "Test dry-run and persist paths"
    ],
    "acceptanceCriteria": [
      "Dry-run fixture passes",
      "Persist fixture creates expected tasks",
      "Invalid WBS is blocked",
      "Phase collision is handled",
      "Idempotent replay is tested"
    ]
  }
]
```

## Recommended Initial Phase Description

When this plan is converted into execution tasks, use a short phase description such as:

```text
Plan Builder Backend
```

This is five words or fewer and accurately describes the first implementation slice.

## Recommended Implementation Order

1. WBS-A1 — Define command contract
2. WBS-A2 — Implement phase proposal resolver
3. WBS-A3 — Normalize WBS into task drafts
4. WBS-A4 — Implement dry-run preview path
5. WBS-A5 — Implement persist path
6. WBS-B1 — Define quality rubric
7. WBS-B2 — Strengthen review checks
8. WBS-B3 — Add completeness checks
9. WBS-X1 — Add full-flow tests
10. WBS-A6 / WBS-X2 — Documentation and command discoverability
11. WBS-C1 — Dashboard UX contract
12. WBS-C2 — Dashboard preview integration
13. WBS-C3 — Dashboard open phase action
14. WBS-C4 — Dashboard tests
15. WBS-X3 — Release/readiness gate

## Notes For Task Generation

When creating actual task-engine tasks from this plan:

- Allocate real `T###` ids at creation time.
- Use one new phase key for the initial backend slice.
- Prefer `status:"ready"` only after the task intake policy passes.
- Preserve dependencies using actual task ids, not titles.
- Include `metadata.planRef` pointing back to this file or a planning artifact.
- Include `metadata.wbsPath` for traceability.
- Keep each task scoped to one advanced-agent session.
- Use `review-planning-execution-drafts` before persisting the generated task batch.
- Use `persist-planning-execution-drafts` to create the final tasks transactionally.

## Success Standard

This plan is complete when Workflow Cannon can do the following deterministically:

> Given an accepted plan and a WBS, Workflow Cannon can validate the WBS, resolve a new phase, persist all right-sized execution tasks for that phase, and expose the resulting work in the Dashboard without relying on the agent to manually orchestrate task-store mutations.
