# AGENT_ORCHESTRATION_CONTRACTS.md

**Artifact:** A-SCHEMA (orchestration contract pack)  
**WBS:** WBS-AO-020 / task **T100625**  
**Requires:** [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md), [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md), [AGENT_ORCHESTRATION_INVENTORY.md](./AGENT_ORCHESTRATION_INVENTORY.md)  
**Blocks:** A-COMMANDS (T100626), TypeScript contracts (T-AO-110), validators, command updates  
**Produced:** 2026-05-31  
**Status:** Draft for human approval — validators and command handlers must not enforce contested shapes until sign-off below.

---

## 1. Purpose

This document is the **machine-oriented contract pack** for Workflow Cannon agent orchestration v1. It defines JSON shapes, enums, required vs optional fields, example payloads, and **malformed / unknown-field behavior** for:

| Contract | Version | Storage bridge (v1) |
| --- | --- | --- |
| **AgentDefinition** | v1 | `kit_subagent_definitions` + `metadata.agentDefinition` |
| **AgentSession** | v1 | `kit_subagent_sessions` + `metadata.agentSession` |
| **Assignment metadata** | v1 | `kit_team_assignments.metadata` when `schemaVersion === 1` |
| **AgentActivity** | v1 | `kit_agent_activity_leases` |
| **Handoff** | v2 | `kit_team_assignments.handoff` when `schemaVersion === 2` |

Normative intent lives in **AGENT_ORCHESTRATION_FOUNDATION.md**; storage and module mapping in **AGENT_ORCHESTRATION_ARCHITECTURE.md**; as-built commands in **AGENT_ORCHESTRATION_INVENTORY.md**.

JSON Schema files (draft 2020-12) live under `schemas/agent-orchestration/`. Golden fixtures live under `fixtures/agent-orchestration/`.

---

## 2. Common identifiers and enums

### 2.1 Identifier fields

| Field | Pattern | Description |
| --- | --- | --- |
| `agentDefinitionId` | `^[a-z][a-z0-9-]*$` | Stable role contract id (e.g. `orchestration-agent`, `task-worker`). |
| `sessionId` | `^session-[a-zA-Z0-9._-]+$` | Host-scoped session row id. |
| `agentId` | opaque string | **Instance** id (e.g. `phase-126-delivery-worker`, `dashboard-worker-1`). Distinct from `agentDefinitionId`. |
| `assignmentId` | opaque string | Team assignment row id (`kit_team_assignments.id`). |
| `activityId` | opaque string | Activity lease id; convention `current:<agentId>:<sessionId>`. |
| `taskId` | `^T[0-9]+$` | Task-engine execution task id. |
| `phaseKey` | numeric string | Workspace kit phase number (e.g. `"126"`). |
| `*ProfileId` | `^[a-z][a-z0-9_]*$` | Profile catalog reference (A-PROFILES, future). |
| `handoffContractId` | string | Names expected handoff shape (e.g. `implementation_handoff_v2`). |
| `activityContractId` | string | Names expected activity shape (e.g. `agent_activity_v1`). |

### 2.2 Agent roles (`AgentDefinition.role`)

```text
orchestrator
task_worker
reviewer
validator
supervisor
manual
unknown
```

### 2.3 Host compatibility labels (`hostCompatibility[]`)

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

### 2.4 Capability vocabulary

**Required / optional capability strings** on definitions (foundation §13):

```text
read_context
edit_files
edit_owned_files
run_commands
run_allowed_commands
submit_handoff
report_activity
receive_assignment
record_subagent_session
spawn_subagents
open_pr
read_git_diff
write_task_state
open_blocking_task
open_bug_report
stream_activity
```

Validators **must** accept the superset above; unknown capability strings in strict mode produce **`unknown-capability`** advisory warnings (not hard fail in v1 bridge).

### 2.5 Model tiers

```text
cheap_fast
balanced
high_reasoning
specialist
human_review
```

### 2.6 Team assignment status (unchanged v1)

```text
assigned
submitted
blocked
reconciled
cancelled
```

### 2.7 Agent session status

```text
open
idle
active
blocked
closing
closed
stale
```

### 2.8 Activity kinds (`AgentActivity.kind`)

Aligned with `DASHBOARD_AGENT_STATUS_KINDS` in `src/modules/task-engine/agent-activity-store.ts`:

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

### 2.9 Handoff v2 terminal statuses

```text
completed
blocked
partial
failed
needs_review
```

### 2.10 Command run status (Handoff v2 `commandsRun[].status`)

```text
passed
failed
skipped
not_run
```

### 2.11 Acceptance criterion status (Handoff v2)

```text
passed
failed
partial
not_applicable
```

### 2.12 Risk severity (Handoff v2)

```text
low
medium
high
critical
```

---

## 3. AgentDefinition v1

### 3.1 Decision

Reusable, host-agnostic agent identity with profile references. Stored via **subagents** registry (architecture §3).

### 3.2 JSON Schema

See `schemas/agent-orchestration/agent-definition.v1.json`.

### 3.3 Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `agentDefinitionId` | string | Stable id; see §2.1 |
| `displayName` | string | Human label |
| `description` | string | May be empty |
| `role` | enum | §2.2 |
| `hostCompatibility` | string[] | Min length 1 |
| `requiredCapabilities` | string[] | May be empty |
| `optionalCapabilities` | string[] | May be empty |
| `allowedCommands` | string[] | Workflow Cannon command names |
| `accessProfileId` | string | §2.1 |
| `contextProfileId` | string | §2.1 |
| `modelProfileId` | string | §2.1 |
| `handoffContractId` | string | §2.1 |
| `activityContractId` | string | §2.1 |
| `retired` | boolean | |
| `version` | integer | Must be `1` for this contract |

### 3.4 Optional fields

| Field | Type | Notes |
| --- | --- | --- |
| `metadata` | object | Extension bag; `additionalProperties: true` in bridge mode |

### 3.5 Bridge storage

Until orchestration DDL lands (architecture §3.2), pack the full shape under:

```json
{
  "schemaVersion": 1,
  "agentDefinition": { "... AgentDefinition v1 ..." }
}
```

on `kit_subagent_definitions.metadata_json`. Readers prefer top-level columns when present.

### 3.6 Examples

**Orchestration Agent** — fixture: `fixtures/agent-orchestration/agent-definition-orchestration-agent.v1.json`

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

**Task Work Agent** — fixture: `fixtures/agent-orchestration/agent-definition-task-worker.v1.json`

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

## 4. AgentSession v1

### 4.1 Decision

Links identity, host, model, and current pointers. **Does not** own assignment lifecycle or live TTL status (foundation §4).

### 4.2 JSON Schema

See `schemas/agent-orchestration/agent-session.v1.json`.

### 4.3 Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `sessionId` | string | §2.1 |
| `agentDefinitionId` | string | Role contract |
| `agentId` | string | Instance id |
| `status` | enum | §2.7 |
| `startedAt` | ISO-8601 | |
| `updatedAt` | ISO-8601 | |

### 4.4 Optional fields

| Field | Type | When used |
| --- | --- | --- |
| `hostHint` | string | §2.3 label |
| `hostSessionRef` | string | Opaque host tab/window ref |
| `modelTier` | enum | §2.5 |
| `modelHint` | string | Provider/model string when known |
| `currentAssignmentId` | string | Active assignment |
| `currentTaskId` | string | Linked execution task |
| `currentActivityId` | string | Linked activity lease |
| `metadata` | object | Bridge extensions |

### 4.5 Example (Task Work Agent session)

Fixture: `fixtures/agent-orchestration/agent-session-task-worker.v1.json`

```json
{
  "sessionId": "session-abc123",
  "agentDefinitionId": "task-worker",
  "agentId": "phase-126-delivery-worker",
  "hostHint": "cursor",
  "hostSessionRef": "cursor-tab-abc123",
  "status": "active",
  "modelTier": "balanced",
  "modelHint": "gpt-5.5-high",
  "currentAssignmentId": "A-phase126-T100625",
  "currentTaskId": "T100625",
  "currentActivityId": "current:phase-126-delivery-worker:default",
  "startedAt": "2026-05-31T08:26:44.738Z",
  "updatedAt": "2026-05-31T08:28:55.229Z",
  "metadata": {}
}
```

---

## 5. Structured assignment metadata v1

### 5.1 Decision

**TeamAssignment** remains storage; `AgentAssignment` is the conceptual contract implemented through `metadata` when `schemaVersion === 1` (architecture §4).

### 5.2 JSON Schema

See `schemas/agent-orchestration/assignment-metadata.v1.json`.

### 5.3 Required fields (strict mode)

When `metadata.schemaVersion === 1`:

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | integer | Must be `1` |
| `agentDefinitionId` | string | Role contract |
| `contextProfileId` | string | |
| `accessProfileId` | string | |
| `handoffContractId` | string | |

### 5.4 Recommended fields

| Field | Type | Notes |
| --- | --- | --- |
| `agentSessionId` | string | Session row |
| `modelTier` | enum | §2.5 |
| `ownedPaths` | string[] | Glob paths worker may modify |
| `forbiddenPaths` | string[] | Must not touch |
| `sharedPaths` | string[] | Coordinate before edit |
| `requiresApprovalPaths` | string[] | Stop and ask |
| `assignmentPromptSummary` | string | Bounded work summary for worker |
| `blockingPolicy` | string | e.g. `worker_may_open_blocking_task_and_report` |
| `resources` | object | Full resource model (§5.5) |
| `lockScope` | object | Collision-awareness (§5.6) |

Legacy assignments **without** `schemaVersion` remain valid (supervisor/worker ids only).

### 5.5 Resource ownership (`resources`)

| Subfield | Meaning |
| --- | --- |
| `ownedPaths` | Worker may modify |
| `readOnlyPaths` | Inspect only |
| `sharedPaths` | Modify with coordination |
| `forbiddenPaths` | Must not touch |
| `requiresApprovalPaths` | Stop before edit |

### 5.6 Lock scope (`lockScope`)

```json
{
  "tasks": ["T100625"],
  "modules": ["task-engine"],
  "commands": []
}
```

### 5.7 Example (Task Work Agent assignment)

Fixture: `fixtures/agent-orchestration/assignment-metadata-task-worker.v1.json`

```json
{
  "schemaVersion": 1,
  "agentDefinitionId": "task-worker",
  "agentSessionId": "session-abc123",
  "modelTier": "balanced",
  "contextProfileId": "task_worker_context_v1",
  "accessProfileId": "task_worker_strict_v1",
  "handoffContractId": "implementation_handoff_v2",
  "ownedPaths": ["AGENT_ORCHESTRATION_CONTRACTS.md", "schemas/agent-orchestration/**", "fixtures/agent-orchestration/**"],
  "forbiddenPaths": ["extensions/cursor-workflow-cannon/**"],
  "sharedPaths": [],
  "requiresApprovalPaths": ["src/contracts/**"],
  "assignmentPromptSummary": "Draft AGENT_ORCHESTRATION_CONTRACTS.md (A-SCHEMA) with v1 schemas, enums, examples, and malformed-field rules.",
  "blockingPolicy": "worker_may_open_blocking_task_and_report",
  "resources": {
    "ownedPaths": ["AGENT_ORCHESTRATION_CONTRACTS.md", "schemas/agent-orchestration/**", "fixtures/agent-orchestration/**"],
    "readOnlyPaths": [".ai/**", "AGENT_ORCHESTRATION_FOUNDATION.md", "AGENT_ORCHESTRATION_ARCHITECTURE.md", "AGENT_ORCHESTRATION_INVENTORY.md"],
    "sharedPaths": [],
    "forbiddenPaths": ["extensions/cursor-workflow-cannon/**"],
    "requiresApprovalPaths": ["src/contracts/**"]
  },
  "lockScope": {
    "tasks": ["T100625"],
    "modules": [],
    "commands": []
  }
}
```

---

## 6. AgentActivity v1

### 6.1 Decision

TTL-governed live status lease. Answers: *What is this agent doing right now?* (foundation §7–8).

### 6.2 JSON Schema

See `schemas/agent-orchestration/agent-activity.v1.json`.

### 6.3 Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `activityId` | string | |
| `agentId` | string | Instance id |
| `sessionId` | string | |
| `kind` | enum | §2.8 |
| `label` | string | Human-readable step |
| `updatedAt` | ISO-8601 | |
| `expiresAt` | ISO-8601 | Default TTL 90s from last heartbeat |

### 6.4 Required when applicable

| Field | When |
| --- | --- |
| `agentDefinitionId` | Known role |
| `assignmentId` | Worker on assignment |
| `taskId` | Task-bound work |
| `phaseKey` | Phase-scoped work |
| `hostHint` | Host known |
| `modelTier` | Model routing recorded |

### 6.5 Optional fields

| Field | Type |
| --- | --- |
| `currentStep` | string |
| `command` | string |
| `modelHint` | string |
| `startedAt` | ISO-8601 |
| `details` | object |

### 6.6 Lifecycle timing (v1)

```text
heartbeat interval: 30 seconds
default activity TTL: 90 seconds
fresh:   updated <= 30s ago
aging:   updated <= 60s ago
stale:   updated > 60s and not expired
expired: now >= expiresAt
```

### 6.7 Example

Fixture: `fixtures/agent-orchestration/agent-activity-working-task.v1.json`

```json
{
  "activityId": "current:phase-126-delivery-worker:default",
  "agentId": "phase-126-delivery-worker",
  "agentDefinitionId": "task-worker",
  "sessionId": "default",
  "assignmentId": "A-phase126-T100625",
  "taskId": "T100625",
  "phaseKey": "126",
  "kind": "working_task",
  "label": "Drafting AGENT_ORCHESTRATION_CONTRACTS.md",
  "currentStep": "Writing schema sections",
  "command": "pnpm run check",
  "hostHint": "cursor",
  "modelTier": "balanced",
  "modelHint": "gpt-5.5-high",
  "startedAt": "2026-05-31T08:26:44.738Z",
  "updatedAt": "2026-05-31T08:30:00.000Z",
  "expiresAt": "2026-05-31T08:31:30.000Z",
  "details": {}
}
```

---

## 7. Handoff v2

### 7.1 Decision

Structured worker → orchestrator evidence bundle. **v1 fallback:** `{ schemaVersion: 1, summary, evidenceRefs? }` remains accepted (architecture §4.3, `validateHandoffContractV1`).

### 7.2 JSON Schema

See `schemas/agent-orchestration/handoff.v2.json`.

### 7.3 Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | integer | Must be `2` |
| `assignmentId` | string | |
| `agentId` | string | Worker instance |
| `status` | enum | §2.9 |
| `summary` | string | Non-empty |
| `evidenceRefs` | string[] | May be empty |

### 7.4 Optional fields

| Field | Type |
| --- | --- |
| `agentDefinitionId` | string |
| `filesChanged` | `{ path, reason? }[]` |
| `commandsRun` | `{ command, status, summary? }[]` |
| `acceptanceCriteria` | `{ criterion, status, evidence? }[]` |
| `blockers` | `{ summary, taskId?, severity? }[]` |
| `risks` | `{ risk, severity, recommendation? }[]` |
| `nextRecommendedAction` | string |

### 7.5 Examples by status

#### 7.5.1 `completed`

Fixture: `fixtures/agent-orchestration/handoff-completed.v2.json`

```json
{
  "schemaVersion": 2,
  "assignmentId": "A-phase126-T100625",
  "agentId": "phase-126-delivery-worker",
  "agentDefinitionId": "task-worker",
  "status": "completed",
  "summary": "Drafted AGENT_ORCHESTRATION_CONTRACTS.md with v1 schemas, enums, examples, and malformed-field rules.",
  "filesChanged": [
    { "path": "AGENT_ORCHESTRATION_CONTRACTS.md", "reason": "A-SCHEMA contract pack" },
    { "path": "schemas/agent-orchestration/agent-definition.v1.json", "reason": "JSON Schema" }
  ],
  "commandsRun": [
    { "command": "pnpm run check", "status": "passed", "summary": "Repo gate green" }
  ],
  "acceptanceCriteria": [
    { "criterion": "Schemas match the foundation document", "status": "passed", "evidence": "AGENT_ORCHESTRATION_CONTRACTS.md §3–7" },
    { "criterion": "Examples exist for Orchestration Agent and Task Work Agent", "status": "passed", "evidence": "§3.6, fixtures/agent-orchestration/" }
  ],
  "evidenceRefs": ["check:pnpm-run-check", "pr:workflow-cannon#601"],
  "blockers": [],
  "risks": [],
  "nextRecommendedAction": "Human sign-off on A-SCHEMA; proceed to A-COMMANDS (T100626)."
}
```

#### 7.5.2 `blocked`

Fixture: `fixtures/agent-orchestration/handoff-blocked.v2.json`

```json
{
  "schemaVersion": 2,
  "assignmentId": "A123",
  "agentId": "phase-126-delivery-worker",
  "agentDefinitionId": "task-worker",
  "status": "blocked",
  "summary": "Cannot run-transition start: task missing from git-event-log canonical store.",
  "filesChanged": [],
  "commandsRun": [
    { "command": "pnpm exec wk run run-transition", "status": "failed", "summary": "task-state-canonical-publish-failed / task-not-found" }
  ],
  "acceptanceCriteria": [],
  "evidenceRefs": ["task-sync-publish:task.created-backfill"],
  "blockers": [
    { "summary": "T100625 sqlite-only after persist-planning-execution-drafts", "taskId": "T100625", "severity": "high" }
  ],
  "risks": [
    { "risk": "task-sync-hydrate may drop sqlite-only rows", "severity": "high", "recommendation": "Publish task.created before transitions; avoid hydrate during delivery." }
  ],
  "nextRecommendedAction": "Orchestrator: backfill git-canonical task.created, then resume worker."
}
```

#### 7.5.3 `partial`

Fixture: `fixtures/agent-orchestration/handoff-partial.v2.json`

```json
{
  "schemaVersion": 2,
  "assignmentId": "A124",
  "agentId": "phase-126-delivery-worker",
  "status": "partial",
  "summary": "Contract markdown drafted; JSON Schema files deferred to follow-up.",
  "filesChanged": [
    { "path": "AGENT_ORCHESTRATION_CONTRACTS.md", "reason": "Primary deliverable" }
  ],
  "commandsRun": [
    { "command": "pnpm run check", "status": "passed", "summary": "No schema test yet" }
  ],
  "acceptanceCriteria": [
    { "criterion": "Handoff v2 has examples for all statuses", "status": "passed" },
    { "criterion": "JSON Schema pack under schemas/agent-orchestration/", "status": "partial", "evidence": "Pending T-AO-110" }
  ],
  "evidenceRefs": [],
  "blockers": [],
  "risks": [],
  "nextRecommendedAction": "Assign schema extraction task or extend this assignment."
}
```

#### 7.5.4 `failed`

Fixture: `fixtures/agent-orchestration/handoff-failed.v2.json`

```json
{
  "schemaVersion": 2,
  "assignmentId": "A125",
  "agentId": "phase-126-delivery-worker",
  "status": "failed",
  "summary": "pnpm run check failed after contracts edit; could not merge.",
  "filesChanged": [
    { "path": "AGENT_ORCHESTRATION_CONTRACTS.md", "reason": "WIP with broken cross-ref" }
  ],
  "commandsRun": [
    { "command": "pnpm run check", "status": "failed", "summary": "lint or test failure" }
  ],
  "acceptanceCriteria": [
    { "criterion": "pnpm run check passes", "status": "failed", "evidence": "exit code non-zero" }
  ],
  "evidenceRefs": ["check:pnpm-run-check:failed"],
  "blockers": [],
  "risks": [
    { "risk": "Broken doc links block downstream A-COMMANDS", "severity": "medium", "recommendation": "Fix check failures before reconcile." }
  ],
  "nextRecommendedAction": "Orchestrator: assign fix-up or cancel assignment."
}
```

#### 7.5.5 `needs_review`

Fixture: `fixtures/agent-orchestration/handoff-needs-review.v2.json`

```json
{
  "schemaVersion": 2,
  "assignmentId": "A126",
  "agentId": "phase-126-delivery-worker",
  "agentDefinitionId": "task-worker",
  "status": "needs_review",
  "summary": "Contracts pack ready for human schema review before validator implementation.",
  "filesChanged": [
    { "path": "AGENT_ORCHESTRATION_CONTRACTS.md", "reason": "Full A-SCHEMA draft" }
  ],
  "commandsRun": [
    { "command": "pnpm run check", "status": "passed", "summary": "Repo gate green" }
  ],
  "acceptanceCriteria": [
    { "criterion": "Verification evidence recorded with operator sign-off", "status": "partial", "evidence": "§10 sign-off table pending human" }
  ],
  "evidenceRefs": ["pr:pending"],
  "blockers": [],
  "risks": [
    { "risk": "Strict validation rules may differ from operator intent", "severity": "low", "recommendation": "Complete §10 sign-off before WP-3 validators." }
  ],
  "nextRecommendedAction": "Route to maintainer for A-SCHEMA approval (§10.2)."
}
```

---

## 8. Malformed and unknown-field behavior

### 8.1 Validation modes

| Mode | Trigger | Behavior |
| --- | --- | --- |
| **Permissive (legacy)** | No `schemaVersion` on assignment metadata; Handoff `schemaVersion === 1`; subagent rows without orchestration metadata | Existing validators unchanged; unknown top-level keys **stored verbatim**, not validated |
| **Strict (orchestration v1)** | `metadata.schemaVersion === 1` on assignments; full AgentDefinition/Session bridge objects with `metadata.schemaVersion === 1` | JSON Schema validation; reject with stable error codes (future WP-3) |
| **Handoff v2 strict** | `handoff.schemaVersion === 2` | Validate §7 required fields; v1 parser **not** invoked |

Default workspace flag `orchestration.strictMetadataValidation` is **false** until WP-3 commands ship (architecture §6.5).

### 8.2 Error code vocabulary (implementers)

| Code | When |
| --- | --- |
| `invalid-orchestration-schema` | JSON Schema validation failed |
| `unknown-orchestration-field` | Strict mode: property not in schema (`additionalProperties: false`) |
| `invalid-orchestration-enum` | Enum field out of set (§2) |
| `missing-required-orchestration-field` | Required field absent in strict mode |
| `invalid-handoff-schema-version` | Handoff `schemaVersion` not in `{1, 2}` |
| `handoff-v2-missing-field` | Handoff v2 required field missing |
| `unknown-capability` | Capability string not in §2.4 superset (advisory in v1) |

### 8.3 Unknown fields

| Context | Strict mode | Permissive mode |
| --- | --- | --- |
| AgentDefinition / Session bridge | **Reject** unknown keys at validator boundary | Store in `metadata`; ignore on read paths |
| Assignment metadata v1 | **Reject** unknown keys | N/A (no schemaVersion) |
| Handoff v2 | **Reject** unknown keys | Handoff v1 ignores extra keys |
| AgentActivity lease `details` | **Allow** arbitrary keys (`details` is extension bag) | Same |

### 8.4 Malformed types

| Malformed input | Behavior |
| --- | --- |
| Non-object root | `invalid-orchestration-schema` — fail closed |
| Wrong `schemaVersion` type | Fail closed |
| `schemaVersion: 1` with Handoff v2-only fields | Ignore extra fields in permissive; reject in strict Handoff v2 parser |
| Empty `summary` on Handoff v2 | `handoff-v2-missing-field` |
| Invalid ISO timestamp on Activity | Reject lease write (`invalid-run-args` today) |
| Unknown `kind` on Activity | Reject (`normalizeAgentActivityKind` returns null) |
| `retired: true` definition referenced by new assignment | Advisory warning; assignment still allowed in v1 |

### 8.5 Dual-read / dual-write (architecture §6.3)

1. Writers populate column **and** metadata bridge during transition window.
2. Readers prefer columns when non-null, else metadata bridge.
3. Handoff parsers: try v2 when `schemaVersion === 2`, else v1.

---

## 9. Versioning and compatibility matrix

| Artifact | Version field | Retirement |
| --- | --- | --- |
| AgentDefinition | `version` / `definitionVersion` | `retired: true` |
| AgentSession | status `closed` | Rows retained |
| Assignment metadata | `metadata.schemaVersion` | Additive only |
| Handoff | `handoff.schemaVersion` | v1 + v2 parsers in parallel |
| Activity lease | `schemaVersion: 1` on row | TTL expiry |

**v1 guarantee:** Assignments and handoffs without orchestration schema versions continue to work unchanged (architecture §5).

---

## 10. Verification and human approval

### 10.1 Acceptance mapping (T100625 / A-SCHEMA)

| Criterion | Section |
| --- | --- |
| Schemas match foundation document | §3–7 (aligned with foundation §3–9, §14) |
| Examples for Orchestration Agent and Task Work Agent | §3.6 |
| Assignment metadata includes resource ownership and profile refs | §5.4–5.7 |
| Handoff v2 examples: completed, blocked, partial, failed, needs_review | §7.5 |
| Verification evidence + operator sign-off | §10.2–10.3 |

### 10.2 Operator review sign-off (required)

| Field | Value |
| --- | --- |
| Artifact | A-SCHEMA / `AGENT_ORCHESTRATION_CONTRACTS.md` |
| Reviewer | _pending_ |
| Decision | ☐ Approve as written &nbsp; ☐ Approve with notes &nbsp; ☐ Reject — revise |
| Notes | |
| Date | |

Dependent tasks (**T100626**, **T100627**, T-AO-110+) should treat validators as **draft** until the table above records approval.

### 10.3 Verification evidence (automated / agent)

| Check | Result |
| --- | --- |
| References A-ARCH three-layer map | §1, §5 — Registry / Assignment / Activity |
| AgentDefinition v1 required fields match foundation §3 | §3.3 |
| AgentSession v1 matches foundation §4 | §4 |
| Assignment metadata bridge matches architecture §4.2 | §5 |
| Activity kinds match `agent-activity-store.ts` | §2.8, §6 |
| Handoff v2 matches foundation §9 | §7 |
| Malformed-field rules documented | §8 |
| Fixtures under `fixtures/agent-orchestration/` | Yes |
| JSON Schemas under `schemas/agent-orchestration/` | Yes |
| `pnpm run check` (repo gate) | Pending — run on task branch before merge |

---

## 11. Related artifacts

| Doc / path | Role |
| --- | --- |
| [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) | Normative product intent |
| [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md) | Storage bridge decisions (A-ARCH) |
| [AGENT_ORCHESTRATION_INVENTORY.md](./AGENT_ORCHESTRATION_INVENTORY.md) | As-built commands (A-INV) |
| `schemas/agent-orchestration/*.v1.json`, `handoff.v2.json` | JSON Schema pack |
| `fixtures/agent-orchestration/**` | Golden examples |
| `src/modules/team-execution/assignment-store.ts` | Handoff v1 validator (today) |
| `src/modules/task-engine/agent-activity-store.ts` | Activity kinds + TTL |

---

## 12. Document history

| Date | Change |
| --- | --- |
| 2026-05-31 | Initial A-SCHEMA for Phase 126 / T100625 |
