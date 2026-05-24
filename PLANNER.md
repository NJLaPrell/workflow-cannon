# Workflow Cannon Planner Direction

This document defines the desired future state for planning in Workflow Cannon and explains how that objective should be implemented from the current system state.

## Expectation Summary

In Workflow Cannon, a **plan** should mean a serious, durable artifact — not a loose chat summary, not only a wishlist item, and not merely a pile of tasks.

A proper plan artifact should include, as appropriate:

- goals and intended outcomes
- value assessment
- risk assessment
- technical impact
- user stories
- architecture notes
- testing strategy
- UI mockups or UI direction
- implementation tips
- explicit “what not to do” guidance
- assumptions, constraints, and open questions
- full work breakdown structure
- recommended work order
- recommended phase breakdown
- task-generation-ready payload details

Workflow Cannon should also provide a natural planning entry point:

> A user chats with an agent, brainstorms naturally, refines the idea, assesses value/risk/technical impact, and then explicitly approves the result. On approval, Workflow Cannon generates the formal plan artifact.

The planning experience should **not** primarily use hard-coded guided-question flows. Instead, CAE should guide the agent with a flexible set of questions, concerns, and lenses to consider while the conversation remains natural.

Desired planning flow:

```text
natural brainstorm
→ CAE-guided agent reasoning
→ user-approved plan artifact
→ WBS
→ recommended phases/tasks
→ task engine registration
```

## Direction Verdict

This is the right direction.

The current planning module already supports guided planning types, `build-plan`, wishlist artifact creation, and task draft output. That is useful infrastructure, but it is more command/interview shaped than product shaped.

The desired direction is stronger:

> The plan is the central design artifact, and tasks are generated from it — not the plan being incidental output from a guided command.

This turns Workflow Cannon from a task engine with planning helpers into a real AI-assisted delivery operating system.

## Current State

Workflow Cannon currently has several planning-related pieces:

- a `planning` module
- `build-plan`
- fixed planning workflow types such as `task-breakdown`, `sprint-phase`, `task-ordering`, `new-feature`, and `change`
- wishlist artifact creation
- wishlist-to-execution conversion
- planning session snapshots
- task draft preview
- task batch persistence via `persist-planning-execution-drafts`
- task draft review via `review-planning-execution-drafts`
- task-engine persistence as the execution source of truth
- Dashboard surfaces for workflow visibility

These pieces are useful, but the system does not yet have a single first-class **Plan Artifact** that represents approved design intent and drives downstream task creation.

## Best Implementation Approach

### 1. Keep Task Engine As The Execution Source Of Truth

Task Engine should remain the authority for:

- execution tasks
- task lifecycle
- dependencies
- `phase`
- `phaseKey`
- execution status
- task evidence
- persisted task metadata

The plan artifact should not replace Task Engine.

Instead:

```text
Plan Artifact = design/source artifact
Task Engine = execution/source artifact
Dashboard = human operating surface
CAE = agent guidance/advisory layer
```

The plan artifact becomes the design source of truth that Task Engine work is generated from.

### 2. Introduce A First-Class Plan Artifact Schema

The central missing piece is a durable, versioned plan artifact.

Create:

```text
PlanArtifact v1
```

The artifact should include, at minimum:

```text
identity
goals
non-goals
user stories
value assessment
risk assessment
technical impact
architecture
UI/UX direction
testing strategy
implementation guidance
what not to do
assumptions
open questions
approval record
WBS
phase recommendations
task-generation payloads
trace/provenance
```

The artifact should be structured data first. Markdown can be generated from it, but markdown should not be the only source of truth.

The plan artifact should be:

- inspectable by agents
- renderable in the Dashboard
- reviewable by users
- versioned
- usable by commands that open tasks
- linked to generated Task Engine rows

### 3. Replace Hard-Coded Planning Questions With CAE Planning Guidance

Hard-coded guided questioning creates a rigid wizard experience. It may work for simple flows, but it becomes frustrating for serious design work.

CAE should provide advisory activation bundles for planning sessions.

Useful CAE planning bundles may include:

- planning completeness questions
- architecture concerns
- risk lenses
- testing prompts
- UI/UX considerations
- decomposition rules
- implementation anti-patterns
- task sizing expectations
- release/rollback concerns

The agent should use these naturally during the conversation rather than marching through a fixed questionnaire.

Instead of this experience:

```text
Question 1:
Question 2:
Question 3:
```

The agent should receive an active planning guidance bundle such as:

```text
During this session, consider:
- What user outcome is being created?
- What existing systems are touched?
- What would make this risky?
- What must be tested?
- What should not be done?
- What tasks would be too large for one agent session?
```

This is a better fit for CAE and for serious planning.

### 4. Add A Brainstorm-To-Plan Command Boundary

The brainstorm itself should remain chat-native.

The transition from conversation to artifact should be deterministic.

Recommended command progression:

```bash
wk run draft-plan-artifact '<json>'
wk run review-plan-artifact '<json>'
wk run accept-plan-artifact '<json>'
wk run finalize-plan-to-phase '<json>'
```

The agent can draft the plan content, but code should validate:

- artifact shape
- required sections
- approval state
- WBS quality
- task-generation readiness
- plan-to-task provenance

### 5. Make The WBS Part Of The Plan Artifact

The WBS should not be a separate afterthought.

A good WBS item should include:

- WBS id/path
- title
- goal/objective mapping
- suggested task title
- implementation approach
- technical scope
- acceptance criteria
- testing/verification
- dependencies
- recommended phase
- recommended order
- sizing confidence
- risk notes
- “done means” statement
- generated task payload

Then `finalize-plan-to-phase` can take the accepted plan artifact and create tasks using the existing task persistence machinery.

Existing `persist-planning-execution-drafts` behavior is already close to this target because it can materialize multiple execution tasks in one transaction and supports target phase, phase key, desired status, plan references, planning type, and idempotency.

## Current-State Gaps

### Gap 1 — No First-Class Plan Artifact

Right now there are planning sessions, wishlist artifacts, task drafts, and docs.

There is not yet one canonical artifact that means:

> This is the approved plan.

This is the biggest gap.

### Gap 2 — Planning Is Split Across Multiple Concepts

Current planning is spread across:

- `build-plan`
- wishlist intake
- `convert-wishlist`
- planning session file
- task-engine persistence
- roadmap/status docs
- playbooks
- draft review commands

These are individually useful, but they do not yet create one coherent planning source of truth.

### Gap 3 — Current Guided Planning Is Too Hard-Coded

The planning module has fixed planning types and critical-question behavior.

That is useful infrastructure, but the desired experience is more natural and CAE-guided.

The hard-coded interview flow should become secondary.

### Gap 4 — User Approval Is Not Yet A Formal Plan Acceptance Artifact

The future state needs explicit acceptance.

Example acceptance record:

```json
{
  "acceptedBy": "user",
  "confirmed": true,
  "acceptedAt": "...",
  "rationale": "...",
  "planVersion": "..."
}
```

Without this, agents can too easily turn a half-baked conversation into tasks.

### Gap 5 — WBS Completeness Is Not Fully Modeled

Current draft review can catch some task-quality issues, but it does not yet prove:

- all goals are covered
- user stories map to tasks
- architecture work is represented
- tests are represented
- UI work is represented
- rollout/docs/migration work is represented
- nothing important was skipped

### Gap 6 — Phase Recommendation Is Not Yet Part Of A Plan Artifact Lifecycle

Tasks already have `phase` and `phaseKey`, and batch persistence supports target phase fields.

But there is not yet a formal plan artifact that recommends phases, work order, and task grouping as part of the plan lifecycle.

### Gap 7 — Dashboard Does Not Yet Own The Plan Lifecycle Surface

The Dashboard should eventually show:

- current plan draft
- unanswered concerns
- plan completeness
- WBS preview
- task sizing findings
- user approval status
- opened phase/tasks

Right now that future Dashboard workflow is not the center of the planning model.

## Value Added To Workflow Cannon

### 1. Workflow Cannon Becomes A Planning-To-Execution System

The product becomes more than:

```text
tasks + policies + docs
```

It becomes:

```text
idea → plan → WBS → phase → tasks → execution → evidence
```

That is a much stronger product story.

### 2. Agent Work Becomes More Reliable

Agents are much better when they have a durable plan artifact with:

- architecture
- testing strategy
- anti-patterns
- task boundaries
- implementation tips
- explicit constraints

This reduces context loss and execution drift.

### 3. Task Quality Improves

A WBS-driven task system will create better tasks than ad hoc agent task creation.

Expected improvements:

- clearer acceptance criteria
- better dependency order
- better one-session sizing
- stronger verification strategy
- less missing supporting work

### 4. The Dashboard Gets A Flagship Workflow

The Dashboard UI Plugin becomes the place where a user can watch an idea mature into executable work.

That is far more compelling than a dashboard that only displays queue state.

### 5. Source-Of-Truth Boundaries Become Clearer

A formal plan artifact resolves the current messiness:

```text
Plan artifact = why/what/how
Task engine = execution state
Dashboard = operating surface
Docs = rendered views
```

### 6. Multi-Agent Delivery Gets A Better Substrate

A full WBS with implementation guidance and “what not to do” is exactly what advanced agents need to complete isolated tasks without constantly re-asking the user.

## Risks Introduced

### 1. Over-Planning Risk

If the plan artifact becomes too heavy, users will avoid it.

Mitigation:

- make sections conditional
- support small plans and large plans
- do not require UI mockups for non-UI work
- do not require architecture diagrams for tiny changes

### 2. False Confidence

A beautiful plan artifact can still be wrong.

Mitigation:

- include assumptions
- include unresolved questions
- include confidence levels
- include risk sections
- treat the plan as approved direction, not infallible truth

### 3. CAE Guidance May Become Vague

If CAE only gives broad “consider value and risk” guidance, agents may produce inconsistent plans.

Mitigation:

- CAE should activate structured planning lenses
- CAE should not force a rigid questionnaire
- plan artifact validation should enforce minimum artifact quality

### 4. Artifact Drift

The plan can drift from tasks as work changes.

Mitigation:

- generated tasks should link back to plan objectives and WBS paths
- Dashboard should show drift
- changes to task scope should preserve plan provenance
- future commands can detect task/plan divergence

### 5. Scope Explosion

Trying to support every possible plan type at once will slow 1.0.

Mitigation:

- start with one PlanArtifact v1 that supports feature/change work well
- add specializations later
- keep optional sections optional

### 6. Agent-Generated WBS Quality

Agents may generate tasks that are too large, vague, or missing test coverage.

Mitigation:

- deterministic WBS review must be mandatory before opening phase tasks
- review should catch oversized work, weak acceptance criteria, missing tests, missing rollback/fallback work, dependency issues, and uncovered objectives

## Is It Worth It?

Yes — if the architecture stays disciplined.

This is not a side feature. It should become one of Workflow Cannon’s core product loops.

Correct direction:

```text
Natural chat for discovery.
CAE for adaptive guidance.
Plan artifact for durable design truth.
Deterministic commands for validation and persistence.
Task Engine for execution truth.
Dashboard for human control.
```

Wrong direction:

```text
Hard-coded wizard questions.
Agent writes a markdown plan.
Agent manually creates tasks.
Dashboard displays whatever happened.
```

The expectation is worth pursuing because it makes Workflow Cannon substantially more valuable and more defensible.

The key is to avoid turning the plan artifact into bloated document ceremony. It should be structured enough to drive execution, but flexible enough to feel natural.

## Best Implementation Path

### Step 1 — Define `PlanArtifact v1`

Do this before more command work.

Without a plan artifact schema, the system will keep orbiting around `build-plan`, wishlist, and task drafts without a central artifact.

### Step 2 — Add CAE Planning Guidance Bundles

Create CAE activations for planning sessions:

- feature planning
- change/refactor planning
- UI planning
- risk review
- test strategy
- task decomposition
- WBS sizing
- implementation anti-patterns

These guide the brainstorm naturally.

### Step 3 — Add `draft-plan-artifact`

This command accepts agent-produced structured content and validates it into `PlanArtifact v1`.

### Step 4 — Add `review-plan-artifact`

This command checks for:

- missing sections
- unresolved risks
- weak stories
- missing testing strategy
- missing WBS
- incomplete technical impact
- missing assumptions/open questions
- missing implementation warnings

### Step 5 — Add `accept-plan-artifact`

This command records explicit user approval.

Acceptance should include:

- confirmation
- accepting actor
- timestamp
- rationale
- plan version
- plan artifact reference

### Step 6 — Add `finalize-plan-to-phase`

This command takes the accepted plan and WBS, validates task sizing/completeness, registers or chooses the phase, and persists tasks.

### Step 7 — Surface The Flow In The Dashboard

Once backend commands exist, make the Dashboard the primary human workflow.

The Dashboard should show:

- plan draft
- plan review findings
- approval state
- WBS preview
- phase recommendation
- task creation preview
- created phase/tasks

## Recommended Source-Of-Truth Hierarchy

Use this hierarchy:

```text
PlanArtifact v1
  = design intent, approved scope, WBS, task generation source

Task Engine persistence
  = execution truth, lifecycle, phase membership, dependencies, evidence

Dashboard UI Plugin
  = human operating surface

CAE
  = adaptive guidance and planning lenses

Docs / Markdown
  = rendered views, explanations, and handoff material
```

Do not make chat transcripts, roadmap prose, wishlist artifacts, or Dashboard state the authoritative plan.

## Planning Principle

Do not make the brainstorming session itself the artifact.

Instead:

> Make the brainstorming session produce a structured, reviewable, versioned Plan Artifact.

That distinction preserves the natural chat experience while giving Workflow Cannon the deterministic planning backbone it needs.

## Success Standard

This objective is complete when Workflow Cannon can reliably support this loop:

```text
User brainstorms naturally with an agent
→ CAE guides the agent through planning concerns
→ Agent drafts a structured PlanArtifact v1
→ Workflow Cannon reviews the artifact
→ User explicitly accepts the artifact
→ Workflow Cannon finalizes the accepted plan into phase-ready WBS tasks
→ Task Engine persists the execution work
→ Dashboard displays the plan, WBS, phase, tasks, status, and findings
```

At that point, Workflow Cannon has a coherent planning source of truth and a clear path from idea to execution.
