# AGENT_ORCHESTRATION_FOUNDATION.md

## Purpose

This document defines the Workflow Cannon agent orchestration foundation.

It is separate from the Agent Activity Dashboard UX plan. This document defines the underlying agent model, orchestration boundaries, contracts, profiles, activity rules, and future-work path that make the dashboard possible.

The long-term goal is host-agnostic orchestration across compatible systems such as Cursor, VS Code, CLI-driven agents, MCP-connected tools, future local services, manual/human workflows, and other agent hosts.

For v1, Workflow Cannon does **not** directly launch or control agents. Instead, it defines and records agents, sessions, assignments, activity, and handoffs so an Orchestration Agent can coordinate work by prompting agents and using Workflow Cannon commands.

---

## Goals

As a Workflow Cannon user, I want:

1. To always know what all agents and subagents are doing.
2. Agents to work efficiently through orchestration.
3. The right model/cost tier to be used for each task.
4. Each agent to have appropriate access, context, and Workflow Cannon knowledge.
5. Agent handoffs to be compact, structured, and complete enough for continuation.
6. The system to remain host-agnostic and future-compatible.
7. The dashboard UX plan to consume this foundation without owning orchestration state.

---

## Core Design Principle

Workflow Cannon uses strict separation between identity, responsibility, and live status.

```text
Agent Registry says who the agent is.
Assignment / Orchestration says what the agent owes.
Activity / Visibility says what the agent is doing right now.
```

This separation is mandatory. Do not collapse definitions, assignments, and activity into one record.

---

# 1. Three-Layer Architecture

## Decision

Use strict separation between the three agent layers.

## Layer 1 — Agent Registry

Purpose:

```text
Define who/what agents are.
```

Owns:

- agent definitions
- roles
- host compatibility
- required/optional capabilities
- allowed commands
- access profile reference
- context profile reference
- model profile reference
- handoff contract reference
- activity contract reference
- version/retirement metadata

Does not own:

- current assignment state
- current heartbeat/status
- worker handoff results

## Layer 2 — Assignment / Orchestration

Purpose:

```text
Define what work agents owe.
```

Owns:

- supervisor/worker relationship
- assignment lifecycle
- linked task/subtask
- assignment scope
- blockers
- handoff submission
- reconciliation
- cancellation
- resource/file ownership metadata
- model/context/access choices for the assignment

Does not own:

- reusable agent identity
- live heartbeat/status
- dashboard rendering

## Layer 3 — Activity / Visibility

Purpose:

```text
Define what agents are doing right now.
```

Owns:

- live status
- heartbeat/freshness
- current step/command
- active host/model hint
- active task/assignment pointers
- stale/expired state

Does not own:

- durable assignment history
- final evidence/handoff
- reusable agent definition

---

# 2. Core Agent Types

## 2.1 Orchestration Agent

## Decision

Use an **Assignment Orchestrator**.

The Orchestration Agent can create and manage assignments through Workflow Cannon commands, but it does not directly implement code unless explicitly assigned as a worker.

### Purpose

```text
Plan, split, assign, monitor, reconcile, and optimize multi-agent work.
```

### Responsibilities

- inspect phase/task state
- identify ready, blocked, and risky work
- split work into safe assignments
- choose worker type and model/cost tier
- set context/access/model profiles for assignments
- create assignments
- monitor activity and handoffs
- respond to blockers
- reconcile completed handoffs
- cancel or supersede bad assignments
- report human decisions needed

### Allowed by default

- read phase status
- read task queue
- read assignment state
- read agent/subagent definitions
- read active activity summary
- create assignments
- block/cancel/reconcile assignments
- create orchestration/planning tasks
- create blocker-resolution assignments
- choose model/context/access profiles
- record or request subagent/session records

### Not allowed by default

- edit implementation files
- bypass policy approvals
- hand-edit SQLite or task state
- directly complete worker implementation tasks without evidence
- override worker file ownership without an explicit reason
- directly launch/control host-specific agents unless a compatible tool exists later

---

## 2.2 Task Work Agent

## Decision

Use a **Strict Bounded Worker**.

The Task Work Agent completes one assigned task/subtask within explicit scope.

### Purpose

```text
Complete one bounded assignment efficiently and return a structured handoff.
```

### Responsibilities

- read assigned context
- implement only assigned scope
- modify owned paths only
- run approved validation commands
- maintain live activity
- report blockers early
- open ready blocking tasks or bug reports when needed
- submit structured handoff

### Allowed by default

- read assigned task/context
- modify owned paths
- run allowed validation commands
- set/update/clear own activity
- submit own assignment handoff
- report/block own assignment
- create ready blocking task tied to assignment
- create bug report tied to assignment

### Not allowed by default

- expand scope without approval
- modify shared/global files unless listed
- create broad unrelated tasks
- change architecture
- reconcile assignments
- cancel assignments
- unblock itself
- assign other agents
- mutate phase plan broadly

### Worker blocker flow

```text
Worker discovers blocker
→ Worker opens ready blocking task or bug report linked to assignment/task
→ Worker marks/reports its assignment blocked
→ Worker reports back to Orchestrator
→ Orchestrator reviews blocker
→ Orchestrator assigns/resolves blocker
→ Orchestrator tells worker when unblocked
→ Worker continues only after Orchestrator resumes it
```

---

# 3. AgentDefinition v1

## Decision

Use a practical, host-agnostic `AgentDefinition` with profile references.

## Shape

```json
{
  "agentDefinitionId": "task-worker",
  "displayName": "Task Work Agent",
  "description": "Completes one bounded assignment.",
  "role": "task_worker",
  "hostCompatibility": ["cursor", "vscode", "cli", "manual"],
  "requiredCapabilities": [
    "read_context",
    "edit_owned_files",
    "run_allowed_commands",
    "submit_handoff"
  ],
  "optionalCapabilities": [
    "report_activity",
    "open_blocking_task",
    "open_bug_report"
  ],
  "allowedCommands": [
    "set-agent-activity",
    "submit-assignment-handoff",
    "block-assignment"
  ],
  "accessProfileId": "task_worker_strict_v1",
  "contextProfileId": "task_worker_context_v1",
  "modelProfileId": "balanced_or_cheaper_v1",
  "handoffContractId": "implementation_handoff_v2",
  "activityContractId": "agent_activity_v1",
  "metadata": {},
  "retired": false,
  "version": 1
}
```

## Required fields

- agentDefinitionId
- displayName
- description
- role
- hostCompatibility
- requiredCapabilities
- optionalCapabilities
- allowedCommands
- accessProfileId
- contextProfileId
- modelProfileId
- handoffContractId
- activityContractId
- retired
- version

---

# 4. AgentSession v1

## Decision

Use a practical `AgentSession` that links identity, host, model, and current pointers.

The session does not own work or live status.

```text
Session links identity, host, model, and current pointers.
Assignment owns work.
Activity owns live status.
```

## Shape

```json
{
  "sessionId": "session-abc123",
  "agentDefinitionId": "task-worker",
  "agentId": "dashboard-worker-1",
  "hostHint": "cursor",
  "hostSessionRef": "cursor-tab-abc123",
  "status": "active",
  "modelTier": "balanced",
  "modelHint": "gpt-5.5-thinking",
  "currentAssignmentId": "A123",
  "currentTaskId": "T100621",
  "currentActivityId": "activity-789",
  "startedAt": "2026-05-30T00:00:00.000Z",
  "updatedAt": "2026-05-30T00:10:00.000Z",
  "metadata": {}
}
```

## Suggested statuses

```text
open
idle
active
blocked
closing
closed
stale
```

---

# 5. Assignment / Orchestration Record

## Decision

Keep TeamAssignment as the current storage/command module. Evolve it conceptually into `AgentAssignment` through structured metadata.

```text
TeamAssignment = current implementation.
AgentAssignment = conceptual contract.
metadata.schemaVersion = structured bridge.
```

Do not create a new AgentAssignment module yet.

## Structured assignment metadata v1

```json
{
  "schemaVersion": 1,
  "agentDefinitionId": "task-worker",
  "agentSessionId": "session-abc123",
  "modelTier": "balanced",
  "contextProfileId": "task_worker_context_v1",
  "accessProfileId": "task_worker_strict_v1",
  "handoffContractId": "implementation_handoff_v2",
  "ownedPaths": ["src/modules/task-engine/dashboard/**"],
  "forbiddenPaths": ["extensions/cursor-workflow-cannon/**"],
  "sharedPaths": [],
  "assignmentPromptSummary": "Implement the projection builder only.",
  "blockingPolicy": "worker_may_open_blocking_task_and_report"
}
```

## Current statuses retained for v1

```text
assigned
submitted
blocked
reconciled
cancelled
```

Use `AgentActivity` to show whether the worker is actively working, idle, stale, blocked, or validating.

---

# 6. Task DB Mutation Authority

## Decision

Use tiered mutation authority.

```text
Orchestrator owns strategic task/assignment lifecycle.
Worker owns scoped reporting, activity, handoff, and blocker/bug creation tied to its assignment.
```

## Orchestration Agent may

- create assignments
- block assignments
- cancel assignments
- reconcile submitted assignments
- create planned phase tasks
- create orchestration/planning tasks
- create blocker-resolution assignments
- transition tasks through lifecycle where authorized
- approve continuation after blockers resolve
- reprioritize/resequence work

## Task Work Agent may

- set/update/clear own activity
- submit own assignment handoff
- mark/report own assignment blocked
- create ready blocking tasks tied to its assignment
- create bug reports tied to its assignment
- add evidence to its own handoff

## Task Work Agent may not

- complete parent tasks directly
- reconcile assignments
- cancel assignments
- unblock itself
- modify unrelated tasks
- reprioritize phase work
- create broad new feature tasks
- mutate task state outside assignment scope

## Future Work: Capability-Based Mutation Authority

A future phase should convert role-based v1 rules into explicit capability profiles, such as:

- orchestrator_access_v1
- task_worker_strict_v1
- reviewer_access_v1
- validator_access_v1

Each profile should declare exact allowed mutations:

- task.create_blocking_task
- task.create_bug_report
- task.transition.start
- task.transition.complete
- assignment.register
- assignment.submit_handoff
- assignment.block
- assignment.reconcile
- assignment.cancel
- activity.set
- activity.clear

---

# 7. Activity Contract v1

## Decision

Use a practical activity contract.

Activity records live status plus enough linkage for orchestration and dashboard projection.

```text
Activity answers: What is this agent doing right now?
Assignment answers: What does this agent owe?
Handoff answers: What happened and what evidence proves it?
```

## Shape

```json
{
  "activityId": "act-123",
  "agentId": "dashboard-worker",
  "agentDefinitionId": "task-worker",
  "sessionId": "session-abc",
  "assignmentId": "A123",
  "taskId": "T100621",
  "phaseKey": "121",
  "kind": "working_task",
  "label": "Running projection builder tests",
  "currentStep": "Running tests",
  "command": "pnpm test -- dashboard-agent-activity-summary",
  "hostHint": "cursor",
  "modelTier": "balanced",
  "modelHint": "gpt-5.5-thinking",
  "startedAt": "2026-05-30T00:00:00.000Z",
  "updatedAt": "2026-05-30T00:10:00.000Z",
  "expiresAt": "2026-05-30T00:11:30.000Z",
  "details": {}
}
```

## Minimum required fields

- activityId
- agentId
- sessionId
- kind
- label
- updatedAt
- expiresAt

## Required when applicable

- agentDefinitionId
- assignmentId
- taskId
- phaseKey
- hostHint
- modelTier

---

# 8. Activity Lifecycle Rules

## Decision

Use required lifecycle rules now; add command-boundary automation later.

## Required v1 lifecycle

```text
assignment accepted → set activity
step changes → update activity
long work → heartbeat every 30s
blocked → set blocked activity + report/block assignment
handoff submitted → short terminal activity + handoff
assignment reconciled/cancelled/session closed → clear activity or allow short expiry
```

## Timing policy

```text
heartbeat interval: 30 seconds
default activity TTL: 90 seconds
fresh: updated <= 30s
aging: updated <= 60s
stale: updated > 60s but not expired
expired: now >= expiresAt
```

## Future Work: Command-Boundary Activity Hooks

A later phase should add automatic activity updates at known Workflow Cannon command boundaries:

- assignment accepted
- run-transition start
- validation commands
- review commands
- block-assignment
- submit-assignment-handoff
- reconcile-assignment
- cancel-assignment

---

# 9. Handoff v2 Contract

## Decision

Use a practical structured handoff.

The handoff should let the Orchestrator decide whether to reconcile, request rework, assign a blocker, assign review, cancel, or supersede without rereading the entire transcript.

## Shape

```json
{
  "schemaVersion": 2,
  "assignmentId": "A123",
  "agentId": "dashboard-worker",
  "agentDefinitionId": "task-worker",
  "status": "completed",
  "summary": "Implemented the Agent Activity projection builder and tests.",
  "filesChanged": [
    {
      "path": "src/modules/task-engine/dashboard/build-dashboard-agent-activity-summary.ts",
      "reason": "New projection builder."
    }
  ],
  "commandsRun": [
    {
      "command": "pnpm test -- dashboard-agent-activity-summary",
      "status": "passed",
      "summary": "Projection tests passed."
    }
  ],
  "acceptanceCriteria": [
    {
      "criterion": "Multiple active leases project into multiple rows.",
      "status": "passed",
      "evidence": "dashboard-agent-activity-summary.test.mjs"
    }
  ],
  "evidenceRefs": [
    "test:dashboard-agent-activity-summary"
  ],
  "blockers": [],
  "risks": [
    {
      "risk": "Future AgentSession source is not implemented yet.",
      "severity": "low",
      "recommendation": "Add fixture when AgentSession lands."
    }
  ],
  "nextRecommendedAction": "Proceed to render compact Agent Activity Board."
}
```

## Required fields

- schemaVersion
- assignmentId
- agentId
- status
- summary
- evidenceRefs

## Valid statuses

```text
completed
blocked
partial
failed
needs_review
```

---

# 10. Context Profiles

## Decision

Use explicit role-based minimal context profiles now.

Track dynamic context assembly as future work.

## Orchestrator context profile v1

Required:

- current phase/status
- ready/blocked/in-progress task queue
- assignment state
- agent/subagent definitions
- active agent activity summary
- blockers/dependencies
- recent worker handoffs
- relevant plan document

Optional:

- dashboard/status summary
- cost/model profile table
- recent failed validations

## Task worker context profile v1

Required:

- assignment record
- task id/title/status
- task description
- acceptance criteria
- owned paths
- forbidden/shared paths
- relevant docs/code references
- allowed commands
- activity lifecycle rules
- handoff v2 format

Optional:

- narrow architecture note
- failing test output
- related blocker task

## Future Work: Dynamic Context Assembly

A later phase should create a context assembler that builds the smallest sufficient context bundle based on:

- task type
- module/component
- complexity
- risk
- model tier
- file ownership
- dependency graph
- recent handoffs
- failed validations
- related blockers

---

# 11. Access / Capability Profiles

## Decision

Use reusable access profiles now.

Track granular per-agent capability enforcement as future work.

## Orchestrator access profile v1

Allowed:

- read phase/task/assignment/activity/registry state
- create assignments
- block assignments
- cancel assignments
- reconcile submitted assignments
- create orchestration/planning tasks
- create blocker-resolution assignments
- choose model/context profiles
- request or spawn host-managed subagent sessions by recording them

Not allowed by default:

- edit implementation files
- directly complete worker implementation tasks without evidence
- bypass policy approvals
- mutate DB manually
- override worker file ownership without explicit reason

## Task worker strict access profile v1

Allowed:

- read assigned context
- modify owned paths only
- run allowed validation commands
- set/update/clear own activity
- submit own handoff
- report/block own assignment
- create ready blocking task tied to assignment
- create bug report tied to assignment

Not allowed:

- reconcile assignments
- cancel assignments
- unblock itself
- modify unrelated tasks
- mutate phase plan broadly
- assign other agents
- edit forbidden/shared paths without approval

## Future Work: Granular Capability-Based Access

A later phase should evolve reusable access profiles into enforceable granular capabilities:

- task.create_blocking_task
- task.create_bug_report
- task.transition.start
- task.transition.complete
- assignment.register
- assignment.submit_handoff
- assignment.block
- assignment.reconcile
- assignment.cancel
- activity.set
- activity.clear
- files.modify.owned_paths
- files.modify.shared_paths
- files.modify.forbidden_paths
- command.run.allowed
- command.run.requires_approval

This should integrate with Workflow Cannon policy, file ownership checks, assignment metadata, host/tool capabilities, and future agent runtime integrations.

---

# 12. Model / Cost Tiers

## Decision

Use model tier labels plus a lightweight routing rubric now.

Track a full model router as future work.

## V1 tiers

```text
cheap_fast
balanced
high_reasoning
specialist
human_review
```

## Tier guidance

### cheap_fast

Use for:

- file inventory
- docs cleanup
- mechanical edits
- simple tests
- formatting
- low-risk bug fixes with narrow scope

### balanced

Use for:

- normal feature implementation
- dashboard UI changes
- moderate test writing
- bounded refactors
- ordinary bug fixing

### high_reasoning

Use for:

- architecture decisions
- schema/database changes
- sync/concurrency
- task-engine lifecycle changes
- cross-module changes
- ambiguous debugging

### specialist

Use for:

- UX specialist
- backend sync specialist
- testing/validation specialist
- docs specialist
- security/review specialist

### human_review

Use for:

- destructive changes
- policy/security-sensitive changes
- ambiguous product decisions
- irreversible migrations
- major architecture direction

## Routing rubric inputs

- complexity
- risk
- ambiguity
- file count
- architecture impact
- schema/migration impact
- test difficulty
- security/policy sensitivity
- expected context size
- need for deep reasoning

## Future Work: Full Model Router

A later phase should map model tiers to actual models/providers per host, estimate cost, track actual usage, support fallback models, and let the Orchestration Agent optimize for budget, speed, and quality.

Future router should support:

- host-specific model availability
- preferred provider/model by tier
- fallback chains
- max token/context budget
- estimated cost
- actual cost/usage telemetry
- quality/success feedback
- per-agent model constraints

---

# 13. Host Compatibility Model

## Decision

Use host labels plus required/optional capabilities.

Track a formal Host Adapter Registry as future work.

## Core rule

```text
Host labels are hints.
Capabilities are what matter.
```

## V1 host labels

```text
cursor
vscode
cli
codex
mcp
service
manual
unknown
```

## V1 capability vocabulary

```text
read_context
edit_files
run_commands
submit_handoff
report_activity
receive_assignment
record_subagent_session
spawn_subagents
open_pr
read_git_diff
write_task_state
stream_activity
```

## Future Work: Host Adapter Registry

A later phase should define host adapters that advertise actual capabilities for Cursor, VS Code, CLI, service, MCP, and other systems.

The Orchestration Agent should eventually route assignments based on:

- required capabilities
- host availability
- model support
- cost
- active sessions
- current workload
- expected handoff quality

---

# 14. Resource / File Ownership Model

## Decision

Use structured assignment resource rules now.

Track full Resource Lock Manager as future work.

## V1 shape

```json
{
  "resources": {
    "ownedPaths": [
      "src/modules/task-engine/dashboard/**"
    ],
    "readOnlyPaths": [
      ".ai/**",
      "docs/maintainers/**"
    ],
    "sharedPaths": [
      "src/contracts/dashboard-summary-run.ts"
    ],
    "forbiddenPaths": [
      "package.json",
      "pnpm-lock.yaml"
    ],
    "requiresApprovalPaths": [
      "src/contracts/**",
      "src/core/state/**"
    ]
  },
  "lockScope": {
    "tasks": ["T100621"],
    "modules": ["task-engine.dashboard"],
    "commands": []
  }
}
```

## Rules

```text
ownedPaths = worker may modify
readOnlyPaths = worker may inspect but not change
sharedPaths = worker may change only with coordination
forbiddenPaths = worker must not touch
requiresApprovalPaths = worker must stop and ask before editing
lockScope = collision-awareness metadata
```

## Future Work: Resource Lock Manager

A later phase should add enforceable resource locks with:

- lease expiration
- conflict detection
- branch/worktree awareness
- task/module ownership checks
- dashboard visibility
- stale lock cleanup
- assignment integration
- access-profile enforcement
- command-policy integration

---

# 15. Dashboard / Activity Projection Implications

## Decision

Use a stable projection layer.

The dashboard displays agent orchestration state. It does not own or mutate orchestration state.

## Projection sources

- AgentDefinition
- AgentSession
- TeamAssignment / AgentAssignment
- AgentActivity
- SubagentSession
- Handoff summaries
- Resource ownership metadata
- Model tier metadata
- Host hints/capabilities

## Projection output

```text
DashboardAgentActivitySummary
```

The Agent Activity Dashboard UX plan should consume this projection and should not depend on raw orchestration tables.

## Future Work: Event-Stream Activity Projection

When the Workflow Cannon runtime service exists, agent/session/assignment/activity changes should emit events into a live projection store. The dashboard should subscribe to projection updates rather than polling command outputs.

This should eventually support:

- near-real-time updates
- stale activity detection
- assignment status updates
- subagent session updates
- handoff submission updates
- model/cost usage updates
- host/session availability updates

---

# 16. V1 Non-Goals

## Decision

Use explicit v1 non-goals to prevent scope explosion.

## V1 does build / define

- host-agnostic agent definitions
- practical agent sessions
- TeamAssignment-as-AgentAssignment metadata
- tiered mutation authority
- activity contract/lifecycle
- handoff v2
- access profiles
- context profiles
- model/cost tiers
- host compatibility model
- resource ownership metadata
- dashboard projection contract

## V1 does not build

- automatic Cursor subagent launching
- automatic VS Code agent launching
- cross-host process control
- real-time process supervision
- hard runtime sandboxing
- fully automated model/provider routing
- automatic PR merge/reconciliation
- automatic file lock enforcement
- token/cost telemetry collection
- full host adapter registry
- full resource lock manager
- full event-stream runtime service

---

# 17. Future Work Buckets

The following items are explicitly out of scope for v1 but should each become their own plan when delivered.

## 17.1 Host Adapter Registry

Advertise actual capabilities for Cursor, VS Code, CLI, service, MCP, manual, and future hosts.

## 17.2 Full Model Router

Map tiers to actual providers/models, estimate cost, track usage, and optimize for budget/speed/quality.

## 17.3 Granular Capability Enforcement

Compile access profiles into enforceable command/file/task/policy capabilities.

## 17.4 Resource Lock Manager

Enforce file/module/task locks with leases, conflict detection, and dashboard visibility.

## 17.5 Event-Stream Activity Projection

Move activity projection to a live runtime service event stream.

## 17.6 Dynamic Context Assembly

Build minimal sufficient context bundles based on task type, risk, model tier, and dependency graph.

## 17.7 Command-Boundary Activity Hooks

Automatically set/update/clear activity around common Workflow Cannon commands.

---

# 18. Recommended Implementation Phases

## Phase 0 — Contract documentation and alignment

Deliver:

- this document
- profile definitions
- example Orchestration Agent definition
- example Task Work Agent definition
- example assignment metadata
- handoff v2 examples
- activity v1 examples

## Phase 1 — Store/contract bridge

Deliver:

- AgentDefinition v1 schema or registry extension
- AgentSession v1 record path
- structured TeamAssignment metadata validator
- Handoff v2 validator
- Activity v1 validator

## Phase 2 — Orchestration command support

Deliver:

- assignment registration using structured metadata
- worker handoff v2 submission
- worker blocker/bug creation path
- orchestrator reconcile/block/cancel flow updates

## Phase 3 — Activity reporting and projection

Deliver:

- activity contract use in current commands
- agent activity projection source model
- dashboard projection support
- stale/expired activity handling

## Phase 4 — Docs and agent prompts

Deliver:

- Orchestration Agent prompt/contract
- Task Work Agent prompt/contract
- context profile documentation
- access profile documentation
- model tier routing rubric
- host compatibility guidance

---

# 19. Recommended First Agent Definitions

## 19.1 Orchestration Agent

```json
{
  "agentDefinitionId": "orchestration-agent",
  "displayName": "Orchestration Agent",
  "description": "Plans, assigns, monitors, reconciles, and optimizes multi-agent work.",
  "role": "orchestrator",
  "hostCompatibility": ["cursor", "vscode", "cli", "manual"],
  "requiredCapabilities": [
    "read_context",
    "receive_assignment",
    "submit_handoff",
    "report_activity",
    "write_task_state"
  ],
  "optionalCapabilities": [
    "record_subagent_session",
    "spawn_subagents",
    "open_pr"
  ],
  "allowedCommands": [
    "set-agent-activity",
    "register-assignment",
    "block-assignment",
    "cancel-assignment",
    "reconcile-assignment",
    "list-assignments",
    "list-subagents",
    "spawn-subagent",
    "message-subagent"
  ],
  "accessProfileId": "orchestrator_access_v1",
  "contextProfileId": "orchestrator_context_v1",
  "modelProfileId": "high_reasoning_or_balanced_v1",
  "handoffContractId": "orchestration_handoff_v2",
  "activityContractId": "agent_activity_v1",
  "metadata": {},
  "retired": false,
  "version": 1
}
```

## 19.2 Task Work Agent

```json
{
  "agentDefinitionId": "task-worker",
  "displayName": "Task Work Agent",
  "description": "Completes one bounded assignment with strict scope and structured handoff.",
  "role": "task_worker",
  "hostCompatibility": ["cursor", "vscode", "cli", "manual"],
  "requiredCapabilities": [
    "read_context",
    "edit_files",
    "run_commands",
    "submit_handoff",
    "report_activity"
  ],
  "optionalCapabilities": [
    "open_blocking_task",
    "open_bug_report",
    "read_git_diff"
  ],
  "allowedCommands": [
    "set-agent-activity",
    "submit-assignment-handoff",
    "block-assignment"
  ],
  "accessProfileId": "task_worker_strict_v1",
  "contextProfileId": "task_worker_context_v1",
  "modelProfileId": "balanced_or_cheaper_v1",
  "handoffContractId": "implementation_handoff_v2",
  "activityContractId": "agent_activity_v1",
  "metadata": {},
  "retired": false,
  "version": 1
}
```

---

# 20. Final Summary

Workflow Cannon’s agent foundation should be host-agnostic, assignment-centered, activity-visible, cost-aware, and profile-driven.

The v1 architecture is:

```text
AgentDefinition
  says who the agent is and what profile contracts apply.

AgentSession
  says where/how the agent is currently participating.

TeamAssignment / AgentAssignment metadata
  says what work the agent owes and what scope applies.

AgentActivity
  says what the agent is doing right now.

Handoff v2
  says what happened, what evidence proves it, and what should happen next.

DashboardAgentActivitySummary
  displays the current agent/work state without owning it.
```

This gives Workflow Cannon the right foundation for prompt-based orchestration now and tool-backed multi-host orchestration later.
