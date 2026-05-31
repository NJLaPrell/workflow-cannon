# AGENT_ORCHESTRATION_ARCHITECTURE.md

**Artifact:** A-ARCH (orchestration architecture decision record)  
**WBS:** WBS-AO-010 / task **T100624**  
**Requires:** [AGENT_ORCHESTRATION_INVENTORY.md](./AGENT_ORCHESTRATION_INVENTORY.md) (A-INV)  
**Normative intent:** [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md)  
**Blocks:** A-SCHEMA (T-AO-020), WP-1 / T-AO-210–220, dashboard projection work (T-AO-610)  
**Produced:** 2026-05-31  
**Status:** Draft for human approval — implementation must not proceed on contested decisions until sign-off below.

---

## 1. Executive decision summary

Workflow Cannon v1 agent orchestration **keeps three existing persistence lanes** and **does not** introduce a parallel assignment store or host launcher. The architecture decision record locks:

| Decision | Choice |
| --- | --- |
| Layer separation | **Registry / Assignment / Activity** — mandatory; never collapse (per foundation §1) |
| AgentDefinition + AgentSession | **Extend** `subagents` module tables (`kit_subagent_*`) via additive columns + validated metadata — **no** new orchestration module in v1 |
| AgentAssignment | **Bridge** through `kit_team_assignments.metadata` (`schemaVersion: 1`) — TeamAssignment remains storage and command surface |
| Handoff | Evolve `submit-assignment-handoff` to **Handoff v2** with **v1 fallback** parser |
| Activity | Extend `kit_agent_activity_leases` + `set-agent-activity` — Activity v1 lifecycle in read paths first |
| Dashboard | **Read-only** projection builder (`DashboardAgentActivitySummary`) — never mutates orchestration tables |
| Host control | **Out of scope** v1 (record-only; prompt-based coordination) |

```text
AgentDefinition/Session  →  subagents registry (extended)
AgentAssignment          →  team-execution (metadata bridge)
AgentActivity            →  task-engine leases
Task lifecycle           →  task-engine (unchanged authority model)
Dashboard                →  dashboard-summary projection only
```

---

## 2. Three-layer separation (Registry / Assignment / Activity)

Normative model: **AGENT_ORCHESTRATION_FOUNDATION.md** §1 and principle *“identity, responsibility, and live status must not share one record.”*

### 2.1 Layer map to shipped modules

| Layer | Conceptual owner | Module | SQLite (kit `user_version`) | Commands (v1) |
| --- | --- | --- | --- | --- |
| **Registry** | Who the agent is | `subagents` | `kit_subagent_definitions`, `kit_subagent_sessions`, `kit_subagent_messages` (≥ v6) | `register-subagent`, `spawn-subagent`, `list-subagents`, … |
| **Assignment** | What work is owed | `team-execution` | `kit_team_assignments` (≥ v7) | `register-assignment`, `submit-assignment-handoff`, `block-assignment`, … |
| **Activity** | What is happening now | `task-engine` | `kit_agent_activity_leases` | `set-agent-activity`, `clear-agent-activity` |

### 2.2 Ownership rules (must not violate)

**Registry**

- Owns: reusable identity, role, host compatibility, capability vocabulary, profile refs, allowed command list, retirement/version.
- Must not own: assignment lifecycle, handoff evidence, live heartbeat, dashboard layout.

**Assignment**

- Owns: supervisor/worker linkage, execution task id, scope metadata (paths, profiles, model tier), handoff JSON, reconcile checkpoint, terminal status.
- Must not own: reusable definition fields duplicated per assignment; live TTL status (use Activity).

**Activity**

- Owns: expiring lease, kind/label/step, pointers to task/assignment/session when applicable.
- Must not own: durable handoff, assignment reconciliation, definition retirement.

### 2.3 Cross-layer pointers (v1)

```text
AgentDefinition (registry)
    ↑ agentDefinitionId
AgentSession (registry) ──currentAssignmentId──► TeamAssignment (assignment)
    ↑ sessionId                                      ↑ executionTaskId ──► Task (task-engine)
AgentActivity (activity) ──assignmentId / taskId / sessionId──► same graph
```

Sessions **may** point at assignments and tasks; assignments **may** reference `agentDefinitionId` / `agentSessionId` in metadata. Activity **should** echo those ids when known but remains independently TTL-governed.

### 2.4 Anti-patterns (explicitly rejected for v1)

- Merging subagent definition + team assignment into one table.
- Storing “current step” only on assignment rows (stale without TTL).
- Letting the Cursor dashboard extension write orchestration tables directly.
- Using `dashboard-summary` `agentStatus` as lifecycle evidence for `run-transition` **complete**.

---

## 3. AgentDefinition / AgentSession storage strategy

**Decision:** **Extend the subagent registry** (A-INV §11, foundation §3–4). Do **not** add `src/modules/agent-orchestration/` with duplicate tables in v1.

### 3.1 Rationale

| Factor | Extend `subagents` | New module/tables |
| --- | --- | --- |
| Existing commands & tests | Reuse `register-subagent`, `spawn-subagent`, dashboard slice | New Tier B surface + migration |
| Host-agnostic session log | Already present (`hostHint`, messages) | Duplicate |
| Foundation alignment | Subagent definitions ≈ AgentDefinition v0 | Extra fork |
| Risk | Additive DDL + metadata validation | Higher breaking-change surface |

### 3.2 Physical storage plan

**Definitions (`kit_subagent_definitions`)**

- **Keep:** `id`, `displayName`, `description`, `allowedCommands`, `retired`, `metadata` JSON.
- **Add (DDL v8+ orchestration bridge, names illustrative):**
  - `role` TEXT (or enum column)
  - `hostCompatibility` JSON array
  - `requiredCapabilities` / `optionalCapabilities` JSON arrays
  - `accessProfileId`, `contextProfileId`, `modelProfileId`, `handoffContractId`, `activityContractId` TEXT
  - `definitionVersion` INTEGER default 1
- **Bridge:** Until DDL lands, pack full **AgentDefinition v1** shape under `metadata.agentDefinition` with `metadata.schemaVersion: 1`; readers prefer columns when present.

**Sessions (`kit_subagent_sessions`)**

- **Keep:** `definitionId`, `executionTaskId`, `status`, `hostHint`, `metadata`.
- **Add:** `modelTier`, `modelHint`, `currentAssignmentId`, `currentActivityId` (nullable TEXT); session status enum aligned with foundation §4 (`open`, `idle`, `active`, `blocked`, `closing`, `closed`, `stale`).
- **Bridge:** `metadata.agentSession` object mirrors AgentSession v1 until columns exist.

**Messages (`kit_subagent_messages`)**

- Unchanged for v1; still audit trail for `message-subagent`, not handoff v2.

### 3.3 Read/write API evolution

| Phase | Behavior |
| --- | --- |
| **v1 bridge** | Existing subagent commands accept optional orchestration fields inside `metadata`; validators run only when `metadata.schemaVersion === 1` |
| **v1.1** | `register-subagent` / `spawn-subagent` promote core fields to columns; instructions document AgentDefinition/Session aliases |
| **Later** | Optional command aliases (`register-agent-definition`) as thin wrappers — not required for v1 |

### 3.4 AgentDefinition/Session vs Task Work Agent

Orchestration Agent and Task Work Agent definitions from foundation §19 materialize as **two well-known `agentDefinitionId` values** (`orchestration-agent`, `task-worker`) registered via the same subagent registry path. No special-case table.

---

## 4. TeamAssignment-as-AgentAssignment bridge

**Decision:** **TeamAssignment remains the system of record.** `AgentAssignment` is the **conceptual contract** implemented through structured assignment metadata (foundation §5).

### 4.1 Storage

- Table: `kit_team_assignments` (unchanged).
- Column: `metadata` JSON — primary bridge payload.
- Handoff: `handoff` JSON column — upgrade to Handoff v2 with version discriminator.
- Status enum: **unchanged** — `assigned`, `submitted`, `blocked`, `reconciled`, `cancelled`.

### 4.2 Metadata contract (assignment bridge v1)

When `metadata.schemaVersion === 1`, validators enforce (see future A-SCHEMA):

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
  "requiresApprovalPaths": [],
  "assignmentPromptSummary": "Implement the projection builder only.",
  "blockingPolicy": "worker_may_open_blocking_task_and_report",
  "resources": { "ownedPaths": [], "readOnlyPaths": [], "sharedPaths": [], "forbiddenPaths": [], "requiresApprovalPaths": [] },
  "lockScope": { "tasks": ["T100621"], "modules": [], "commands": [] }
}
```

Assignments **without** `schemaVersion` remain valid legacy team assignments (supervisor/worker ids only).

### 4.3 Command compatibility

| Command | v1 change |
| --- | --- |
| `register-assignment` | Accept optional structured metadata; validate if version present |
| `submit-assignment-handoff` | Accept Handoff v2; parse v1 if `schemaVersion < 2` |
| `block-assignment` / `reconcile-assignment` / `cancel-assignment` | No storage change; supervisor authority unchanged |
| `list-assignments` | Return metadata verbatim for orchestrator reads |

**Identity mapping:** `workerId` / `supervisorId` continue as opaque agent instance ids (e.g. `phase-126-delivery-worker`). `agentDefinitionId` in metadata names the **role contract**, not the instance id.

---

## 5. Compatibility with subagent registry + team execution

### 5.1 Subagent registry

| Existing behavior | v1 guarantee |
| --- | --- |
| Definitions with only `allowedCommands[]` | Still load; dashboard `subagentRegistry` slice unchanged |
| Sessions without orchestration metadata | Treated as generic subagent sessions |
| `policyOperationId: subagents.persist` | Unchanged Tier B |
| SQLite `user_version >= 6` gate | Preserved; orchestration DDL bumps kit version once |

### 5.2 Team execution

| Existing behavior | v1 guarantee |
| --- | --- |
| Handoff v1 `{ schemaVersion: 1, summary, evidenceRefs? }` | Still accepted; stored as today |
| Assignments without metadata | Full lifecycle works |
| Supervisor-only reconcile/cancel | Preserved; worker cannot reconcile (foundation §6) |
| `policyOperationId: team-execution.persist` | Unchanged Tier B |

### 5.3 Task engine + maintainer delivery

- `run-transition`, `create-task`, `report-defect` stay authoritative for task lifecycle (A-INV §2.4).
- Worker blocker path in v1: **documented** policy + future scoped `create-task` linker (T-AO-330) — not part of this architecture file’s implementation scope.
- Phase workers continue playbook `.ai/playbooks/task-to-phase-branch.md`; orchestration commands are **additive** to delivery flow (`set-agent-activity`, `submit-assignment-handoff`).

### 5.4 Git-canonical task store interaction

Planning materialization **must** publish `task.created` before worker `run-transition` when `tasks.canonicalAuthority` is `git-event-log` (A-INV §10, §11). Architecture does not change canonical authority; it **requires** plan→task materialization fixes (separate engineering tasks) so phase tasks do not collide with unrelated `create-task` ids.

---

## 6. Persistence, versioning, and migration

### 6.1 Single database truth

All three layers share **unified kit SQLite** (`.workspace-kit/tasks/workspace-kit.db`) with monotonic `user_version` migrations — same pattern as subagents (v6) and team execution (v7).

### 6.2 Versioning model

| Artifact | Version field | Retirement |
| --- | --- | --- |
| AgentDefinition | `definitionVersion` / `metadata.version` | `retired: true` — never deleted in v1 |
| AgentSession | status terminal `closed` | Rows retained for audit |
| Assignment metadata | `metadata.schemaVersion` | New schema versions are additive |
| Handoff | `handoff.schemaVersion` | v1 and v2 parsers in parallel |
| Activity lease | `schemaVersion` on lease row | Expire by TTL; no hard delete required |

### 6.3 Non-breaking migration strategy

1. **DDL additive only** — new nullable columns; no rename of `kit_subagent_*` or `kit_team_assignments` core fields.
2. **Metadata-first bridge** — ship validators and readers before requiring columns.
3. **Dual-read** — projection and commands accept legacy rows with no `schemaVersion`.
4. **Dual-write (transition window)** — writers populate both column and metadata bridge until DDL stable.
5. **Strict validation gated** — `metadata.schemaVersion === 1` enables strict mode; absence keeps today’s permissive behavior.
6. **Kit `user_version` bump** — one migration adds orchestration columns; doctor surfaces `invalid-task-schema` if DB too old.

### 6.4 Breaking-change controls (from A-INV §10)

| Risk | Mitigation |
| --- | --- |
| Handoff v2 validation rejects v1 | Keep v1 parser; v2 optional fields |
| New assignment rules break scripts | Rules apply only when structured metadata present |
| Activity kind rename | Kinds are versioned; do not remove enum values |
| Dashboard heuristic drift | Snapshot tests on `build-dashboard-agent-activity-summary` (future) |

### 6.5 Rollback

- Schema migrations are reversible only via kit backup + restore (operator runbook).
- Feature flags via workspace config: `orchestration.strictMetadataValidation` default **false** until WP-3 commands ship.

---

## 7. Dashboard projection boundary

Normative: foundation §15; A-INV §5; A-PROJECTION (future T-AO-080 / T-AO-610).

### 7.1 Source-of-truth rule

```text
Orchestration tables + task store  →  write path (wk run, Tier A/B policy)
Dashboard / extension              →  read path only
```

The dashboard **never** becomes canonical for assignment status, handoff acceptance, or agent identity.

### 7.2 Projection inputs (v1)

| Source | Feeds |
| --- | --- |
| `kit_subagent_definitions` / sessions | Registry rows, open session count |
| `kit_team_assignments` | Assignment status, supervisor/worker, handoff summary |
| `kit_agent_activity_leases` | Live activity, stale/expired |
| Task engine queue | `executionTaskId` linkage, phase context |
| Derived heuristics (`dashboard-agent-status.ts`) | Fallback when lease expired |

### 7.3 Target aggregate: `DashboardAgentActivitySummary`

New read-only builder (future `build-dashboard-agent-activity-summary.ts`):

- Merges **multiple** concurrent leases (fixes today’s single-lease override).
- Emits per-agent rows with merge precedence documented in A-PROJECTION.
- Consumed by Agent Card UX plan — **not** embedded in `agentStatus` alone.

**Today vs target:** `build-dashboard-base.ts` keeps `agentStatus = liveActivity ?? derived` until merge builder ships; orchestration work must not deepen that coupling.

### 7.4 Extension (`cursor-workflow-cannon`)

- Continues invoking `wk run` with JSON `policyApproval` for mutations.
- Slices: `agentStatus`, `teamExecution`, `subagentRegistry` remain; optional future slice `agentActivityBoard` reads summary projection.

---

## 8. Explicit v1 non-goals

Aligned with foundation §16. Implementation work **must not** expand into:

| Non-goal | Reason deferred |
| --- | --- |
| Automatic Cursor/VS Code agent launch | Host-agnostic record-only v1 |
| Cross-host process supervision | No runtime service |
| New `agent-orchestration` persistence module | Bridge strategy sufficient |
| Hard file-lock enforcement | Metadata-only resource rules |
| Full capability-based policy enforcement | Role-based v1 (A-POLICY follows) |
| Full model router / cost telemetry | Tier labels + rubric only |
| Host Adapter Registry | Capabilities in definitions only |
| Event-stream realtime projection | Polling `dashboard-summary` OK for v1 |
| Worker-scoped blocker task automation | Separate T-AO-330 |
| Replacing `team-execution` command names | Conceptual rename only |

**v1 does deliver (downstream WBS):** contract pack (A-SCHEMA), validators, Handoff v2 submission, activity lifecycle spec enforcement, projection builder, profile catalog (A-PROFILES), orchestration prompts.

---

## 9. Implementation phases (architecture-aligned)

Maps foundation §18 to repo WBS:

| Phase | Deliverable | Architecture touchpoint |
| --- | --- | --- |
| **0** | A-ARCH (this doc), A-INV | Decisions locked |
| **1** | A-SCHEMA, TypeScript contracts T-AO-110 | Column + metadata shapes |
| **2** | Registry/session bridge T-AO-210–220 | §3 |
| **3** | Assignment metadata + Handoff v2 T-AO-310, T-AO-430 | §4 |
| **4** | Activity lifecycle + projection T-AO-410, T-AO-610 | §2.3, §7 |
| **5** | A-POLICY, A-PROFILES, prompts | §5.3 |

---

## 10. Open decisions (escalate before coding)

| ID | Question | Default if silent |
| --- | --- | --- |
| D-ARCH-01 | Exact kit `user_version` for orchestration DDL | Next integer after team-execution (8) |
| D-ARCH-02 | Command aliases vs metadata-only bridge period | Metadata bridge first (§3.3) |
| D-ARCH-03 | Whether `spawn-subagent` auto-creates assignment row | **No** — orchestrator `register-assignment` remains separate |

---

## 11. Verification and human approval

### 11.1 Acceptance mapping (T100624 / A-ARCH)

| Criterion | Section |
| --- | --- |
| References foundation decisions | §1–2, §4, §8 |
| Storage/module strategy explicit | §3–4 |
| Subagent/team execution compatibility preserved | §5 |
| Human approval before dependent implementation | §11.2 |
| Verification evidence in deliverable | §11.3 |

### 11.2 Operator review sign-off (required)

| Field | Value |
| --- | --- |
| Artifact | A-ARCH / `AGENT_ORCHESTRATION_ARCHITECTURE.md` |
| Reviewer | _pending_ |
| Decision | ☐ Approve as written &nbsp; ☐ Approve with notes &nbsp; ☐ Reject — revise |
| Notes | |
| Date | |

Dependent tasks (**T100625**, **T100626**, **T100633**, T-AO-110+) should treat this file as **draft** until the table above records approval.

### 11.3 Verification evidence (automated / agent)

| Check | Result |
| --- | --- |
| A-INV merged and cited | Yes — prerequisite artifact in phase branch |
| Three-layer map matches shipped modules | §2.1 — `subagents`, `team-execution`, `task-engine` |
| Storage decision: extend subagent registry | §3 — explicit |
| No parallel assignment store | §1, §4 |
| Dashboard read-only boundary | §7 |
| v1 non-goals listed | §8 |
| `pnpm run check` (repo gate) | Pass — exit 0 on 2026-05-31 (feature/T100624-orchestration-architecture) |

---

## 12. Related artifacts

| Doc | Role |
| --- | --- |
| [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) | Normative product + contract intent |
| [AGENT_ORCHESTRATION_INVENTORY.md](./AGENT_ORCHESTRATION_INVENTORY.md) | As-built surface (A-INV) |
| [AGENT_ORCHESTRATION_TASKS.md](./AGENT_ORCHESTRATION_TASKS.md) | WBS and downstream artifacts |
| `.ai/runbooks/subagent-registry.md` | Operator flows for registry |
| `src/modules/team-execution/assignment-store.ts` | Handoff v1 validator (today) |
| `src/modules/task-engine/agent-activity-store.ts` | Activity kinds + TTL |

---

## 13. Document history

| Date | Change |
| --- | --- |
| 2026-05-31 | Initial A-ARCH for Phase 126 / T100624 |
