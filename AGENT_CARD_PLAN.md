# AGENT_CARD_PLAN.md — Dashboard Agent Activity Card Plan

## Purpose

This document captures the full product and implementation plan for improving the agent card at the top of the Workflow Cannon dashboard overview tab.

The purpose of the card is to help a human user immediately understand:

1. **Who is working?**
2. **What are they doing?**
3. **Which custom agents or subagents are active?**
4. **Is anything blocked, stale, or waiting on the human?**
5. **Can the user trust that the panel is near-real-time?**

The current implementation already has enough backend structure to make this card much more useful. The biggest opportunity is to stop treating the card as a single inferred status and instead make it an **Agent Activity Board** powered by all active agent activity leases, with derived status as fallback.

---

## Planner Alignment

This plan is formatted so it can be entered into the Workflow Cannon planner system as a serious plan artifact.

It includes:

- goals and intended outcomes
- value assessment
- risk assessment
- technical impact
- UI/UX direction
- implementation guidance
- what not to do
- assumptions and open questions
- full work breakdown structure
- recommended work order
- recommended phase breakdown
- task-generation-ready payload details

This plan should be reviewed before materializing execution tasks.

---

# 1. Executive Summary

The dashboard overview currently exposes a high-level `agentStatus` field and already has supporting data for team assignments, subagent sessions, checkpoints, task state, phase, and live agent activity leases.

The highest-value change is:

```text
Expose and render all active agent activity leases in the dashboard overview.
```

Today, the dashboard reads the first current activity lease and converts it into a single `agentStatus`. However, the underlying store already supports multiple active leases. That means the system can already support a near-real-time multi-agent panel with minimal schema expansion.

Target state:

```text
Dashboard Overview
  └── Agent Activity Board
        ├── Main Agent
        ├── Active Agents
        ├── Needs Attention
        ├── Recently Active / Stale
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

The supported status kinds are already a good UX vocabulary:

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

When no live activity is available, the dashboard derives a status from:

- phase/system availability
- active planning session
- human gates
- blocking analysis
- in-progress tasks
- team execution
- subagent registry
- suggested next task

This is valuable, but it is inference. It should remain as fallback and be labeled as **Inferred** rather than **Live**.

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

The activity store already supports listing current active leases ordered by freshness. The current dashboard build path only picks the first lease for `agentStatus`. That is the core limitation.

## 2.4 Current supporting dashboard data

The dashboard summary also has useful related data:

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

This helps identify supervisor/worker relationships and active delegated work.

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

This helps identify custom subagent sessions and agent definition ids.

### Task checkpoints

```text
id
taskId
label
refKind: head | stash
createdAt
gitHeadSha
```

This helps show whether an agent has checkpointed work.

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

This describes the configured main-agent style/profile, not necessarily active work. Use as secondary context only.

---

# 3. Product Goals

## Goal 1 — Immediate human understanding

A user should be able to glance at the top of the dashboard and understand what agents are currently doing without opening logs, task details, or CLI commands.

## Goal 2 — Individual agent identity

The panel should identify each active agent or subagent using the best available data:

- custom display name, if available
- agent id
- session id
- subagent definition id
- role, if available
- supervisor/worker relation, if available

## Goal 3 — Custom agent visibility

If a particular custom agent is run, the user should know which one. The panel should surface `agentDefinitionId`, `definitionId`, `customAgentName`, or `agentDisplayName` when available.

## Goal 4 — Near-real-time freshness

The panel should update near real time. For the first implementation, polling every 2–5 seconds is acceptable. Once the dashboard service/event stream exists, the panel should be event-driven.

## Goal 5 — Attention-first design

Blocked work, policy approvals, human gates, expired/stale leases, and validation failures should be visually prioritized above routine working states.

## Goal 6 — Derived fallback without deception

When no live activity exists, the card should still show useful inferred status, but it must be visibly labeled as inferred so the user knows it is not a live heartbeat.

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

---

# 5. Value Assessment

## User value

- The user immediately knows whether agents are working, idle, blocked, or waiting for input.
- Multi-agent work becomes observable instead of mysterious.
- Custom agents become identifiable by name/definition rather than appearing as vague background work.
- The user can intervene only when needed.

## Product value

- Makes the dashboard feel like a true command center.
- Strengthens Workflow Cannon’s multi-agent story.
- Makes live activity leases more valuable.
- Creates a foundation for future agent assignments, handoffs, and resource locks.

## Agent value

- Agents can communicate status through structured activity rather than freeform chat.
- Supervisors can see active workers.
- Review and validation agents can be surfaced distinctly.
- Stale work and missing heartbeats become visible.

---

# 6. Risk Assessment

## Risk 1 — Activity data may be incomplete

Agents may not call `set-agent-activity`, or may omit useful details.

Mitigation:

- Keep derived fallback.
- Add docs and snippets showing agents how to set activity.
- Make minimal activity useful: `agentId`, `kind`, `label`, `taskId`.

## Risk 2 — Panel could become noisy

If many short-lived activities appear, the card could overwhelm the user.

Mitigation:

- Show active leases only by default.
- Collapse recently expired/stale leases.
- Sort attention states first.
- Limit compact view to top N, with expand action.

## Risk 3 — Live vs inferred could be confused

A derived guess may look like real activity.

Mitigation:

- Always show `Live` or `Inferred` badge.
- Use confidence text or subtle styling.

## Risk 4 — Polling could slow dashboard refresh

Frequent full dashboard refreshes would be expensive.

Mitigation:

- Add a dedicated lightweight agent-activity slice or projection.
- Poll only the activity slice every 2–5 seconds.
- Do not call full `dashboard-summary` for heartbeat updates.

## Risk 5 — Privacy / oversharing command details

Command, branch, path, and model details may be sensitive or too verbose.

Mitigation:

- Compact view shows safe fields.
- Details are expandable.
- Do not display raw details JSON unless explicitly expanded/debug mode.

## Risk 6 — Stale leases may mislead users

Expired activities should not look active.

Mitigation:

- Use `expiresAt` and `updatedAt` to mark stale/expired states.
- Hide expired activities from active rows.
- Optionally show recently active rows separately.

---

# 7. Technical Impact

## Backend / contract changes

Add a dashboard field for all active agent activities.

Recommended shape:

```ts
export type DashboardAgentActivityRow = {
  schemaVersion: 1;
  activityId: string;
  agentId: string;
  sessionId: string;
  displayName: string;
  kind: DashboardAgentStatusKind;
  label: string;
  source: "live_activity";
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
  taskId: string | null;
  taskTitle: string | null;
  phaseKey: string | null;
  command: string | null;
  prNumber: number | null;
  version: string | null;
  detail: string | null;
  definitionId: string | null;
  agentDefinitionId: string | null;
  customAgentName: string | null;
  branch: string | null;
  worktree: string | null;
  currentStep: string | null;
  progressPercent: number | null;
  role: string | null;
};

export type DashboardAgentActivitySummary = {
  schemaVersion: 1;
  source: "live_activity" | "derived_only" | "mixed";
  updatedAt: string;
  activeCount: number;
  staleCount: number;
  needsAttentionCount: number;
  main: DashboardAgentActivityRow | DashboardAgentStatusSummary;
  active: DashboardAgentActivityRow[];
  recentlyActive?: DashboardAgentActivityRow[];
};
```

This can be introduced alongside the existing `agentStatus` field for compatibility.

## Dashboard rendering changes

Replace or enhance the current top overview agent card with an Agent Activity Board.

## Polling / refresh changes

Add a dedicated agent activity slice to the dashboard refresh model.

Suggested interval:

```text
agentActivity: every 2–5 seconds while dashboard visible
```

Once service/event-stream architecture exists:

```text
agent activity lease update → dashboard service event → webview patch
```

## Agent command guidance changes

Update docs/snippets so agents call `set-agent-activity` when starting, changing step, blocking, validating, reviewing, releasing, or completing activity.

---

# 8. Available Data To Display

## 8.1 From `agentStatus`

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

## 8.2 From activity leases

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

## 8.3 From activity lease details

Potential useful keys:

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

## 8.4 From team execution summary

- active team assignment count
- assignment id
- execution task id
- execution task title
- supervisor id
- worker id
- assignment status
- updatedAt

## 8.5 From subagent registry

- definitions count
- retired definitions count
- open sessions count
- session id
- definition id
- execution task id
- status
- updatedAt

## 8.6 From checkpoints

- recent checkpoint count
- checkpoint id
- task id
- label
- ref kind
- createdAt
- git head sha

## 8.7 From task rows

- task title
- task status
- task priority
- phase key
- blockers
- human gate metadata
- acceptance/evidence state when available

## 8.8 From phase/task state

- current phase
- next phase
- phase progress
- queue counts
- task sync current/behind/conflict

---

# 9. Information We Should Display By Default

The default compact panel should show only the fields that answer the human’s immediate questions.

## Main agent row

Display:

- status chip
- display name or agent id
- task id + task title
- phase key
- current step or command
- updated relative time
- Live/Inferred badge

Example:

```text
Main Agent
● Working · Backend Sync Worker
  T100621 — Add canonical event outbox
  Phase 121 · pnpm run check · updated 8s ago · Live
```

## Active agents list

Display each active lease:

- display name / agent id
- status chip
- task id + title
- phase
- PR/version if relevant
- updated relative time

Example:

```text
Active Agents
● Dashboard UX Worker    Validating · T100622 · PR #612 · 21s ago
● Docs Worker            Updating runbook · T100623 · 44s ago
```

## Needs attention list

Display first-class intervention states:

- blocked
- awaiting policy approval
- awaiting human gate
- stale/expired activity
- failed validation if available

Example:

```text
Needs Attention
⚠ Review Agent · Awaiting policy approval · T100624 · 14m
```

## Footer summary

Display:

```text
3 active · 1 needs human · 0 stale · task sync current
```

---

# 10. Information To Hide Behind Expansion

Expanded row details may show:

- session id
- activity id
- raw kind
- exact startedAt / updatedAt / expiresAt
- branch
- worktree
- base branch
- owned paths
- full command
- model/provider
- raw details JSON
- checkpoint references
- handoff references
- assignment id
- supervisor id
- worker id

This keeps the overview clean while preserving inspectability.

---

# 11. UX Direction

## 11.1 Target panel name

Use:

```text
Agent Activity
```

or:

```text
Agent Mission Control
```

Recommendation: **Agent Activity**. It is clearer and less theatrical.

## 11.2 Layout

Target compact layout:

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

## 11.3 Visual status chips

Map kinds to chips:

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

## 11.4 Sorting order

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

## 11.5 Freshness display

Use relative time:

```text
updated 8s ago
updated 1m ago
stale · last seen 4m ago
```

Freshness rules:

```text
fresh: updated <= 30s ago
aging: updated <= 2m ago
stale: updated > 2m ago or close to expiry
expired: expiresAt <= now; hide from active list, optionally show under Recently Active
```

## 11.6 Live vs inferred

Always display one of:

```text
Live
Inferred
Mixed
```

Live means at least one current activity lease is present. Inferred means the system is guessing from tasks/sessions. Mixed means live leases exist, but fallback derived status is also contributing.

## 11.7 Action buttons

Keep buttons small and contextual.

Useful actions:

- View Task
- View PR
- Clear stale activity
- Copy handoff
- Open last output/log
- Resume human gate

Do not make the top card a giant control panel. It should primarily be a status surface.

---

# 12. Agent Activity Details Convention

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

# 13. Implementation Guidance

## 13.1 Preserve existing compatibility

Do not remove or break the existing `agentStatus` field. Add richer fields alongside it.

## 13.2 Use all active leases

The store already supports listing active leases. The dashboard build path should use that list, not only the first lease.

## 13.3 Enrich activity rows with task titles

Use task store data to join `taskId` to task title. If a task id no longer exists or is external, keep the raw task id and avoid failing.

## 13.4 Derive display name safely

Display name order:

```text
details.agentDisplayName
details.customAgentName
details.agentDefinitionId
subagent definitionId
agentId
sessionId
```

## 13.5 Add a lightweight projection/slice

Do not require full dashboard summary refresh just to update agent activity.

Recommended:

```text
dashboard-summary { projection: "agentActivity" }
```

or service slice:

```text
/dashboard/slices/agentActivity
```

## 13.6 Keep rendering pure and testable

The dashboard renderer should receive structured data and render HTML without fetching anything.

## 13.7 Update tests first

Add rendering tests for:

- no activity → inferred fallback
- one live main activity
- multiple live activities
- custom agent display name
- subagent definition id
- awaiting approval sorted first
- stale/expired handling
- expanded details hidden by default

---

# 14. What Not To Do

- Do not display raw JSON in the compact card.
- Do not show expired leases as active.
- Do not make derived status look live.
- Do not require agents to provide every field.
- Do not add a large polling loop that refreshes the full dashboard every 2 seconds.
- Do not make the extension mutate task state directly.
- Do not make custom agent identity depend only on session id.
- Do not bury human-gate or policy-approval states below routine working rows.
- Do not make the visual design color-only; use labels/icons/text for accessibility.

---

# 15. Assumptions

- Agent activity leases are the best near-term source for live agent status.
- Existing derived status remains useful as fallback.
- Dashboard service/event stream work may arrive later; first implementation can use targeted polling.
- Custom agents can be encouraged to pass richer `details` through `set-agent-activity`.
- Task titles can be joined from active task store rows where available.
- Subagent registry definition ids are sufficient initial identifiers for custom subagents.

---

# 16. Open Questions

1. Should `agentActivities` live as a top-level dashboard summary field or inside `agentStatus`?
2. Should the renderer show recently expired leases, or hide them entirely?
3. What TTL should agents use by default for near-real-time activity: 60s, 90s, or 120s?
4. Should the main agent be chosen as the freshest lease, a lease with `agentId === workflow-cannon`, or a dedicated role marker?
5. Should subagent definitions have a formal display name registry?
6. Should branch/worktree display be enabled by default or only on expansion?
7. Should agent activity be stored in the same planning SQLite DB long-term, or moved into the future runtime service store?

---

# 17. Recommended Delivery Phases

## Phase A — Contract and data surfacing

Expose all active agent activity leases in dashboard summary, enriched with task titles and safe display metadata.

Exit criteria:

- `agentActivities` or equivalent summary exists.
- Existing `agentStatus` remains compatible.
- Tests prove multiple active leases are returned.

## Phase B — Overview card UX

Replace/enhance the top overview card with the Agent Activity Board.

Exit criteria:

- Main agent row renders.
- Active agents render.
- Needs attention rows sort first.
- Live/Inferred badge displays.
- Freshness labels display.

## Phase C — Near-real-time refresh

Add a lightweight refresh path for agent activity.

Exit criteria:

- Agent activity updates without full dashboard reload.
- Polling interval is 2–5 seconds while visible.
- No measurable full-dashboard slowdown.

## Phase D — Agent instrumentation guidance

Update docs/snippets so agents set useful activity metadata.

Exit criteria:

- Agent-facing instruction exists.
- Example `set-agent-activity` payload includes custom agent metadata.
- Commands/tasks use richer activity where appropriate.

## Phase E — Service/event-stream readiness

Prepare the slice to be swapped to the future dashboard service/event stream.

Exit criteria:

- Slice boundary is clear.
- Renderer is data-source agnostic.
- Future service can feed the same contract.

---

# 18. Work Breakdown Structure

## WP-0 — Inventory and contract decision

### T-AC-001 — Inventory current agent card rendering and data flow

**Type:** research  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase A  
**Value:** Prevents building a duplicate or incompatible status model.

**Scope**

- Locate current overview agent card renderer.
- Trace dashboard data from `dashboard-summary` to render HTML.
- Confirm how `agentStatus`, `teamExecution`, `subagentRegistry`, `taskCheckpoints`, and live leases are currently included.
- Identify tests that cover current rendering.

**Acceptance criteria**

- Notes list current renderer functions and data fields.
- Notes list what the current card displays.
- Notes list missing fields for multi-agent display.

**Testing / evidence**

- Code references.
- Current render test names.

---

### T-AC-002 — Decide `agentActivities` contract shape

**Type:** design / contract  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase A  
**Value:** Establishes stable payload before UI work.

**Scope**

- Decide whether to add top-level `agentActivities` or nest under `agentStatus`.
- Define `DashboardAgentActivityRow` and `DashboardAgentActivitySummary`.
- Include compatibility policy for existing `agentStatus`.
- Include display-name derivation rules.

**Acceptance criteria**

- Contract shape is documented.
- Existing `agentStatus` remains unchanged or backward compatible.
- The contract supports multiple active agents.

**Testing / evidence**

- Type tests or contract fixture.
- Example payload.

---

## WP-1 — Backend data surfacing

### T-AC-101 — Expose all active live activity leases in dashboard summary

**Type:** implementation  
**Priority:** P0  
**Severity:** Critical  
**Suggested phase:** Phase A  
**Value:** Unlocks multi-agent visibility.

**Likely files**

```text
src/contracts/dashboard-summary-run.ts
src/modules/task-engine/dashboard/build-dashboard-base.ts
src/modules/task-engine/agent-activity-store.ts
test/dashboard-*.mjs
```

**Scope**

- Use `listCurrentAgentActivityLeases` rather than only `readCurrentAgentActivityLease`.
- Convert leases into dashboard rows.
- Preserve existing single `agentStatus` behavior.
- Include active count and updatedAt.

**Acceptance criteria**

- Multiple active leases appear in dashboard summary.
- Expired leases are excluded.
- Existing `agentStatus` still works.
- When no live leases exist, derived status remains available.

**Testing / evidence**

- Unit test with zero, one, and multiple leases.
- Snapshot/contract fixture.

---

### T-AC-102 — Enrich activity rows with task title and phase context

**Type:** implementation  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase A  
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

**Testing / evidence**

- Activity with known task.
- Activity with missing/external task.

---

### T-AC-103 — Parse useful custom agent metadata from `details`

**Type:** implementation  
**Priority:** P1  
**Severity:** Medium  
**Suggested phase:** Phase A  
**Value:** Allows custom agents to identify themselves without a new table.

**Scope**

Extract optional fields from details:

```text
agentDisplayName
customAgentName
agentDefinitionId
role
model
origin
currentStep
progressPercent
branch
baseBranch
worktree
ownedPaths
lastCommand
lastCommandStatus
prUrl
pullRequestUrl
evidenceRef
handoffRef
```

**Acceptance criteria**

- Known detail keys appear in structured row fields.
- Unknown detail keys are not rendered in compact card.
- Details parsing is defensive.

**Testing / evidence**

- Fixture with custom agent metadata.
- Fixture with malformed details.

---

## WP-2 — Agent Activity Board UX

### T-AC-201 — Design Agent Activity Board renderer

**Type:** implementation / UI  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase B  
**Value:** Converts data into immediate human understanding.

**Likely files**

```text
extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts
extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs
```

**Scope**

Render sections:

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

**Testing / evidence**

- Render snapshots.
- Accessibility-friendly labels.

---

### T-AC-202 — Add status chips and attention sorting

**Type:** implementation / UI  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase B  
**Value:** Makes action-required states visible first.

**Scope**

- Map `DashboardAgentStatusKind` to human chip labels.
- Sort needs-attention states first.
- Separate routine active agents from attention rows.

**Acceptance criteria**

- Awaiting approval/human gate rows appear before routine work.
- Blocked rows appear in Needs Attention.
- Working/validating/planning rows appear in Active Agents.

**Testing / evidence**

- Render test with mixed statuses.

---

### T-AC-203 — Add freshness labels and stale handling

**Type:** implementation / UI  
**Priority:** P1  
**Severity:** Medium  
**Suggested phase:** Phase B  
**Value:** Prevents stale activity from misleading users.

**Scope**

- Show relative updated time.
- Label stale activities.
- Hide expired activities from active rows.
- Optionally show recently active collapsed rows.

**Acceptance criteria**

- Fresh lease says updated seconds/minutes ago.
- Stale lease is labeled stale.
- Expired lease is not shown as active.

**Testing / evidence**

- Time fixture tests.

---

### T-AC-204 — Add expandable row details

**Type:** implementation / UI  
**Priority:** P2  
**Severity:** Medium  
**Suggested phase:** Phase B  
**Value:** Keeps overview clean while preserving inspectability.

**Scope**

Expanded details may show:

- session id
- activity id
- branch
- worktree
- PR
- command
- model
- role
- raw detail keys, if debug mode

**Acceptance criteria**

- Compact view remains readable.
- Expanded row reveals technical context.
- Raw JSON is hidden unless explicitly expanded/debug.

**Testing / evidence**

- Render test for collapsed/expanded HTML.

---

## WP-3 — Near-real-time updates

### T-AC-301 — Add agent activity dashboard projection/slice

**Type:** implementation  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase C  
**Value:** Enables frequent updates without full dashboard refresh.

**Scope**

Add either:

```text
dashboard-summary { projection: "agentActivity" }
```

or a dashboard service slice:

```text
agentActivity
```

**Acceptance criteria**

- Agent activity can be refreshed independently.
- Projection excludes heavy queue/status rollups.
- Existing full/overview projections remain compatible.

**Testing / evidence**

- Projection test.
- Timing evidence if available.

---

### T-AC-302 — Poll activity slice while dashboard is visible

**Type:** implementation  
**Priority:** P1  
**Severity:** Medium  
**Suggested phase:** Phase C  
**Value:** Makes the panel feel live before the service/event stream exists.

**Scope**

- Poll every 2–5 seconds while overview is visible.
- Pause/defer during mutation locks if needed.
- Patch only the agent activity card/section.

**Acceptance criteria**

- Updating `set-agent-activity` is visible within 5 seconds.
- No full dashboard reload is required.
- Mutations are not blocked by this polling.

**Testing / evidence**

- Manual or automated refresh trace.
- Render patch test if available.

---

### T-AC-303 — Prepare event-stream compatibility

**Type:** architecture / implementation  
**Priority:** P2  
**Severity:** Medium  
**Suggested phase:** Phase E  
**Value:** Avoids rework when dashboard service arrives.

**Scope**

- Keep renderer data-source agnostic.
- Define event payload shape for future service.
- Document update path.

**Acceptance criteria**

- Future service can emit `agentActivity.updated` or slice update events into same renderer contract.

**Testing / evidence**

- Contract note or test fixture.

---

## WP-4 — Agent instrumentation and docs

### T-AC-401 — Add agent-facing activity usage guidance

**Type:** docs  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase D  
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

**Testing / evidence**

- Generated CLI snippets updated if applicable.
- Docs parity if required.

---

### T-AC-402 — Add optional helper snippets/wrappers for common activity kinds

**Type:** implementation / DX  
**Priority:** P2  
**Severity:** Low  
**Suggested phase:** Phase D  
**Value:** Makes agents more likely to report activity correctly.

**Scope**

Optionally add helper command examples or wrappers:

```text
set-agent-working-task
set-agent-validating
set-agent-reviewing-pr
set-agent-blocked
```

This can also remain documentation-only if new commands are not worth it.

**Acceptance criteria**

- Common activity states are easy for agents to set.
- No unnecessary command bloat unless justified.

**Testing / evidence**

- CLI examples.

---

## WP-5 — Validation and hardening

### T-AC-501 — Add comprehensive render fixtures

**Type:** testing  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase B/C  
**Value:** Prevents dashboard regressions.

**Scope**

Fixtures for:

- no activity / inferred fallback
- one live main activity
- multiple live activities
- custom agent metadata
- subagent definition id
- waiting on human gate
- policy approval
- blocked
- validating/reviewing/releasing
- stale/expired leases

**Acceptance criteria**

- Render tests cover all key states.
- Sorting is deterministic.
- HTML is accessible and stable.

**Testing / evidence**

- `pnpm test` or targeted render test.

---

### T-AC-502 — Add dashboard data contract tests

**Type:** testing  
**Priority:** P0  
**Severity:** High  
**Suggested phase:** Phase A  
**Value:** Protects backend summary shape.

**Scope**

- Contract test for multiple current activity leases.
- Contract test for enriched task title.
- Contract test for unknown/missing fields.
- Contract test for live + derived fallback coexistence.

**Acceptance criteria**

- Dashboard summary payload remains versioned and stable.
- Tests fail if multiple activities regress to single activity.

**Testing / evidence**

- Contract test output.

---

# 19. Dependency Summary

```text
T-AC-001 → T-AC-002
T-AC-002 → T-AC-101
T-AC-101 → T-AC-102
T-AC-101 → T-AC-201
T-AC-102 → T-AC-201
T-AC-103 → T-AC-201
T-AC-201 → T-AC-202
T-AC-201 → T-AC-203
T-AC-201 → T-AC-204
T-AC-101 → T-AC-301
T-AC-301 → T-AC-302
T-AC-301 → T-AC-303
T-AC-401 can run after T-AC-002
T-AC-501 depends on T-AC-201
T-AC-502 depends on T-AC-101
```

---

# 20. Recommended Work Order

1. T-AC-001 — Inventory current rendering/data flow.
2. T-AC-002 — Decide contract shape.
3. T-AC-101 — Expose all active leases.
4. T-AC-102 — Enrich with task titles/phase context.
5. T-AC-502 — Add contract tests.
6. T-AC-201 — Render Agent Activity Board.
7. T-AC-202 — Add status chips and attention sorting.
8. T-AC-203 — Add freshness/stale handling.
9. T-AC-501 — Add render fixtures.
10. T-AC-301 — Add lightweight activity projection/slice.
11. T-AC-302 — Poll/patch near-real-time.
12. T-AC-401 — Add agent-facing docs and examples.
13. T-AC-204 — Add expandable details.
14. T-AC-303 — Prepare service/event-stream compatibility.
15. T-AC-402 — Optional helper snippets/wrappers.

---

# 21. Final Acceptance Criteria

This plan is complete when:

- The dashboard overview has an Agent Activity panel/card.
- The panel shows multiple active agents, not only one inferred status.
- Custom agents can be identified when they provide metadata.
- Subagent sessions can be identified by definition/session/task.
- Main agent status remains clear.
- Human intervention states are visually prioritized.
- Live vs inferred status is clearly labeled.
- Freshness is shown and stale activity is not misleading.
- Agent activity updates within 5 seconds while the dashboard is visible.
- The renderer is tested with representative multi-agent states.
- Agent docs show how to provide richer activity data.

---

# 22. Task Generation Payload Hints

When converting this plan into Workflow Cannon tasks, use task metadata like:

```json
{
  "planRef": "AGENT_CARD_PLAN.md",
  "planArea": "dashboard-agent-activity",
  "wbsId": "T-AC-101",
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
multi-agent
extension-ui
task-engine
near-real-time
```

---

# 23. Final Recommendation

Do this. The current backend already has the seed of the right design. The most important step is to expose all current live activity leases and redesign the overview card around them.

The winning product pattern is:

```text
Agent Activity Board
  = live leases first
  + derived fallback
  + attention-first sorting
  + custom agent identity
  + near-real-time slice refresh
```

This will make Workflow Cannon feel less like a task dashboard and more like a real multi-agent operating console.
