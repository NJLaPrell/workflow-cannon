# AGENT_CARD_PLAN.md — Dashboard Agent Activity Projection Plan

## Purpose

This document captures the product and implementation plan for improving the agent card at the top of the Workflow Cannon dashboard overview tab.

The purpose of the card is to help a human user immediately understand:

1. **Who is working?**
2. **What are they doing?**
3. **Which custom agents or subagents are active?**
4. **Is anything blocked, stale, or waiting on the human?**
5. **Can the user trust that the panel is near-real-time?**

The target is not merely a prettier single status card. The target is an **Agent Activity Board** powered by a stable dashboard projection that can absorb current and future task-engine, agent-session, assignment, subagent, and runtime-service changes.

---

## Core Architecture Decision

The Agent Activity Board must **not** render directly from current task-engine implementation details.

It must consume a stable projected dashboard view model:

```text
Current and future sources
  - live activity leases
  - derived agent status
  - task rows
  - team execution assignments
  - subagent registry sessions
  - task checkpoints
  - future AgentAssignment / AgentSession / AgentHandoff / ResourceLock data
  - future runtime service snapshots/events
        ↓
Agent Activity Projection Builder
        ↓
DashboardAgentActivitySummary
        ↓
Dashboard overview renderer
```

This projection boundary is mandatory because the task engine is actively evolving. The dashboard UI should not be rewritten every time task-engine phase, assignment, or agent-session state changes.

---

## Planner Alignment

This file is intentionally structured as a planner-ready artifact.

It includes:

- goals and intended outcomes
- value assessment
- risk assessment
- technical impact
- UI/UX direction
- implementation guidance
- what not to do
- assumptions and open questions
- required decision artifacts
- full work breakdown structure
- recommended work order
- recommended phase breakdown
- task-generation-ready payload hints

Do **not** materialize execution tasks from this plan until the Phase 0 decision artifacts are completed and approved.

---

# 1. Executive Summary

The dashboard overview currently exposes a high-level `agentStatus` field and already has supporting data for team assignments, subagent sessions, checkpoints, task state, phase, and live agent activity leases.

The highest-value immediate change remains:

```text
Expose and render current agent activity in the dashboard overview.
```

But the correct implementation is now:

```text
Build a stable Agent Activity Projection from current sources, then render the board from that projection only.
```

Today, the dashboard reads the first current activity lease and converts it into a single `agentStatus`. The underlying activity store already supports multiple active leases. That gives us a good v1 data source, but it should be treated as **one source feeding the projection**, not as the dashboard contract itself.

Target state:

```text
Dashboard Overview
  └── Agent Activity Board
        ├── Main Agent
        ├── Active Agents
        ├── Needs Attention
        ├── Recently Active / Stale, deferred unless cheap
        └── Activity freshness + task sync footer
```

The panel should show:

- main agent status
- active custom agents
- subagent sessions
- current task and task title
- phase
- command/current step
- PR/version/branch/worktree when known
- heartbeat freshness
- live vs inferred source
- blocked / awaiting approval / human-gate states
- compact summary counts

---

# 2. Current State

## 2.1 Current dashboard status model

The dashboard summary contract already exposes a single `agentStatus` summary with:

```ts
source: "derived" | "live_activity";
kind: DashboardAgentStatusKind;
label: string;
confidence: "high" | "medium" | "low";
updatedAt: string;
taskId?: string | null;
phaseKey?: string | null;
command?: string | null;
prNumber?: number | null;
version?: string | null;
detail?: string | null;
```

Supported kinds:

```text
unavailable
planning
blocked
working_task
delegating_task
ready_task
awaiting_instruction
reviewing_item
reviewing_pr
validating
releasing
awaiting_policy_approval
awaiting_human_gate
```

These should be mapped to clear UI chips.

## 2.2 Current derived status behavior

When no live activity is available, the dashboard derives status from:

- phase/system availability
- active planning session
- human gates
- blocking analysis
- in-progress tasks
- team execution
- subagent registry
- suggested next task

This is valuable, but it is inference. It should remain as fallback and be labeled as **Inferred**, not **Live**.

## 2.3 Current live activity behavior

The system already supports activity leases through `set-agent-activity`.

An activity lease can include:

```text
activityId
agentId
sessionId
kind
label
startedAt
updatedAt
expiresAt
taskId
command
phaseKey
prNumber
version
details
```

The activity store already supports listing current active leases ordered by freshness. The current dashboard build path only picks the first lease for `agentStatus`. That is the immediate limitation.

## 2.4 Current supporting dashboard data

### Team execution

```text
id
executionTaskId
executionTaskTitle
supervisorId
workerId
status
updatedAt
```

### Subagent registry

```text
definitionsCount
retiredDefinitionsCount
openSessionsCount
topOpenSessions[]:
  sessionId
  definitionId
  executionTaskId
  status
  updatedAt
```

### Task checkpoints

```text
id
taskId
label
refKind: head | stash
createdAt
gitHeadSha
```

### Agent guidance

```text
profileSetId
tier
displayLabel
usingDefaultTier
temperamentProfileId
temperamentLabel
agentPresentation
```

Agent guidance describes configured main-agent style/profile, not necessarily active work. Use it as secondary context only.

## 2.5 Expected future task-engine data

Future phased task-engine work is expected to add or change concepts such as:

```text
AgentAssignment
AgentSession
AgentHandoff
AgentResourceLock
PhaseDelivery
TaskStateProjection
RuntimeServiceSnapshot
Backend sync state
```

The Agent Activity Board should survive those changes by depending on a projection layer, not raw current tables.

---

# 3. Product Goals

## Goal 1 — Immediate human understanding

A user should be able to glance at the top of the dashboard and understand what agents are currently doing without opening logs, task details, or CLI commands.

## Goal 2 — Stable UI despite task-engine evolution

The dashboard UI should consume `DashboardAgentActivitySummary`, not raw task-engine tables, so future backend changes only require updating the projection builder.

## Goal 3 — Individual agent identity

The panel should identify each active agent or subagent using the best available data:

- custom display name
- agent id
- session id
- agent definition id
- subagent definition id
- role
- supervisor/worker relationship

## Goal 4 — Custom agent visibility

If a particular custom agent is run, the user should know which one. The projection should surface `agentDefinitionId`, `definitionId`, `customAgentName`, or `agentDisplayName` when available.

## Goal 5 — Near-real-time freshness

The panel should update near real time. For the first implementation, polling every 2–5 seconds is acceptable if it uses a lightweight projection/slice. Once the dashboard service/event stream exists, the panel should become event-driven.

## Goal 6 — Attention-first design

Blocked work, policy approvals, human gates, expired/stale leases, and validation failures should be visually prioritized above routine working states.

## Goal 7 — Derived fallback without deception

When no live activity exists, the card should still show useful inferred status, but it must be visibly labeled as inferred.

---

# 4. Non-Goals

- Do not build a full agent orchestration system in this card.
- Do not make dashboard state authoritative for task execution.
- Do not bypass task-engine lifecycle or policy rules.
- Do not require every agent to provide every metadata field.
- Do not expose raw JSON by default in the compact card.
- Do not make a visually beautiful but misleading panel.
- Do not hide stale or expired state as if it were current.
- Do not make the card dependent on Git sync freshness.
- Do not add a full-dashboard polling loop just to update agent activity.
- Do not implement actions like log viewing or handoff copying in v1 unless the data source already exists.
- Do not bind the UI directly to current activity-lease, team-execution, or subagent-registry table shapes.

---

# 5. Value Assessment

## User value

- The user immediately knows whether agents are working, idle, blocked, or waiting for input.
- Multi-agent work becomes observable instead of mysterious.
- Custom agents become identifiable by name/definition rather than appearing as vague background work.
- The user can intervene only when needed.

## Product value

- Makes the dashboard feel like a true operating console.
- Strengthens Workflow Cannon’s multi-agent story.
- Makes live activity leases more valuable.
- Creates a foundation for future agent assignments, handoffs, and resource locks.
- Creates a durable dashboard projection pattern for volatile backend state.

## Agent value

- Agents can communicate status through structured activity rather than freeform chat.
- Supervisors can see active workers.
- Review and validation agents can be surfaced distinctly.
- Stale work and missing heartbeats become visible.

---

# 6. Risk Assessment

## Risk 1 — Backend churn breaks the UI

Future task-engine work may change assignments, sessions, phases, or subagent state.

Mitigation:

- Add an Agent Activity Projection Builder.
- Keep the renderer dependent only on `DashboardAgentActivitySummary`.
- Treat current leases/team/subagent rows as projection inputs.

## Risk 2 — Activity data may be incomplete

Agents may not call `set-agent-activity`, or may omit useful details.

Mitigation:

- Keep derived fallback.
- Add docs and snippets showing agents how to set activity.
- Add automatic activity hooks at known command boundaries where possible.
- Make minimal activity useful: `agentId`, `kind`, `label`, `taskId`.

## Risk 3 — Panel could become noisy

If many short-lived activities appear, the card could overwhelm the user.

Mitigation:

- Show active projection rows only by default.
- Limit compact rows.
- Sort attention states first.
- Defer recently-active display unless a cheap query exists.

## Risk 4 — Live vs inferred could be confused

A derived guess may look like real activity.

Mitigation:

- Always show `Live`, `Inferred`, or `Mixed`.
- Use confidence text or subtle styling.

## Risk 5 — Polling could slow dashboard refresh

Frequent full dashboard refreshes would be expensive.

Mitigation:

- Add a dedicated lightweight agent-activity projection or command.
- Poll only the activity projection every 2–5 seconds.
- Patch only the agent activity section.
- Do not call full `dashboard-summary` for heartbeat updates.

## Risk 6 — Privacy / oversharing command details

Command, branch, path, and model details may be sensitive or too verbose.

Mitigation:

- Compact view shows safe fields.
- Details are expandable.
- Display only basename or repo-relative values for worktrees/paths.
- Do not display raw details JSON unless explicitly expanded/debug mode.

## Risk 7 — Stale leases may mislead users

Expired activities should not look active.

Mitigation:

- Use `expiresAt` to determine active vs expired.
- Use `updatedAt` to determine freshness.
- Hide expired activities from active rows.
- Use a short TTL for dashboard-facing activity.

## Risk 8 — Duplicate rows from multiple sources

The same work may appear in live activity leases, team execution, and subagent registry rows.

Mitigation:

- Define projection merge rules before implementation.
- Treat live leases as primary.
- Use team/subagent rows as enrichment or fallback, not duplicate active rows.

---

# 7. Technical Direction

## 7.1 Add an Agent Activity Projection Builder

Add a builder such as:

```text
src/modules/task-engine/dashboard/build-dashboard-agent-activity-summary.ts
```

The builder should accept current data sources and return a stable dashboard view model.

Inputs may include:

```text
live activity leases
derived agent status
tasks
team execution summary
subagent registry summary
task checkpoints
system status / current phase
future agent assignments
future agent sessions
future runtime service snapshots
```

Output:

```text
DashboardAgentActivitySummary
```

## 7.2 Preserve current compatibility

Keep:

```ts
dashboardSummary.agentStatus;
```

Add:

```ts
dashboardSummary.agentActivitySummary;
```

The existing `agentStatus` remains a single-status compatibility and fallback field. The new `agentActivitySummary` becomes the stable projected view model for the Agent Activity Board.

## 7.3 Minimum v1 projection contract

Keep v1 lean. Do not block the first usable board on every future enrichment field.

```ts
export type DashboardAgentActivityRow = {
  schemaVersion: 1;
  rowId: string;
  displayName: string;
  role: "main" | "supervisor" | "worker" | "reviewer" | "validator" | "researcher" | "unknown";
  status: DashboardAgentStatusKind;
  statusLabel: string;
  source: "live_activity" | "subagent_registry" | "team_execution" | "derived" | "future_runtime";
  sourceConfidence: "high" | "medium" | "low";

  work: {
    kind: "task" | "phase" | "planning" | "review" | "validation" | "release" | "idle" | "unknown";
    title: string | null;
    taskId: string | null;
    taskTitle: string | null;
    phaseKey: string | null;
    command: string | null;
    detail: string | null;
  };

  refs: {
    activityId?: string | null;
    agentId?: string | null;
    sessionId?: string | null;
    assignmentId?: string | null;
    agentDefinitionId?: string | null;
    subagentDefinitionId?: string | null;
    taskId?: string | null;
    prNumber?: number | null;
  };

  freshness: {
    updatedAt: string | null;
    startedAt: string | null;
    expiresAt: string | null;
    state: "fresh" | "aging" | "stale" | "expired" | "unknown";
  };

  attention: {
    state: "none" | "blocked" | "needs_human" | "needs_policy" | "stale" | "failed" | "unavailable";
    message: string | null;
  };
};

export type DashboardAgentActivitySummary = {
  schemaVersion: 1;
  generatedAt: string;
  source: "live_activity" | "derived_only" | "mixed";
  activeCount: number;
  staleCount: number;
  needsAttentionCount: number;
  main: DashboardAgentActivityRow | null;
  active: DashboardAgentActivityRow[];
  needsAttention: DashboardAgentActivityRow[];
  inferredFallback: DashboardAgentStatusSummary | null;
  sourceMap: {
    liveActivityCount: number;
    teamExecutionCount: number;
    subagentSessionCount: number;
    derivedFallbackUsed: boolean;
  };
};
```

## 7.4 Deferred v1.1 fields

These are useful but should not block v1:

```text
customAgentName
branch
baseBranch
worktree
ownedPaths
currentStep
progressPercent
model
origin
handoffRef
evidenceRef
prUrl
lastCommandStatus
recentlyActive[]
```

They can be parsed best-effort from `details` and shown in expanded rows later.

## 7.5 Projection source precedence

Default precedence, pending A-PROJECTION approval:

```text
1. live activity lease
2. future AgentSession / AgentAssignment runtime state
3. team execution assignment
4. subagent registry session
5. derived agent status
```

Live activity should usually win because it has the freshest heartbeat.

Team execution and subagent registry should enrich or backfill rows rather than creating duplicates when they refer to the same work.

## 7.6 Renderer rule

The dashboard renderer must consume only `DashboardAgentActivitySummary` and must not query task-engine internals.

---

# 8. Required Decisions / Prerequisite Artifacts

These artifacts must be completed before implementation tasks begin. They are deliberately small, but they prevent agents from implementing ambiguous pieces in incompatible ways.

| ID | Artifact | Required decision | Blocks |
| --- | --- | --- | --- |
| **A-PROJECTION** | Agent activity projection source map | Define current/future inputs, output contract, source precedence, row merge rules, freshness calculation, and attention calculation. | T-AC-050, T-AC-101, T-AC-201 |
| **A-ID** | Agent identity + row merge model | Define `agentId`, `sessionId`, `activityId`, `agentDefinitionId`, subagent `definitionId`, display-name precedence, main-agent selection, and duplicate-merge rules. | T-AC-050, T-AC-101, T-AC-201 |
| **A-CONTRACT** | Agent activity dashboard contract | Decide where `agentActivitySummary` lives, required v1 fields, compatibility with `agentStatus`, versioning, and fixture examples. | T-AC-050, T-AC-101, T-AC-502 |
| **A-REFRESH** | Agent activity slice/refresh plan | Decide projection vs command vs service slice, polling interval, mutation-lock behavior, section patch id, and fallback behavior. | T-AC-301, T-AC-302 |
| **A-UX** | Narrow dashboard UX spec | Finalize compact layout, row limits, status chips, accessibility labels, line wrapping, action buttons, and expansion rules. | T-AC-201, T-AC-202, T-AC-203 |
| **A-INSTRUMENTATION** | Agent activity reporting convention | Decide TTL/heartbeat policy, required/minimum payload, docs, and automatic command hooks. | T-AC-401, command-hook work |
| **A-TEST** | Fixture and compatibility matrix | Define old/new payload fixtures, malformed details behavior, sorting fixtures, stale/expired cases, and render/contract test scope. | T-AC-501, T-AC-502 |

---

# 9. Available Data To Feed The Projection

## From `agentStatus`

- source: `derived` or `live_activity`
- kind
- label
- confidence
- updatedAt
- taskId
- phaseKey
- command
- prNumber
- version
- detail

## From activity leases

- activityId
- agentId
- sessionId
- kind
- label
- startedAt
- updatedAt
- expiresAt
- taskId
- command
- phaseKey
- prNumber
- version
- details JSON

## From activity lease details, best-effort v1.1 enrichment

- agentDisplayName
- customAgentName
- agentDefinitionId
- role
- model
- origin
- currentStep
- stepIndex
- stepCount
- progressPercent
- branch
- baseBranch
- worktree
- ownedPaths
- changedFilesCount
- lastCommand
- lastCommandStatus
- validationLabel
- validationCommand
- checkName
- prUrl
- pullRequestUrl
- evidenceRef
- handoffRef
- blocker
- requestedDecision

## From team execution summary

- active team assignment count
- assignment id
- execution task id
- execution task title
- supervisor id
- worker id
- assignment status
- updatedAt

## From subagent registry

- definitions count
- retired definitions count
- open sessions count
- session id
- definition id
- execution task id
- status
- updatedAt

## From checkpoints

- recent checkpoint count
- checkpoint id
- task id
- label
- ref kind
- createdAt
- git head sha

## From task rows

- task title
- task status
- task priority
- phase key
- blockers
- human gate metadata
- acceptance/evidence state when available

## From phase/task state

- current phase
- next phase
- phase progress
- queue counts
- task sync current/behind/conflict

## Future source candidates

- AgentAssignment
- AgentSession
- AgentHandoff
- AgentResourceLock
- RuntimeServiceSnapshot
- service event stream

---

# 10. Information We Should Display By Default

Default compact panel:

## Main agent row

Display:

- status chip
- display name or agent id
- task id + task title
- phase key
- current step or command
- updated relative time
- Live/Inferred/Mixed badge

Example:

```text
Main Agent
● Working · Backend Sync Worker
  T100621 — Add canonical event outbox
  Phase 121 · pnpm run check · updated 8s ago · Live
```

## Active agents list

Display each active projected row:

- display name / agent id
- status chip
- task id + title
- phase
- PR/version if relevant
- updated relative time

## Needs attention list

Display:

- blocked
- awaiting policy approval
- awaiting human gate
- stale active lease
- failed validation if available

## Footer summary

Display:

```text
3 active · 1 needs human · 0 stale · task sync current
```

---

# 11. Information To Hide Behind Expansion

Expanded row details may show:

- session id
- activity id
- assignment id
- agent definition id
- subagent definition id
- raw kind/status
- exact startedAt / updatedAt / expiresAt
- branch
- worktree basename or repo-relative path
- base branch
- owned paths
- full command
- model/provider
- checkpoint references
- handoff references
- supervisor id
- worker id
- raw details JSON only in debug/explicit expansion mode

---

# 12. UX Direction

## 12.1 Target panel name

Use:

```text
Agent Activity
```

This is clearer than “Agent Mission Control.”

## 12.2 Compact layout

```text
┌ Agent Activity ───────────────────────── live · updated 8s ago ┐
│ Main Agent                                                      │
│ ● Working       T100621 — Add canonical event outbox             │
│   Backend Sync Worker · Phase 121 · pnpm run test               │
│                                                                 │
│ Active Agents                                                   │
│ ● Dashboard UX Worker      Validating · T100622       PR #612   │
│ ● Docs Worker              Updating runbook           Phase 121 │
│                                                                 │
│ Needs Attention                                                 │
│ ⚠ Review Agent             Awaiting policy approval   14m       │
│                                                                 │
│ 3 active · 1 needs human · 0 stale · task sync current           │
└─────────────────────────────────────────────────────────────────┘
```

## 12.3 Visual status chips

| Kind | Chip |
| --- | --- |
| `working_task` | Working |
| `planning` | Planning |
| `validating` | Validating |
| `reviewing_pr` | Reviewing PR |
| `reviewing_item` | Reviewing |
| `releasing` | Releasing |
| `blocked` | Blocked |
| `awaiting_policy_approval` | Needs approval |
| `awaiting_human_gate` | Waiting on human |
| `delegating_task` | Delegating |
| `ready_task` | Ready |
| `awaiting_instruction` | Idle |
| `unavailable` | Unavailable |

## 12.4 Sorting order

Attention-first sort:

1. awaiting policy approval
2. awaiting human gate
3. blocked
4. stale/expiring soon
5. releasing
6. validating
7. reviewing
8. working
9. planning
10. delegating
11. ready
12. idle

## 12.5 Freshness display

Use relative time:

```text
updated 8s ago
updated 1m ago
stale · last seen 4m ago
```

Decision pending: exact TTL/heartbeat/freshness thresholds.

Recommended starting model:

```text
active = now < expiresAt
fresh = active and now - updatedAt <= 30s
aging = active and now - updatedAt <= 60s
stale = active and now - updatedAt > 60s
expired = now >= expiresAt
recent = expired and now - updatedAt <= 10m, deferred unless cheap
```

## 12.6 Live vs inferred

Always display one of:

```text
Live
Inferred
Mixed
```

Live means at least one current activity lease is present. Inferred means the system is guessing from tasks/sessions. Mixed means live rows exist but fallback/enrichment also contributes.

## 12.7 V1 actions

V1 actions should be limited to existing supported actions:

- View Task
- View PR, if `prNumber` or URL exists
- Clear stale activity

Defer until later:

- Copy handoff
- Open last output/log
- Resume human gate, unless an existing safe action already exists

---

# 13. Agent Activity Details Convention

Agents should use `set-agent-activity` with a richer `details` object.

Recommended example:

```json
{
  "agentId": "dashboard-ux-worker",
  "sessionId": "cursor-tab-2026-05-30-agent-card",
  "kind": "working_task",
  "taskId": "T100621",
  "phaseKey": "121",
  "command": "pnpm run check",
  "details": {
    "agentDisplayName": "Dashboard UX Worker",
    "agentDefinitionId": "dashboard-ux-worker",
    "role": "implementation_worker",
    "currentStep": "Running render tests",
    "branch": "feature/T100621-agent-panel",
    "worktree": "../workflow-cannon-agent-panel",
    "progressPercent": 60
  },
  "ttlSeconds": 90
}
```

Recommended details keys:

```text
agentDisplayName
customAgentName
agentDefinitionId
role
model
origin
currentStep
stepIndex
stepCount
progressPercent
branch
baseBranch
worktree
ownedPaths
lastCommand
lastCommandStatus
validationLabel
prUrl
pullRequestUrl
evidenceRef
handoffRef
blocker
requestedDecision
```

---

# 14. Implementation Guidance

## 14.1 Preserve existing compatibility

Do not remove or break the existing `agentStatus` field. Add `agentActivitySummary` or equivalent alongside it.

## 14.2 Build the projection first

Do not have the renderer assemble rows from leases/team/subagent data directly.

Add a projection builder such as:

```text
buildDashboardAgentActivitySummary(input): DashboardAgentActivitySummary
```

The builder owns:

- source normalization
- row id generation
- display-name resolution
- source precedence
- duplicate merge rules
- main-agent selection
- freshness calculation
- attention-state calculation
- derived fallback incorporation

## 14.3 Use all active leases as the first current input

The store already supports listing active leases. The projection build path should use that list, not only the first lease.

## 14.4 Enrich projection rows with task titles

Use task store data to join `taskId` to task title. If a task id no longer exists or is external, keep the raw task id and avoid failing.

## 14.5 Derive display name safely

Suggested display name order, pending A-ID decision:

```text
details.agentDisplayName
details.customAgentName
details.agentDefinitionId
subagent definitionId
agentId
sessionId
```

## 14.6 Add a lightweight projection/slice

Do not require full dashboard summary refresh just to update agent activity.

Recommended options to decide in A-REFRESH:

```text
dashboard-summary { projection: "agentActivity" }
```

or:

```text
wk run dashboard-agent-activity '{}'
```

or future:

```text
/dashboard/slices/agentActivity
```

## 14.7 Keep rendering pure and testable

The dashboard renderer should receive `DashboardAgentActivitySummary` and render HTML without fetching anything.

## 14.8 Update tests before or alongside renderer work

Add rendering tests for:

- no activity → inferred fallback
- one live main activity
- multiple live activities
- custom agent display name
- subagent definition id fallback/enrichment
- team execution fallback/enrichment
- awaiting approval sorted first
- stale/expired handling
- old payload compatibility
- malformed details

---

# 15. What Not To Do

- Do not display raw JSON in the compact card.
- Do not show expired leases as active.
- Do not make derived status look live.
- Do not require agents to provide every field.
- Do not add a large polling loop that refreshes the full dashboard every 2 seconds.
- Do not make the extension mutate task state directly.
- Do not make custom agent identity depend only on session id.
- Do not bury human-gate or policy-approval states below routine working rows.
- Do not make the visual design color-only; use labels/icons/text for accessibility.
- Do not treat subagent registry rows and live activity rows as separate duplicate active rows when they represent the same work.
- Do not bind the UI directly to current backend source shapes.

---

# 16. Assumptions

- Agent activity leases are the best near-term source for live agent status.
- Existing derived status remains useful as fallback.
- Dashboard service/event stream work may arrive later; first implementation can use targeted polling.
- Custom agents can be encouraged to pass richer `details` through `set-agent-activity`.
- Task titles can be joined from active task store rows where available.
- Subagent registry definition ids are sufficient initial identifiers for custom subagents when no live lease exists.
- Recently active rows may require a new query and should be deferred unless cheap.
- Future task-engine assignment/session/lock models will be integrated by updating the projection builder, not the renderer.

---

# 17. Open Decisions

These decisions should be made one at a time before execution tasks are generated.

1. Should the dashboard expose raw current-source data, or a stable projected `DashboardAgentActivitySummary` view model?
2. Where should the projected summary live: top-level `agentActivitySummary`, nested under `agentStatus`, or separate command only?
3. What current and future sources feed the projection, and what is their precedence?
4. What is the canonical agent identity and row merge model?
5. How should the main agent be selected?
6. What is the minimum v1 projection row contract?
7. What TTL/heartbeat/freshness policy should dashboard activity use?
8. Should activity `details` be schema-validated or best-effort parsed?
9. How should subagent registry and team execution rows be merged with live activity leases?
10. What refresh mechanism should v1 use: projection, separate command, or service slice?
11. How much UI belongs in v1: compact board only, or expansion/actions too?
12. Which activity states should be set automatically by Workflow Cannon command boundaries?

---

# 18. Recommended Delivery Phases

## Phase 0 — Decision artifacts

Complete A-PROJECTION, A-ID, A-CONTRACT, A-REFRESH, A-UX, A-INSTRUMENTATION, and A-TEST before implementation.

Exit criteria:

- Major decisions are recorded.
- Projection model is approved.
- Contract and identity model are approved.
- Implementation tasks have clear constraints.

## Phase A — Projection and contract foundations

Implement the projection builder and expose `agentActivitySummary` from current sources.

Exit criteria:

- `DashboardAgentActivitySummary` exists.
- Existing `agentStatus` remains compatible.
- Tests prove multiple active leases are projected.
- Team/subagent rows can enrich or backfill without duplicate active rows.

## Phase B — Overview card UX

Replace/enhance the top overview card with the Agent Activity Board.

Exit criteria:

- Main agent row renders.
- Active agents render.
- Needs attention rows sort first.
- Live/Inferred/Mixed badge displays.
- Freshness labels display.

## Phase C — Near-real-time refresh

Add a lightweight refresh path for agent activity.

Exit criteria:

- Agent activity updates without full dashboard reload.
- Polling interval is 2–5 seconds while visible.
- No measurable full-dashboard slowdown.

## Phase D — Agent instrumentation guidance

Update docs/snippets and automatic command hooks so agents set useful activity metadata.

Exit criteria:

- Agent-facing instruction exists.
- Example `set-agent-activity` payload includes custom agent metadata.
- Key command boundaries record activity where practical.

## Phase E — Service/event-stream readiness

Prepare the projection to be fed by the future dashboard service/event stream.

Exit criteria:

- Projection boundary is clear.
- Renderer is data-source agnostic.
- Future service can feed the same contract.

---

# 19. Work Breakdown Structure

## WP-0 — Decision artifacts

### T-AC-000 — Produce and approve agent activity decision artifacts

**Type:** design / prerequisite artifacts  
**Priority:** P0  
**Severity:** Critical  
**Suggested phase:** Phase 0  
**Value:** Prevents parallel agents from implementing identity, contract, projection, and refresh behavior inconsistently.

**Scope**

Produce and approve:

- A-PROJECTION — Agent activity projection source map
- A-ID — Agent identity + row merge model
- A-CONTRACT — Agent activity dashboard contract
- A-REFRESH — Agent activity slice/refresh plan
- A-UX — Narrow dashboard UX spec
- A-INSTRUMENTATION — Activity reporting convention
- A-TEST — Fixture and compatibility matrix

**Acceptance criteria**

- All required decisions are recorded.
- Coding tasks reference the approved artifacts.
- No implementation task begins before the relevant artifact is approved.

---

## WP-1 — Inventory and projection decision

### T-AC-001 — Inventory current and expected future agent activity data flow

**Type:** research  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase 0  
**Value:** Prevents building a projection that only fits today’s backend.

**Scope**

- Locate current overview agent card renderer.
- Trace dashboard data from `dashboard-summary` to render HTML.
- Confirm how `agentStatus`, `teamExecution`, `subagentRegistry`, `taskCheckpoints`, and live leases are currently included.
- Identify expected future task-engine sources likely to feed activity.
- Identify tests that cover current rendering.

**Acceptance criteria**

- Notes list current renderer functions and data fields.
- Notes list what the current card displays.
- Notes list missing fields for multi-agent display.
- Notes list future backend concepts the projection should anticipate.

---

### T-AC-002 — Decide `DashboardAgentActivitySummary` projection contract

**Type:** design / contract  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase 0  
**Value:** Establishes stable payload before UI work.

**Scope**

- Decide where the new payload lives.
- Define `DashboardAgentActivityRow` and `DashboardAgentActivitySummary`.
- Include compatibility policy for existing `agentStatus`.
- Include source-map fields.
- Include display-name derivation rules.
- Include fixture examples.

**Acceptance criteria**

- Contract shape is documented.
- Existing `agentStatus` remains unchanged or backward compatible.
- The contract supports multiple active agents.
- The contract is source-agnostic enough for future task-engine changes.

---

## WP-2 — Projection builder and backend data surfacing

### T-AC-050 — Implement Agent Activity Projection Builder

**Type:** implementation  
**Priority:** P0  
**Severity:** Critical  
**Suggested phase:** Phase A  
**Requires:** A-PROJECTION, A-ID, A-CONTRACT  
**Value:** Creates the stability boundary between volatile backend state and dashboard UI.

**Likely files**

```text
src/modules/task-engine/dashboard/build-dashboard-agent-activity-summary.ts
src/contracts/dashboard-summary-run.ts
test/dashboard-agent-activity-summary.test.mjs
```

**Scope**

- Normalize current sources into `DashboardAgentActivitySummary`.
- Implement row id generation.
- Implement display-name resolution.
- Implement main-agent selection.
- Implement source precedence.
- Implement duplicate merge rules.
- Implement freshness and attention calculation.
- Preserve derived fallback.

**Acceptance criteria**

- Projection can be built from current live activity leases.
- Projection can include/enrich from task/team/subagent data.
- Duplicate sources do not create duplicate rows for the same work.
- Renderer does not need to know source-specific shapes.

---

### T-AC-101 — Feed all active live activity leases into the projection

**Type:** implementation  
**Priority:** P0  
**Severity:** Critical  
**Suggested phase:** Phase A  
**Requires:** T-AC-050  
**Value:** Unlocks multi-agent visibility from current data.

**Likely files**

```text
src/modules/task-engine/dashboard/build-dashboard-base.ts
src/modules/task-engine/agent-activity-store.ts
src/modules/task-engine/dashboard/build-dashboard-agent-activity-summary.ts
test/dashboard-*.mjs
```

**Scope**

- Use `listCurrentAgentActivityLeases` rather than only `readCurrentAgentActivityLease`.
- Pass leases into the projection builder.
- Preserve existing single `agentStatus` behavior.
- Include active count and generatedAt.

**Acceptance criteria**

- Multiple active leases appear in projected summary.
- Expired leases are excluded from active rows.
- Existing `agentStatus` still works.
- When no live leases exist, derived status remains available.

---

### T-AC-102 — Enrich projection rows with task title and phase context

**Type:** implementation  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase A  
**Requires:** T-AC-050  
**Value:** Makes rows human-readable.

**Scope**

- Join `taskId` to task title where available.
- Preserve raw task id if task does not exist.
- Include phase key from lease or task fallback.
- Include task status if cheap and useful.

**Acceptance criteria**

- Activity rows display `T### — title` when task exists.
- Missing task does not fail dashboard summary.
- Phase key is populated from best available source.

---

### T-AC-103 — Parse useful custom agent metadata from `details`

**Type:** implementation  
**Priority:** P1  
**Severity:** Medium  
**Suggested phase:** Phase A  
**Requires:** T-AC-050  
**Value:** Allows custom agents to identify themselves without a new table.

**Scope**

Parse approved known keys from `details` defensively.

**Acceptance criteria**

- Known detail keys appear in structured row fields or expanded metadata.
- Unknown detail keys are not rendered in compact card.
- Malformed details do not break dashboard summary.

---

## WP-3 — Agent Activity Board UX

### T-AC-201 — Render compact Agent Activity Board from projection only

**Type:** implementation / UI  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase B  
**Requires:** T-AC-050, A-UX  
**Value:** Converts data into immediate human understanding.

**Likely files**

```text
extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts
extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs
```

**Scope**

Render from `DashboardAgentActivitySummary` only:

- header with freshness/source
- Main Agent
- Active Agents
- Needs Attention
- footer summary

**Acceptance criteria**

- One live activity renders as main agent.
- Multiple live activities render in active list.
- No live activity renders derived fallback.
- Empty state is clear and not alarming.
- Renderer does not depend on raw lease/team/subagent shapes.

---

### T-AC-202 — Add status chips and attention sorting

**Type:** implementation / UI  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase B  
**Requires:** A-UX  
**Value:** Makes action-required states visible first.

**Scope**

- Map `DashboardAgentStatusKind` to human chip labels.
- Sort needs-attention states first.
- Separate routine active agents from attention rows.

**Acceptance criteria**

- Awaiting approval/human gate rows appear before routine work.
- Blocked rows appear in Needs Attention.
- Working/validating/planning rows appear in Active Agents.

---

### T-AC-203 — Add freshness labels and stale handling

**Type:** implementation / UI  
**Priority:** P1  
**Severity:** Medium  
**Suggested phase:** Phase B  
**Requires:** A-INSTRUMENTATION, A-UX  
**Value:** Prevents stale activity from misleading users.

**Scope**

- Show relative updated time.
- Label stale activities.
- Hide expired activities from active rows.
- Defer recently active rows unless cheap.

**Acceptance criteria**

- Fresh lease says updated seconds/minutes ago.
- Stale lease is labeled stale.
- Expired lease is not shown as active.

---

### T-AC-204 — Add expandable row details

**Type:** implementation / UI  
**Priority:** P2  
**Severity:** Medium  
**Suggested phase:** Phase B / v1.1  
**Requires:** A-UX  
**Value:** Keeps overview clean while preserving inspectability.

**Scope**

Expanded details may show session, activity id, assignment id, branch/worktree, PR, command, model, role, and debug details.

**Acceptance criteria**

- Compact view remains readable.
- Expanded row reveals technical context.
- Raw JSON is hidden unless explicitly expanded/debug.

---

## WP-4 — Near-real-time updates

### T-AC-301 — Add agent activity projection/slice

**Type:** implementation  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase C  
**Requires:** A-REFRESH, T-AC-050  
**Value:** Enables frequent updates without full dashboard refresh.

**Scope**

Add the approved lightweight projection, command, or service slice.

**Acceptance criteria**

- Agent activity can be refreshed independently.
- Projection excludes heavy queue/status rollups.
- Existing full/overview projections remain compatible.

---

### T-AC-302 — Poll/patch activity slice while dashboard is visible

**Type:** implementation  
**Priority:** P1  
**Severity:** Medium  
**Suggested phase:** Phase C  
**Requires:** A-REFRESH  
**Value:** Makes the panel feel live before the service/event stream exists.

**Scope**

- Poll every 2–5 seconds while overview/dashboard is visible.
- Pause/defer during mutation locks if needed.
- Patch only the agent activity card/section.

**Acceptance criteria**

- Updating `set-agent-activity` is visible within 5 seconds.
- No full dashboard reload is required.
- Mutations are not blocked by this polling.

---

### T-AC-303 — Prepare event-stream compatibility

**Type:** architecture / implementation  
**Priority:** P2  
**Severity:** Medium  
**Suggested phase:** Phase E  
**Requires:** A-REFRESH  
**Value:** Avoids rework when dashboard service arrives.

**Scope**

- Keep renderer data-source agnostic.
- Define event payload shape for future service.
- Document update path.

**Acceptance criteria**

- Future service can emit `agentActivity.updated` or slice update events into same renderer contract.

---

## WP-5 — Agent instrumentation and docs

### T-AC-401 — Add agent-facing activity usage guidance

**Type:** docs  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase D  
**Requires:** A-INSTRUMENTATION  
**Value:** The panel is only as good as the activity agents report.

**Likely files**

```text
src/modules/task-engine/instructions/set-agent-activity.md
.ai/AGENT-CLI-MAP.md
.ai/MACHINE-PLAYBOOKS.md
.ai/WORKSPACE-KIT-SESSION.md
```

**Scope**

Document when agents should call `set-agent-activity`:

- starting task work
- changing step
- blocking
- validating
- reviewing PR/item
- releasing
- waiting on approval
- clearing activity

**Acceptance criteria**

- Agent docs include rich example payload.
- Docs define useful `details` keys.
- Docs explain TTL/heartbeat expectations.

---

### T-AC-402 — Add automatic activity hooks at known command boundaries

**Type:** implementation / DX  
**Priority:** P1  
**Severity:** High  
**Suggested phase:** Phase D  
**Requires:** A-INSTRUMENTATION  
**Value:** Reduces reliance on agents remembering to report activity.

**Scope**

Add activity recording where practical for:

- `run-transition start`
- validation commands
- review commands
- release commands
- policy approval gates
- human gates

**Acceptance criteria**

- Key commands record useful activity without manual agent effort.
- Manual `set-agent-activity` remains supported.
- Hooks do not create noisy or misleading long-lived leases.

---

## WP-6 — Validation and hardening

### T-AC-501 — Add comprehensive render fixtures

**Type:** testing  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase B/C  
**Requires:** A-TEST  
**Value:** Prevents dashboard regressions.

**Scope**

Fixtures for:

- no activity / inferred fallback
- one live main activity
- multiple live activities
- custom agent metadata
- subagent definition id fallback/enrichment
- team execution fallback/enrichment
- waiting on human gate
- policy approval
- blocked
- validating/reviewing/releasing
- stale/expired leases
- old payload compatibility
- malformed details

**Acceptance criteria**

- Render tests cover all key states.
- Sorting is deterministic.
- HTML is accessible and stable.

---

### T-AC-502 — Add dashboard data contract/projection tests

**Type:** testing  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase A  
**Requires:** A-CONTRACT, A-PROJECTION, A-TEST  
**Value:** Protects backend summary shape and projection behavior.

**Scope**

- Contract test for multiple current activity leases.
- Contract test for enriched task title.
- Contract test for unknown/missing fields.
- Projection test for duplicate source merge.
- Projection test for live + derived fallback coexistence.

**Acceptance criteria**

- Dashboard summary payload remains versioned and stable.
- Tests fail if multiple activities regress to single activity.
- Tests fail if duplicate sources produce duplicate active rows.

---

# 20. Dependency Summary

```text
T-AC-000 → all implementation work
T-AC-001 → A-PROJECTION, A-ID, A-CONTRACT, A-REFRESH
A-PROJECTION + A-ID + A-CONTRACT → T-AC-050
T-AC-050 → T-AC-101
T-AC-050 → T-AC-102
T-AC-050 → T-AC-103
T-AC-050 + A-UX → T-AC-201
T-AC-201 → T-AC-202
T-AC-201 → T-AC-203
T-AC-201 → T-AC-204
A-REFRESH + T-AC-050 → T-AC-301
T-AC-301 → T-AC-302
T-AC-301 → T-AC-303
A-INSTRUMENTATION → T-AC-401, T-AC-402
A-TEST → T-AC-501, T-AC-502
```

---

# 21. Recommended Work Order

1. T-AC-001 — Inventory current and future activity data flow.
2. T-AC-000 — Produce required decision artifacts.
3. T-AC-002 — Finalize projection contract shape.
4. T-AC-050 — Implement Agent Activity Projection Builder.
5. T-AC-101 — Feed all active live leases into projection.
6. T-AC-102 — Enrich with task titles/phase context.
7. T-AC-502 — Add contract/projection tests.
8. T-AC-201 — Render compact Agent Activity Board from projection only.
9. T-AC-202 — Add status chips and attention sorting.
10. T-AC-203 — Add freshness/stale handling.
11. T-AC-501 — Add render fixtures.
12. T-AC-301 — Add lightweight projection/slice.
13. T-AC-302 — Poll/patch near-real-time.
14. T-AC-401 — Add agent-facing docs and examples.
15. T-AC-402 — Add automatic activity hooks.
16. T-AC-204 — Add expandable details.
17. T-AC-303 — Prepare service/event-stream compatibility.

---

# 22. Final Acceptance Criteria

This plan is complete when:

- The dashboard overview has an Agent Activity panel/card.
- The panel renders only from `DashboardAgentActivitySummary` or equivalent stable projection.
- The panel shows multiple active agents, not only one inferred status.
- Custom agents can be identified when they provide metadata.
- Subagent sessions can be identified by definition/session/task without duplicating live rows.
- Main agent selection follows the approved projection/identity model.
- Human intervention states are visually prioritized.
- Live vs inferred status is clearly labeled.
- Freshness is shown and stale activity is not misleading.
- Agent activity updates within 5 seconds while the dashboard is visible.
- The renderer is tested with representative multi-agent states.
- Projection tests cover current and anticipated source combinations.
- Agent docs show how to provide richer activity data.
- Known command boundaries report activity where practical.

---

# 23. Task Generation Payload Hints

When converting this plan into Workflow Cannon tasks, use task metadata like:

```json
{
  "planRef": "AGENT_CARD_PLAN.md",
  "planArea": "dashboard-agent-activity-projection",
  "wbsId": "T-AC-050",
  "requiresPhaseBranch": true,
  "maintainerDeliveryProfile": "github-pr"
}
```

Recommended task type:

```text
improvement
```

Recommended tags:

```text
dashboard
agent-activity
activity-projection
multi-agent
extension-ui
task-engine
near-real-time
```

---

# 24. Final Recommendation

Do this, but do not start with UI and do not start by dumping raw activity leases into the renderer.

Start with the projection boundary.

The winning product pattern is:

```text
Agent Activity Board
  = stable projection view model
  + live leases as first current input
  + future task-engine/session/assignment sources as future inputs
  + derived fallback
  + attention-first sorting
  + custom agent identity
  + near-real-time slice refresh
```

The biggest implementation risk is coupling the UI to backend churn. Solve that with `DashboardAgentActivitySummary` and `buildDashboardAgentActivitySummary(...)`; then the implementation should stay useful even as task-engine phased work changes the underlying data model.
