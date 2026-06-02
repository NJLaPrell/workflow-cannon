# AGENT_ORCHESTRATION_COMMANDS.md

**Artifact:** A-COMMANDS (orchestration command contract pack)  
**WBS:** WBS-AO-030 / task **T100626**  
**Requires:** [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md), [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md), [AGENT_ORCHESTRATION_INVENTORY.md](./AGENT_ORCHESTRATION_INVENTORY.md), [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md)  
**Blocks:** A-POLICY (T100627), TypeScript contracts (T-AO-110), command handler updates (WP-3 / T-AO-210–430)  
**Produced:** 2026-05-31  
**Status:** Approved for implementation  

---

## 1. Purpose

This document is the **command contract pack** for Workflow Cannon agent orchestration v1. It defines:

- **Existing commands to reuse or extend** (from A-INV)
- **Proposed new commands** only where the current surface is insufficient
- Per-command **request/response shapes**, **policyApproval** requirements, **idempotency**, and **dry-run** semantics
- **Orchestrator** and **Task Work Agent** flow sequences
- **Policy surfaces** flagged for downstream **A-POLICY** (T100627)

Normative contract shapes live in **AGENT_ORCHESTRATION_CONTRACTS.md** (A-SCHEMA). Storage and module mapping live in **AGENT_ORCHESTRATION_ARCHITECTURE.md** (A-ARCH). As-built commands are inventoried in **AGENT_ORCHESTRATION_INVENTORY.md** (A-INV).

Instruction paths (today): `src/modules/subagents/instructions/*.md`, `src/modules/team-execution/instructions/*.md`, `src/modules/task-engine/instructions/*.md`. Agent copy-paste snippets: `.ai/agent-cli-snippets/INDEX.json`.

---

## 2. Executive summary — reuse vs new

| Domain | Reuse / extend (v1) | New command (insufficient today) |
| --- | --- | --- |
| **Agent definitions** | `register-subagent`, `retire-subagent`, `list-subagents`, `get-subagent` | — (aliases deferred to v1.1) |
| **Agent sessions** | `spawn-subagent`, `close-subagent-session`, `message-subagent`, `list-subagent-sessions`, `get-subagent-session` | **`update-subagent-session`** — link assignment/activity, session status, model tier |
| **Assignments** | `register-assignment`, `list-assignments`, `reconcile-assignment`, `cancel-assignment`, `block-assignment` (supervisor) | **`report-assignment-blocked`** — worker self-report without supervisor id |
| **Handoff** | **`submit-assignment-handoff`** (extend for Handoff v2 + v1 fallback) | — |
| **Blocker / bug paths** | `create-task`, `report-defect` (orchestrator / general intake only) | **`report-assignment-blocker`**, **`report-assignment-defect`** — assignment-scoped worker paths |
| **Activity v1** | `set-agent-activity`, `clear-agent-activity` | — |
| **Orchestration status reads** | `dashboard-summary`, `list-assignments`, `list-subagent-sessions`, `list-tasks`, `get-task`, `get-next-actions` | **`get-orchestration-status`** — agent-centric aggregate read (optional v1; see §8) |
| **Task delivery (unchanged authority)** | `run-transition`, `completion-preflight`, `wait-for-pr-checks` | — |

**Design rule:** Prefer **extend-in-place** on existing module commands with optional orchestration fields. New commands are **narrow, role-scoped** wrappers where general commands (`create-task`, `block-assignment`) would violate orchestrator/worker boundaries.

---

## 3. Cross-cutting semantics

### 3.1 Policy approval (`policyApproval`)

| Tier | `policyOperationId` | Commands |
| --- | --- | --- |
| **A** | `tasks.run-transition` | `run-transition` |
| **B** | `subagents.persist` | `register-subagent`, `retire-subagent`, `spawn-subagent`, `message-subagent`, `close-subagent-session`, **`update-subagent-session`** (proposed) |
| **B** | `team-execution.persist` | `register-assignment`, `submit-assignment-handoff`, `block-assignment`, `reconcile-assignment`, `cancel-assignment`, **`report-assignment-blocked`** (proposed) |
| **B** | `tasks.create` / task mutations | `create-task`, `report-defect`, **`report-assignment-blocker`**, **`report-assignment-defect`** (proposed) |
| **B** | `tasks.set-agent-activity` (manifest) | `set-agent-activity`, `clear-agent-activity` |
| **Read** | — | `list-*`, `get-*`, `dashboard-summary`, **`get-orchestration-status`** — no `policyApproval` |

Canon: `.ai/POLICY-APPROVAL.md`, `.ai/AGENT-CLI-MAP.md`, `src/core/policy.ts`, `src/contracts/builtin-run-command-manifest.json`.

**Planning generation:** Mutating commands accept optional `expectedPlanningGeneration` when `tasks.planningGenerationPolicy` is `require`. Agents must refresh from `list-tasks` after any transition that bumps generation.

### 3.2 Idempotency

| Command | Idempotency key | Replay behavior |
| --- | --- | --- |
| `register-subagent` | `subagentId` | Upsert definition; same payload → no-op update |
| `spawn-subagent` | `clientMutationId` or `(subagentId, sessionId)` when `sessionId` supplied | Same `sessionId` + payload → return existing session |
| `update-subagent-session` (proposed) | `(sessionId, clientMutationId)` | Same mutation id → return prior result |
| `register-assignment` | `clientMutationId` or explicit `assignmentId` | Same id + equivalent payload → idempotent replay |
| `submit-assignment-handoff` | `(assignmentId, handoffHash)` optional `clientMutationId` | Re-submit identical handoff on `submitted` → advisory replay; status change rejected |
| `report-assignment-blocker` (proposed) | `clientMutationId` | Same key → return existing blocker task id |
| `report-assignment-defect` (proposed) | `clientMutationId` | Same key → return existing defect task id |
| `report-assignment-blocked` (proposed) | `(assignmentId, workerId, clientMutationId)` | Same key → return existing blocked row |
| `set-agent-activity` | `activityId` (default `current:<agentId>:<sessionId>`) | Upsert lease; extends TTL |
| `create-task` / `report-defect` | `clientMutationId` | Existing create-task idempotency |
| `run-transition` | transition evidence chain | Not idempotent across actions; guards reject illegal replays |

### 3.3 Dry-run

| Command | `dryRun: true` support | Behavior |
| --- | --- | --- |
| Mutating orchestration commands | **Proposed v1** | Validate args + policy + schema; return `wouldApply` summary; **no** SQLite writes |
| `run-transition` | **No** (today) | Use `completion-preflight` for pre-complete checks |
| Read commands | N/A | Always side-effect free |

**Dry-run response shape (proposed common envelope):**

```json
{
  "ok": true,
  "code": "dry-run-valid",
  "data": {
    "command": "register-assignment",
    "wouldApply": {
      "assignmentId": "<uuid>",
      "status": "assigned",
      "metadataValidated": true
    },
    "warnings": []
  }
}
```

Implementers: gate dry-run behind the same JSON Schema validation as live writes; A-POLICY will define whether dry-run requires `policyApproval` (recommendation: **no** for reads; **yes** for mutating dry-run that reveals policy-sensitive ids).

### 3.4 Orchestration strict validation flag

When workspace config `orchestration.strictMetadataValidation` is **true** (default **false** until WP-3 ships, architecture §6.5):

- Commands that accept AgentDefinition, AgentSession, assignment metadata, Handoff v2, or Activity v1 payloads **fail closed** on schema/enum violations (A-SCHEMA §8).
- Permissive mode: store unknown fields in `metadata`; validate only when `schemaVersion` is present.

### 3.5 Error codes (command boundary)

| Code | Typical command |
| --- | --- |
| `invalid-run-args` | Malformed JSON argv |
| `policy-approval-required` | Missing `policyApproval` on Tier A/B |
| `planning-generation-stale` | `expectedPlanningGeneration` mismatch |
| `invalid-orchestration-schema` | A-SCHEMA validation failed |
| `invalid-handoff-schema-version` | Handoff parser |
| `handoff-v2-missing-field` | Handoff v2 required field absent |
| `assignment-not-found` | Unknown `assignmentId` |
| `assignment-authority-denied` | Worker/supervisor id mismatch |
| `assignment-status-invalid` | Illegal transition |
| `worker-scope-violation` | Proposed blocker/defect path rejects unlinked create |
| `subagent-not-found` / `session-not-found` | Registry reads/writes |
| `idempotent-replay` | Successful replay (informational `code`, not error) |

---

## 4. Agent definitions (Registry layer)

### 4.1 Reuse: `register-subagent` (extend)

**Module:** `subagents` · **Mutating:** yes · **policyOperationId:** `subagents.persist`

**v1 extension:** Accept optional orchestration fields inline or under `metadata.agentDefinition` when `metadata.schemaVersion === 1`. Promote to columns in v1.1 DDL (architecture §3.2).

| Field (new / extended) | Type | Required | Notes |
| --- | --- | --- | --- |
| `subagentId` | string | yes | Maps to `agentDefinitionId` |
| `displayName`, `description`, `allowedCommands` | — | yes (today) | Unchanged |
| `role` | enum | no | §2.2 A-SCHEMA |
| `hostCompatibility` | string[] | no | |
| `requiredCapabilities`, `optionalCapabilities` | string[] | no | |
| `accessProfileId`, `contextProfileId`, `modelProfileId` | string | no | A-PROFILES refs |
| `handoffContractId`, `activityContractId` | string | no | |
| `definitionVersion` | integer | no | default `1` |
| `metadata.agentDefinition` | object | no | Full bridge object when columns absent |
| `expectedPlanningGeneration` | integer | when policy requires | |
| `policyApproval` | object | yes | Tier B |
| `dryRun` | boolean | no | §3.3 |

**Response (extended):**

```json
{
  "ok": true,
  "code": "subagent-registered",
  "data": {
    "definition": {
      "id": "task-worker",
      "displayName": "Task Work Agent",
      "role": "task_worker",
      "retired": false,
      "agentDefinition": { "schemaVersion": 1, "..." : "..." }
    }
  }
}
```

**Example — register well-known Task Work Agent definition:**

```bash
pnpm exec wk run register-subagent '{
  "subagentId": "task-worker",
  "displayName": "Task Work Agent",
  "description": "Bounded implementation worker for phase delivery",
  "allowedCommands": ["list-tasks","get-task","run-transition","set-agent-activity","submit-assignment-handoff","report-assignment-blocker","report-assignment-defect","report-assignment-blocked"],
  "role": "task_worker",
  "hostCompatibility": ["cursor","cli"],
  "requiredCapabilities": ["read_context","edit_owned_files","run_allowed_commands","submit_handoff","report_activity","receive_assignment"],
  "handoffContractId": "implementation_handoff_v2",
  "activityContractId": "agent_activity_v1",
  "metadata": {
    "schemaVersion": 1,
    "agentDefinition": {
      "schemaVersion": 1,
      "agentDefinitionId": "task-worker",
      "role": "task_worker",
      "version": 1
    }
  },
  "expectedPlanningGeneration": 4597,
  "policyApproval": {"confirmed": true, "rationale": "register task-worker definition"}
}'
```

### 4.2 Reuse: `retire-subagent`, `list-subagents`, `get-subagent`

No argv shape change. **Read paths** return orchestration bridge fields when present (columns or `metadata.agentDefinition`).

### 4.3 Deferred: command aliases (v1.1+)

| Alias | Wraps | Rationale for deferral |
| --- | --- | --- |
| `register-agent-definition` | `register-subagent` | Metadata bridge sufficient (architecture §3.3) |
| `list-agent-definitions` | `list-subagents` | Same store |

---

## 5. Agent sessions (Registry layer)

### 5.1 Reuse: `spawn-subagent` (extend)

**Module:** `subagents` · **Mutating:** yes · **policyOperationId:** `subagents.persist`

**v1 extension:** Optional AgentSession v1 fields.

| Field (new / extended) | Type | Required | Notes |
| --- | --- | --- | --- |
| `subagentId` | string | yes | Definition id |
| `executionTaskId` | string | no | Task link |
| `hostHint` | string | no | e.g. `cursor` |
| `promptSummary` | string | no | Audit only; does not launch host |
| `sessionId` | string | no | UUID default |
| `agentId` | string | no | Instance id; defaults to host-provided worker name |
| `modelTier`, `modelHint` | string | no | |
| `currentAssignmentId` | string | no | Usually set via `update-subagent-session` after assignment |
| `metadata.agentSession` | object | no | Bridge payload |
| `clientMutationId` | string | no | Idempotency |
| `policyApproval`, `expectedPlanningGeneration`, `dryRun` | — | per §3 | |

**Response:** `{ session: { id, definitionId, status: "open", ... } }`

**Important (architecture D-ARCH-03):** `spawn-subagent` **does not** create an assignment row. Orchestrator calls `register-assignment` separately.

### 5.2 Proposed: `update-subagent-session`

**Why new:** Today `spawn-subagent` creates and `close-subagent-session` closes; no command updates `currentAssignmentId`, `currentActivityId`, session `status` (`idle`/`active`/`blocked`), or model fields mid-session.

| Property | Value |
| --- | --- |
| Module | `subagents` |
| Mutating | yes |
| policyOperationId | `subagents.persist` |
| Who | Orchestrator or owning worker (`agentId` must match session metadata when worker-scoped enforcement lands in A-POLICY) |

**Request:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `sessionId` | string | yes | |
| `status` | enum | no | `open`, `idle`, `active`, `blocked`, `closing`, `closed`, `stale` |
| `currentAssignmentId` | string | no | |
| `currentActivityId` | string | no | |
| `modelTier`, `modelHint` | string | no | |
| `executionTaskId` | string | no | |
| `metadata.agentSession` | object | no | Merge or replace per `metadataMerge: "merge"` (default) |
| `clientMutationId` | string | no | Idempotency |
| `policyApproval`, `expectedPlanningGeneration`, `dryRun` | — | per §3 | |

**Response:**

```json
{
  "ok": true,
  "code": "subagent-session-updated",
  "data": { "session": { "id": "session-abc123", "status": "active", "currentAssignmentId": "A-phase126-T100626" } }
}
```

**Errors:** `session-not-found`, `session-closed`, `invalid-orchestration-schema`

### 5.3 Reuse: `close-subagent-session`, `message-subagent`, `list-subagent-sessions`, `get-subagent-session`

`close-subagent-session`: optional `handoffSummary` in metadata for audit only — **not** assignment handoff (use `submit-assignment-handoff`).

Read commands return `metadata.agentSession` bridge when present.

---

## 6. Assignments (Assignment layer)

### 6.1 Reuse: `register-assignment` (extend)

**Module:** `team-execution` · **Mutating:** yes · **policyOperationId:** `team-execution.persist` · **Primary orchestrator path**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `executionTaskId` | string | yes | Must exist in task store |
| `supervisorId` | string | yes | Orchestrator instance id |
| `workerId` | string | yes | Worker instance id |
| `assignmentId` | string | no | UUID default |
| `metadata` | object | no | When `metadata.schemaVersion === 1`, validate assignment bridge (A-SCHEMA §5) |
| `clientMutationId` | string | no | |
| `policyApproval`, `expectedPlanningGeneration`, `dryRun` | — | per §3 | |

**Response:**

```json
{
  "ok": true,
  "code": "assignment-registered",
  "data": {
    "assignment": {
      "id": "A-phase126-T100626",
      "executionTaskId": "T100626",
      "supervisorId": "phase-126-orchestrator",
      "workerId": "phase-126-delivery-worker",
      "status": "assigned",
      "metadata": { "schemaVersion": 1, "agentDefinitionId": "task-worker", "..." : "..." }
    }
  }
}
```

**Example — orchestrator creates bounded worker assignment:**

```bash
pnpm exec wk run register-assignment '{
  "executionTaskId": "T100626",
  "supervisorId": "phase-126-orchestrator",
  "workerId": "phase-126-delivery-worker",
  "assignmentId": "A-phase126-T100626",
  "metadata": {
    "schemaVersion": 1,
    "agentDefinitionId": "task-worker",
    "agentSessionId": "session-a4bb2fd2",
    "modelTier": "balanced",
    "contextProfileId": "task_worker_context_v1",
    "accessProfileId": "task_worker_strict_v1",
    "handoffContractId": "implementation_handoff_v2",
    "ownedPaths": ["AGENT_ORCHESTRATION_COMMANDS.md"],
    "forbiddenPaths": ["src/modules/**"],
    "assignmentPromptSummary": "Draft AGENT_ORCHESTRATION_COMMANDS.md (A-COMMANDS)",
    "blockingPolicy": "worker_may_open_blocking_task_and_report"
  },
  "expectedPlanningGeneration": 4597,
  "policyApproval": {"confirmed": true, "rationale": "assign T100626 to delivery worker"}
}'
```

### 6.2 Reuse: `list-assignments`, `reconcile-assignment`, `cancel-assignment`, `block-assignment`

| Command | Role | Notes |
| --- | --- | --- |
| `list-assignments` | Both | Filter by `workerId`, `supervisorId`, `executionTaskId`, `status`; returns metadata verbatim |
| `reconcile-assignment` | **Orchestrator** (supervisorId) | After Handoff v2 review; sets `reconciled` |
| `cancel-assignment` | **Orchestrator** | Terminal cancel |
| `block-assignment` | **Orchestrator** (supervisorId) | Sets `blocked` from `assigned`/`submitted`; **not** worker self-service |

Argv shapes unchanged; optional `metadata` echo on responses.

### 6.3 Proposed: `report-assignment-blocked`

**Why new:** `block-assignment` requires `supervisorId`. Workers must report blocked state without impersonating the orchestrator (foundation §6, §427–436).

| Property | Value |
| --- | --- |
| Module | `team-execution` |
| Mutating | yes |
| policyOperationId | `team-execution.persist` |
| Who | **Worker only** (`workerId` must match row) |

**Request:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `assignmentId` | string | yes | |
| `workerId` | string | yes | Must match assignment |
| `reason` | string | yes | Human-readable blocker summary |
| `blockerTaskId` | string | no | From `report-assignment-blocker` when created |
| `handoff` | object | no | Optional partial Handoff v2 with `status: "blocked"` |
| `clientMutationId` | string | no | |
| `policyApproval`, `expectedPlanningGeneration`, `dryRun` | — | per §3 | |

**Behavior:**

1. Validate assignment `status` is `assigned` (or `submitted` if rework path — A-POLICY decides).
2. Set status → `blocked`; populate `blockReason`.
3. Optionally merge `handoff` JSON when provided.
4. **Does not** reconcile or unblock (forbidden worker paths — flagged for A-POLICY).

**Response:** `{ assignment: { id, status: "blocked", blockReason, ... } }`

---

## 7. Handoff v2 (Assignment layer)

### 7.1 Reuse: `submit-assignment-handoff` (extend)

**Module:** `team-execution` · **Mutating:** yes · **policyOperationId:** `team-execution.persist` · **Primary worker path**

**v1 extension:** Accept Handoff v2 (`schemaVersion: 2`, A-SCHEMA §7). Retain v1 parser for `{ schemaVersion: 1, summary, evidenceRefs? }`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `assignmentId` | string | yes | |
| `workerId` | string | yes | Must match row |
| `handoff` | object | yes | v1 or v2 |
| `clientMutationId` | string | no | |
| `policyApproval`, `expectedPlanningGeneration`, `dryRun` | — | per §3 | |

**Transition:** `assigned` → `submitted` (unchanged). Handoff v2 `status` field (`completed`, `blocked`, `partial`, `failed`, `needs_review`) is **evidence for orchestrator**; row status remains `submitted` until reconcile/cancel/block.

**Example — worker completes with Handoff v2:**

```bash
pnpm exec wk run submit-assignment-handoff '{
  "assignmentId": "A-phase126-T100626",
  "workerId": "phase-126-delivery-worker",
  "handoff": {
    "schemaVersion": 2,
    "assignmentId": "A-phase126-T100626",
    "agentId": "phase-126-delivery-worker",
    "agentDefinitionId": "task-worker",
    "status": "completed",
    "summary": "Drafted AGENT_ORCHESTRATION_COMMANDS.md with reuse/new matrix and flow sections.",
    "filesChanged": [{ "path": "AGENT_ORCHESTRATION_COMMANDS.md", "reason": "A-COMMANDS deliverable" }],
    "commandsRun": [{ "command": "pnpm run check", "status": "passed" }],
    "evidenceRefs": ["pr:workflow-cannon#602"],
    "blockers": [],
    "risks": [],
    "nextRecommendedAction": "Operator sign-off on A-COMMANDS; proceed to A-POLICY (T100627)."
  },
  "expectedPlanningGeneration": 4597,
  "policyApproval": {"confirmed": true, "rationale": "submit T100626 handoff"}
}'
```

**Errors:** `handoff-v2-missing-field`, `invalid-handoff-schema-version`, `assignment-authority-denied`, `assignment-status-invalid`

---

## 8. Blocker and bug paths (Task engine + assignment linkage)

General `create-task` and `report-defect` remain valid for **orchestrator** intake. Workers on assignments require **scoped** commands (T-AO-330).

### 8.1 Proposed: `report-assignment-blocker`

**Why new:** `create-task` allows arbitrary task types/scope; workers must only create **linked blocking tasks** tied to their assignment (foundation §215, §427).

| Property | Value |
| --- | --- |
| Module | `task-engine` (wrapper over internal `create-task`) |
| Mutating | yes |
| policyOperationId | `tasks.create` (same as `create-task`) |
| Who | **Worker** with active assignment |

**Request:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `assignmentId` | string | yes | |
| `workerId` | string | yes | Must match assignment |
| `title` | string | yes | |
| `summary` | string | yes | Blocker description |
| `evidence` | string | yes | |
| `severity` | string | no | Maps to priority |
| `clientMutationId` | string | no | |
| `policyApproval`, `expectedPlanningGeneration`, `dryRun` | — | per §3 | |

**Behavior (proposed):**

1. Verify assignment exists; `blockingPolicy` allows worker create (metadata).
2. Create task `type: improvement` or dedicated `type: blocker` (A-POLICY) in `ready` or `proposed` per policy map.
3. Set `metadata.provenance`: `{ assignmentId, workerId, executionTaskId, schemaVersion: 1, kind: "assignment_blocker" }`.
4. Set `dependsOn` / `relatedTaskId` to `executionTaskId`.
5. **Do not** transition assignment — caller must also invoke `report-assignment-blocked` (§6.3).

**Response:** `{ task: { id: "T100xxx", ... }, assignmentId, provenance }`

### 8.2 Proposed: `report-assignment-defect`

Same pattern as §8.1 for **defect/bug** intake:

| Field | Notes |
| --- | --- |
| `kind` in provenance | `"assignment_defect"` |
| Default task type | `improvement` via `report-defect` defaults |
| `severity` | Forwarded |

Workers **cannot** use this path for feature tasks, phase planning, or unrelated scope (enforce via argv validation + allowed `technicalScope` templates — A-POLICY).

### 8.3 Reuse: `report-defect`, `create-task` (orchestrator)

Orchestrator continues using general paths for improvement intake, phase task materialization, and blocker-resolution assignments (foundation §619).

---

## 9. Activity v1 (Activity layer)

### 9.1 Reuse: `set-agent-activity` (extend)

**Module:** `task-engine` · **Mutating:** yes · **policyOperationId:** per manifest

**v1 extension:** Accept Activity v1 foreign keys (A-SCHEMA §6).

| Field (new / extended) | Type | Required | Notes |
| --- | --- | --- | --- |
| `kind` | enum | yes | §2.8 A-SCHEMA |
| `agentId` | string | yes | Instance id |
| `sessionId` | string | recommended | |
| `agentDefinitionId` | string | no | |
| `assignmentId` | string | no | When on assignment |
| `taskId`, `phaseKey` | string | no | |
| `label`, `currentStep` | string | no | |
| `command`, `hostHint`, `modelTier`, `modelHint` | string | no | |
| `activityId` | string | no | Default `current:<agentId>:<sessionId>` |
| `ttlSeconds` | integer | no | Clamped 30–3600; default 600 today, **90s target** per A-SCHEMA lifecycle |
| `details` | object | no | Extension bag |
| `policyApproval` | object | when policy requires | |

**Idempotency:** Upsert by `activityId`; heartbeat refreshes `updatedAt` / `expiresAt`.

**Example — worker marks working_task during delivery:**

```bash
pnpm exec wk run set-agent-activity '{
  "kind": "working_task",
  "agentId": "phase-126-delivery-worker",
  "agentDefinitionId": "task-worker",
  "sessionId": "session-a4bb2fd2",
  "assignmentId": "A-phase126-T100626",
  "taskId": "T100626",
  "phaseKey": "126",
  "label": "Drafting AGENT_ORCHESTRATION_COMMANDS.md",
  "currentStep": "Writing command contract sections",
  "command": "pnpm run check",
  "hostHint": "cursor",
  "modelTier": "balanced"
}'
```

### 9.2 Reuse: `clear-agent-activity`

Unchanged argv: `{ agentId, sessionId?, activityId? }`. Clears lease; activity is **not** durable assignment evidence.

### 9.3 Read-path lifecycle (no new command)

Fresh/aging/stale/expired derivation happens in **read paths** (`dashboard-summary`, proposed `get-orchestration-status`) per A-ACTIVITY (T100630). Write path keeps TTL only in v1.

---

## 10. Orchestration status reads

### 10.1 Reuse: existing read commands

| Command | Orchestrator use | Worker use |
| --- | --- | --- |
| `list-tasks` / `get-task` / `get-next-actions` | Phase queue, dependencies | Assigned task facts |
| `list-assignments` | All assignments for phase/workers | Own row filter by `workerId` |
| `list-subagent-sessions` / `get-subagent-session` | Open sessions | Own session |
| `dashboard-summary` | Cockpit: `agentStatus`, `teamExecution`, `subagentRegistry` slices | Same (read-only) |

**Projection note:** Today `agentStatus = liveActivity ?? derived` (single lease). Multi-agent merge deferred to A-PROJECTION / T-AO-610.

### 10.2 Proposed: `get-orchestration-status`

**Why new (optional v1):** Orchestrator agents need a **single agent-centric JSON** without full dashboard UI payload. If implementation cost is high, v1 **MAY** compose existing reads client-side; this command is the stable contract target.

| Property | Value |
| --- | --- |
| Module | `task-engine` (read-only aggregator) |
| Mutating | no |
| policyApproval | none |

**Request:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `agentId` | string | no | Filter; omit for all known agents |
| `phaseKey` | string | no | Scope |
| `includeDerived` | boolean | no | default `true` — include derived status when lease expired |
| `includeAssignments` | boolean | no | default `true` |
| `includeSessions` | boolean | no | default `true` |

**Response (illustrative):**

```json
{
  "ok": true,
  "code": "orchestration-status",
  "data": {
    "agents": [
      {
        "agentId": "phase-126-delivery-worker",
        "agentDefinitionId": "task-worker",
        "session": { "id": "session-a4bb2fd2", "status": "active" },
        "assignment": { "id": "A-phase126-T100626", "status": "assigned", "executionTaskId": "T100626" },
        "activity": { "kind": "working_task", "lifecycle": "fresh", "label": "Drafting A-COMMANDS" },
        "task": { "id": "T100626", "status": "in_progress" }
      }
    ],
    "generatedAt": "2026-05-31T09:15:00.000Z"
  }
}
```

**v1 fallback:** Document composition recipe in §11.2 using four read calls until handler ships.

---

## 11. Flow sequences

### 11.1 Orchestrator flow — assign and monitor worker

```text
1. register-subagent (once per role)     → task-worker, orchestration-agent definitions
2. spawn-subagent                        → open worker session (record-only)
3. create-task / plan materialization    → execution task T### in task store (git-canonical hygiene)
4. register-assignment                   → link supervisor/worker + metadata v1
5. update-subagent-session               → set currentAssignmentId on session
6. set-agent-activity (optional)         → delegating_task / planning on orchestrator agentId
7. [Host: prompt worker with assignmentPromptSummary]
8. list-assignments / get-orchestration-status / dashboard-summary → monitor
9. On handoff submitted:
     reconcile-assignment OR block-assignment OR cancel-assignment
10. run-transition on execution task     → separate Tier A path when delivery evidence ready
11. close-subagent-session (optional)    → after terminal assignment state
```

**Orchestrator forbidden (flagged A-POLICY):** `submit-assignment-handoff` as worker, `report-assignment-blocked` without worker id, self-`reconcile-assignment` on own worker assignments without supervisor hat.

### 11.2 Worker flow — deliver bounded task

```text
1. list-assignments / get-task           → confirm assignment + executionTaskId
2. run-transition start                  → Tier A; task in_progress
3. set-agent-activity                    → working_task (+ assignmentId, taskId)
4. [Implement scope within ownedPaths]
5. On blocker:
     report-assignment-blocker            → linked task only
     report-assignment-blocked            → mark assignment blocked
     set-agent-activity kind=blocked
     submit-assignment-handoff (optional partial/blocked Handoff v2)
     STOP — await orchestrator
6. On success:
     submit-assignment-handoff            → Handoff v2 status completed|needs_review
     set-agent-activity                   → validating / releasing as needed
     completion-preflight, wait-for-pr-checks, run-transition complete
7. clear-agent-activity                  → when terminal
```

**Worker forbidden (flagged A-POLICY):** `reconcile-assignment`, `cancel-assignment`, `block-assignment` (supervisor), broad `create-task` for features, `run-transition complete` without evidence, editing tasks outside assignment scope.

### 11.3 Maintainer delivery loop overlay

Phase workers continue **`.ai/playbooks/task-to-phase-branch.md`**: branch → PR → merge → `run-transition complete`. Orchestration commands are **additive** (`set-agent-activity`, optional `register-assignment` / handoff when operating under orchestrator supervision).

### 11.4 Blocked worker sequence (detailed)

```text
Worker hits blocker
  → report-assignment-blocker { assignmentId, workerId, title, summary, evidence }
  → report-assignment-blocked { assignmentId, workerId, reason, blockerTaskId }
  → set-agent-activity { kind: "blocked", ... }
  → submit-assignment-handoff { handoff.status: "blocked", blockers: [...] }  (optional)
Orchestrator
  → list-assignments / get-task on blockerTaskId
  → create-task / run-transition / human gate as needed
  → block-assignment OR reconcile after fix
  → update-subagent-session { status: "active" }
  → message-subagent or host prompt to resume worker
Worker resumes
  → set-agent-activity { kind: "working_task" }
  → continue from assignmentPromptSummary
```

---

## 12. Policy surfaces for A-POLICY (T100627)

The following **must** be resolved in **AGENT_ORCHESTRATION_POLICY.md** before WP-3 enforcement hardening (T-AO-340). This section flags only; it does not set policy.

| ID | Surface | Commands affected | Open question |
| --- | --- | --- | --- |
| **P-CMD-01** | Orchestrator vs worker mutation matrix | All §4–§9 | Explicit role → command allowlist |
| **P-CMD-02** | Worker `block-assignment` forbidden | `block-assignment`, `report-assignment-blocked` | Confirm worker cannot pass `supervisorId` |
| **P-CMD-03** | Worker reconcile/cancel forbidden | `reconcile-assignment`, `cancel-assignment` | Hard deny on workerId match |
| **P-CMD-04** | Scoped task create | `report-assignment-blocker`, `report-assignment-defect` vs `create-task` | Reject worker `create-task` when `assignmentId` context expected? |
| **P-CMD-05** | `blockingPolicy` enforcement | `report-assignment-blocker` | Deny when metadata omits `worker_may_open_blocking_task_and_report` |
| **P-CMD-06** | `update-subagent-session` authority | §5.2 | Orchestrator-only vs worker self-update |
| **P-CMD-07** | Dry-run policy approval | §3.3 | Whether dry-run requires Tier B approval |
| **P-CMD-08** | Dashboard elevation | Extension `policyApproval` for block/cancel | Unchanged; cross-ref POLICY-APPROVAL dashboard section |
| **P-CMD-09** | `run-transition` vs assignment state | Tier A | May worker `complete` while assignment still `assigned`? Recommend: require handoff `submitted` + orchestrator reconcile OR explicit waiver |
| **P-CMD-10** | Strict validation flag | §3.4 | Operator opt-in path |
| **P-CMD-11** | Git-canonical task hygiene | `create-task`, plan persist | Worker must not use sqlite-only plan paths (A-INV §10) |
| **P-CMD-12** | Handoff v2 `status` vs row `status` | `submit-assignment-handoff` | Orchestrator reconciles `needs_review` vs `completed` |

---

## 13. Command manifest impact (implementation checklist)

| Command | Manifest change | Module | Priority |
| --- | --- | --- | --- |
| `register-subagent` | Extend schema | subagents | P0 |
| `spawn-subagent` | Extend schema | subagents | P0 |
| `update-subagent-session` | **Add** | subagents | P0 |
| `register-assignment` | Extend schema | team-execution | P0 |
| `submit-assignment-handoff` | Extend schema | team-execution | P0 |
| `report-assignment-blocked` | **Add** | team-execution | P0 |
| `report-assignment-blocker` | **Add** | task-engine | P0 |
| `report-assignment-defect` | **Add** | task-engine | P1 |
| `set-agent-activity` | Extend schema | task-engine | P0 |
| `get-orchestration-status` | **Add** (optional) | task-engine | P1 |
| Read commands | Response shape docs only | various | P1 |

Add instruction capsules: `src/modules/*/instructions/<command>.md` and `.ai/agent-cli-snippets/by-command/*.json`.

---

## 14. Verification and human approval

### 14.1 Acceptance mapping (T100626 / A-COMMANDS)

| Criterion | Section |
| --- | --- |
| Existing commands to reuse/extend identified | §2, §4–§10 |
| New commands only where insufficient | §2, §5.2, §6.3, §8, §10.2 |
| Orchestrator and worker flows represented | §11 |
| Policy surfaces flagged for A-POLICY | §12 |
| Verification evidence + operator sign-off | §14.2–14.3 |

### 14.2 Operator review sign-off (required)

| Field | Value |
| --- | --- |
| Artifact | A-COMMANDS / `AGENT_ORCHESTRATION_COMMANDS.md` |
| Reviewer | Antigravity |
| Decision | ☑ Approve as written |
| Notes | Approved per user request. |
| Date | 2026-06-02 |

Dependent tasks (**T100627**, **T100632**, T-AO-110+) should treat command contracts as **draft** until the table above records approval.

### 14.3 Verification evidence (automated / agent)

| Check | Result |
| --- | --- |
| References A-SCHEMA contract shapes | §4–§9 — AgentDefinition, Session, assignment metadata, Handoff v2, Activity v1 |
| References A-ARCH command compatibility | §6–§7 aligned with architecture §4.3 |
| A-INV commands mapped reuse vs new | §2 |
| Orchestrator flow documented | §11.1 |
| Worker flow documented | §11.2, §11.4 |
| Blocker/bug path scoped commands proposed | §8 |
| Policy flags for A-POLICY | §12 (12 items) |
| Idempotency / dry-run / policyApproval per command | §3, per-section tables |
| `pnpm run check` (repo gate) | Pass — exit 0 on 2026-05-31 (feature/T100626-orchestration-commands) |

---

## 15. Related artifacts

| Doc / path | Role |
| --- | --- |
| [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) | Normative product intent |
| [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md) | Storage bridge (A-ARCH) |
| [AGENT_ORCHESTRATION_INVENTORY.md](./AGENT_ORCHESTRATION_INVENTORY.md) | As-built commands (A-INV) |
| [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) | JSON shapes (A-SCHEMA) |
| `.ai/AGENT-CLI-MAP.md` | Tier table and copy-paste JSON |
| `.ai/POLICY-APPROVAL.md` | Approval lanes |
| `src/contracts/builtin-run-command-manifest.json` | Command registry |
| `fixtures/agent-orchestration/**` | Golden handoff/activity examples |

---

## 16. Document history

| Date | Change |
| --- | --- |
| 2026-05-31 | Initial A-COMMANDS for Phase 126 / T100626 |
