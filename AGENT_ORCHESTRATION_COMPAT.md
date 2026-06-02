# AGENT_ORCHESTRATION_COMPAT.md

**Artifact:** A-COMPAT (compatibility and migration note)  
**WBS:** WBS-AO-100 / task **T100633**  
**Requires:** [AGENT_ORCHESTRATION_INVENTORY.md](./AGENT_ORCHESTRATION_INVENTORY.md) (A-INV), [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md) (A-ARCH)  
**Normative intent:** [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md)  
**Blocks:** A-SCHEMA (T-AO-020), WP-1 validators (T-AO-120+), Handoff v2 command work (T-AO-430)  
**Produced:** 2026-05-31  
**Status:** Approved for implementation  

---

## 1. Executive summary

Workflow Cannon v1 orchestration **extends** existing **subagent registry**, **Team Execution**, and **agent activity** surfaces. It does **not** replace command names, retire core tables, or require orchestration metadata for today’s operator flows to keep working.

| Principle | v1 guarantee |
| --- | --- |
| **No silent breaks** | Commands, statuses, and handoff shapes that work today continue to work when new metadata is absent |
| **Additive first** | New fields live in optional JSON metadata, nullable columns, or versioned payload branches |
| **Strict when declared** | Validators enforce orchestration contracts only when `schemaVersion` (or equivalent) is present |
| **Bridge, don’t fork** | AgentDefinition / AgentAssignment concepts map onto existing `kit_subagent_*` and `kit_team_assignments` rows (A-ARCH §3–4) |

```text
Legacy row (no schemaVersion)  →  today’s permissive behavior
Bridge row (schemaVersion: 1)  →  optional strict validation + richer projection
Future column promotion        →  dual-read; metadata mirror until DDL stable
```

---

## 2. Supported subagent registry behavior (unchanged)

Source: A-INV §2.1, §3.1; operator runbook `.ai/runbooks/subagent-registry.md`.

### 2.1 What stays supported without orchestration metadata

| Surface | v1 guarantee |
| --- | --- |
| **Commands** | `list-subagents`, `get-subagent`, `register-subagent`, `retire-subagent`, `spawn-subagent`, `message-subagent`, `close-subagent-session`, `list-subagent-sessions`, `get-subagent-session` |
| **Policy** | Tier B — `policyOperationId: subagents.persist` unchanged |
| **Definition model** | `id`, `displayName`, `description`, `allowedCommands[]`, `retired`, free-form `metadata` JSON |
| **Session model** | `definitionId`, optional `executionTaskId`, `status` (`open`/`closed`), `hostHint`, `metadata`, message log |
| **Host launch** | **Still out of scope** — registry remains record-only; Cursor/host runs the delegated agent |
| **SQLite gate** | `user_version >= 6` (`SUBAGENT_KIT_MIN_USER_VERSION`) preserved |

Definitions that specify **only** `allowedCommands[]` (no orchestration bridge) remain first-class. Dashboard `subagentRegistry` slice behavior is unchanged for legacy rows.

### 2.2 Additive orchestration bridge (optional)

When present, structured orchestration fields may appear under:

```json
{
  "metadata": {
    "schemaVersion": 1,
    "agentDefinition": {
      "role": "task-worker",
      "hostCompatibility": ["cursor"],
      "accessProfileId": "task_worker_strict_v1",
      "contextProfileId": "task_worker_context_v1",
      "modelProfileId": "balanced_v1"
    }
  }
}
```

| Field location | When absent | When `schemaVersion: 1` |
| --- | --- | --- |
| `metadata.agentDefinition` | Ignored; definition behaves as v0 subagent | Validated per future A-SCHEMA; may promote to columns (A-ARCH §3.2) |
| `metadata.agentSession` on sessions | Generic subagent session | Validated AgentSession v1 mirror until session columns land |
| New DDL columns (future kit v8+) | N/A | Dual-read: prefer columns, fall back to metadata bridge |

**Fallback rule:** Readers MUST NOT require orchestration keys to load, list, spawn, or message subagents.

### 2.3 Deprecation wording (none in v1)

- **`allowedCommands[]` is not deprecated** in v1. Orchestration profile refs are additive; capability vocabulary may converge later (A-PROFILES).
- **No command renames** in v1 (`register-subagent` remains canonical; optional aliases deferred — A-ARCH §3.3).
- **Retirement** continues via `retire-subagent` (`retired: true`); definitions are not hard-deleted.

---

## 3. Supported Team Execution behavior (unchanged)

Source: A-INV §2.2, §3.2; A-ARCH §4–5.

### 3.1 What stays supported without assignment metadata

| Surface | v1 guarantee |
| --- | --- |
| **Commands** | `list-assignments`, `register-assignment`, `submit-assignment-handoff`, `block-assignment`, `reconcile-assignment`, `cancel-assignment` |
| **Policy** | Tier B — `policyOperationId: team-execution.persist` unchanged |
| **Status enum** | `assigned`, `submitted`, `blocked`, `reconciled`, `cancelled` — no new terminal states in v1 |
| **Identity** | `supervisorId` / `workerId` opaque instance ids (e.g. `phase-126-delivery-worker`) |
| **Handoff v1** | `{ "schemaVersion": 1, "summary": "…", "evidenceRefs": [] }` — still accepted and stored |
| **Authority** | Supervisor-only `reconcile-assignment`, `cancel-assignment`, `block-assignment`; worker-only `submit-assignment-handoff` |
| **SQLite gate** | `user_version >= 7` (`TEAM_EXECUTION_KIT_MIN_USER_VERSION`) preserved |

Assignments with **empty or legacy** `metadata` (no `schemaVersion`) run the full lifecycle today.

### 3.2 Additive assignment metadata bridge

When `kit_team_assignments.metadata.schemaVersion === 1`, future validators may enforce AgentAssignment fields (A-ARCH §4.2):

```json
{
  "schemaVersion": 1,
  "agentDefinitionId": "task-worker",
  "agentSessionId": "session-abc123",
  "contextProfileId": "task_worker_context_v1",
  "accessProfileId": "task_worker_strict_v1",
  "ownedPaths": ["src/modules/task-engine/dashboard/**"],
  "forbiddenPaths": ["extensions/cursor-workflow-cannon/**"],
  "blockingPolicy": "worker_may_open_blocking_task_and_report"
}
```

| Concern | Legacy (no `schemaVersion`) | Bridge (`schemaVersion: 1`) |
| --- | --- | --- |
| Path/resource rules | Advisory only (operator discipline) | Validated when present; not enforced on disk in v1 |
| Profile refs | Ignored | Validated against A-PROFILES catalog when strict mode on |
| Worker blocker automation | General `create-task` / `report-defect` | Scoped linker deferred (T-AO-330) |

**Fallback rule:** `register-assignment` without structured metadata MUST succeed exactly as today.

### 3.3 Handoff v1 → v2 migration (non-breaking)

| Version | Acceptance | Storage |
| --- | --- | --- |
| **Handoff v1** | Always | `handoff.schemaVersion: 1` — `summary`, optional `evidenceRefs` |
| **Handoff v2** | When submitted with v2 discriminator | Same `handoff` JSON column; v1 parser retained as fallback |

**Implementation contract (WP-3):**

1. `submit-assignment-handoff` tries Handoff v2 validator when `schemaVersion >= 2`.
2. On v2 miss, fall back to `validateHandoffContractV1` (`assignment-store.ts`).
3. Reject only when **neither** parser accepts the payload.
4. Do **not** require v2 fields for assignments whose metadata lacks orchestration bridge.

**Deprecation:** Handoff v1 is **not** removed in v1. Wording for maintainers: *“v1 remains supported; v2 is preferred for orchestrated assignments.”*

---

## 4. Agent activity and maintainer delivery compatibility

Source: A-INV §2.3–2.4, §3.3; `.ai/AGENT-CLI-MAP.md` (WC Agent status workflow).

### 4.1 Activity lease behavior (unchanged core)

| Surface | v1 guarantee |
| --- | --- |
| **Commands** | `set-agent-activity`, `clear-agent-activity` |
| **Kinds** | Existing enum in `agent-activity-store.ts` — **add** kinds only; do not rename or remove |
| **TTL** | Default 10 minutes; clamp 30s–1h |
| **Dashboard** | `agentStatus = liveActivity ?? derived` until multi-lease merge ships (A-ARCH §7.3) |

Optional future fields (`assignmentId`, `sessionId`, Activity v1 lifecycle) are additive on argv and lease rows. Missing linkage fields fall back to today’s task/phase/pr labels.

### 4.2 Task engine / delivery loop (unchanged authority)

Maintainer delivery continues per `.ai/playbooks/task-to-phase-branch.md`:

- `run-transition`, `create-task`, `update-task`, `completion-preflight`, `wait-for-pr-checks` remain authoritative.
- `set-agent-activity` / `submit-assignment-handoff` are **additive** hygiene steps, not substitutes for Tier A transitions.
- Live activity is **not** evidence for `run-transition` `complete`.

### 4.3 Git-canonical task store vs plan materialization (critical compat note)

When `tasks.canonicalAuthority` is **`git-event-log`** (this repo default):

| Path | Publishes `task.created` to git? | Safe for worker `run-transition`? |
| --- | --- | --- |
| **`create-task`** / **`apply-task-batch`** (create op) | **Yes** | **Yes** |
| **`persist-planning-execution-drafts`** | **No** (SQLite only today — A-INV §10) | **No** — fails with `task-state-canonical-publish-failed` / `task-not-found` |
| **`task-sync-hydrate`** on drift | Rebuilds SQLite from git | **Can drop** sqlite-only plan rows — do not hydrate casually during phase drain |

**Operator fallback when a plan row exists only in SQLite:**

1. Prefer **`apply-task-batch`** with `{ "kind": "create-task", "payload": { "allocateId": false, "id": "T###", … } }` and JSON `policyApproval` to publish `task.created` + rich fields to git (requires row absent from SQLite or use documented recovery).
2. Do **not** hand-edit `.workspace-kit/tasks/workspace-kit.db` for routine lifecycle.
3. Align plan finalize path with `finalizeCanonicalCreateTask` (engineering follow-up — see A-INV §11 item 7).

This document records the defect class tracked for Phase 127 (**T100634**); v1 compat **documents** the gap until persist-path publishes git events.

---

## 5. Optional new fields by command (additive)

Future WP-1 / WP-3 implementations MUST treat new argv fields as **optional**. Required-field tightening applies only when callers opt into structured metadata or explicit contract ids.

| Command | Optional additions (illustrative) | Required today |
| --- | --- | --- |
| `register-subagent` | `role`, profile ids, `metadata.schemaVersion`, `metadata.agentDefinition` | `subagentId`, `allowedCommands`, Tier B approval |
| `spawn-subagent` | `modelTier`, `currentAssignmentId`, `metadata.agentSession` | `subagentId`, Tier B approval |
| `register-assignment` | Full assignment metadata bridge (§3.2) | `executionTaskId`, `supervisorId`, `workerId` |
| `submit-assignment-handoff` | Handoff v2 payload branches | v1 `summary` minimum |
| `set-agent-activity` | `assignmentId`, `sessionId`, `activityId`, extended `details` | supported `kind` |

**JSON Schema / CLI contract rule:** New properties use `additionalProperties` tolerance on existing command schemas until a major contract version is explicitly approved.

---

## 6. Fallback matrix (metadata absent)

| Layer | Trigger for strict mode | Fallback when absent |
| --- | --- | --- |
| Subagent definition | `metadata.schemaVersion === 1` | v0 definition: `allowedCommands` + optional opaque `metadata` |
| Subagent session | `metadata.schemaVersion === 1` | Open/closed session with messages; no assignment linkage required |
| Team assignment | `metadata.schemaVersion === 1` | Supervisor/worker/task ids + handoff v1 only |
| Handoff payload | `handoff.schemaVersion >= 2` | v1 `{ summary, evidenceRefs? }` parser |
| Activity lease | Activity v1 lifecycle spec (future) | TTL lease with kind + task/phase labels |
| Dashboard projection | Structured merge contract (A-PROJECTION) | Existing derived + single live lease override |

**Workspace config:** `orchestration.strictMetadataValidation` defaults **`false`** until WP-3 commands ship (A-ARCH §6.5).

---

## 7. Breaking-change controls and migration phases

Aligned with A-ARCH §6 and A-INV §10.

| Risk | v1 mitigation |
| --- | --- |
| Handoff v2 rejects legacy handoffs | Dual parser; v1 always accepted |
| New assignment rules break scripts | Rules gated on `metadata.schemaVersion === 1` |
| Subagent column renames | **Rejected** for v1 — additive DDL only |
| Activity kind rename/remove | **Rejected** — version kinds, add new values |
| Dashboard heuristic drift | Snapshot tests when projection builder lands |
| Planning generation drift | Pass fresh `expectedPlanningGeneration` on mutating commands |
| SQLite-only tasks under git authority | Use §4.3 fallback; fix persist path in engineering task |

### 7.1 Migration ladder (recommended)

1. **Document** — A-COMPAT (this file) + approved A-ARCH.
2. **Schema pack** — A-SCHEMA / fixtures; no runtime enforcement.
3. **Bridge validators** — strict only when `schemaVersion` present.
4. **Command argv extensions** — optional fields documented in A-COMMANDS.
5. **Column promotion** — kit `user_version` bump; dual-read metadata + columns.
6. **Strict config opt-in** — workspace flag before global enforce.

### 7.2 Rollback

- Kit SQLite backup + restore for failed DDL (operator runbook).
- Git task-state rollback via branch revert on `workflow-cannon/task-state` (maintainer-only, coordinated with phase journal).

---

## 8. Compatibility acceptance mapping (T100633 / A-COMPAT)

| Criterion | Section |
| --- | --- |
| Existing workflows remain valid | §2.1, §3.1, §4, §6 |
| New orchestration metadata is additive where possible | §2.2, §3.2, §5 |
| Fallback behavior is explicit | §6, §3.3 |
| Verification evidence in deliverable | §11 |
| Operator review sign-off | §11.2 |

---

## 9. Verification evidence (automated / agent)

| Check | Result |
| --- | --- |
| A-INV cited for as-built surfaces | Yes — §2–4 reference inventory rows |
| A-ARCH cited for bridge strategy | Yes — §1–3, §7 align with architecture decisions |
| Subagent registry compat documented | §2 |
| Team Execution compat documented | §3 |
| Metadata bridge + fallback explicit | §2.2, §3.2, §6 |
| Git-canonical / persist-path gap documented | §4.3 |
| Deprecation wording (v1: none) | §2.3, §3.3 |
| `pnpm run check` (repo gate) | Pass — exit 0 on 2026-05-31 (feature/T100633-orchestration-compat) |

---

## 10. Operator review sign-off (required)

| Field | Value |
| --- | --- |
| Artifact | A-COMPAT / `AGENT_ORCHESTRATION_COMPAT.md` |
| Reviewer | Antigravity |
| Decision | ☑ Approve as written |
| Notes | Approved per user request. |
| Date | 2026-06-02 |

Dependent tasks (**T100625**, **T100626**, T-AO-110+) should treat orchestration strict validation as **off** until this table records approval.

---

## 11. Related artifacts

| Doc | Role |
| --- | --- |
| [AGENT_ORCHESTRATION_INVENTORY.md](./AGENT_ORCHESTRATION_INVENTORY.md) | As-built surface (A-INV) |
| [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md) | Storage and boundary decisions (A-ARCH) |
| [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) | Normative product intent |
| [AGENT_ORCHESTRATION_TASKS.md](./AGENT_ORCHESTRATION_TASKS.md) | WBS and downstream artifacts |
| `.ai/runbooks/subagent-registry.md` | Subagent operator flow |
| `.ai/runbooks/task-state-git-operator.md` | Git-canonical task-state recovery |
| `src/modules/team-execution/assignment-store.ts` | Handoff v1 validator (today) |

---

## 12. Document history

| Date | Change |
| --- | --- |
| 2026-05-31 | Initial A-COMPAT for Phase 126 / T100633 |
