# AGENT_ORCHESTRATION_POLICY.md

**Artifact:** A-POLICY (orchestration mutation authority + policy map)  
**WBS:** WBS-AO-040 / task **T100627**  
**Requires:** [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md), [AGENT_ORCHESTRATION_COMMANDS.md](./AGENT_ORCHESTRATION_COMMANDS.md) (T100626), [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md), `.ai/POLICY-APPROVAL.md`  
**Blocks:** A-PROFILES (T100628), TypeScript contracts (T-AO-110), WP-3 enforcement hardening (T-AO-340)  
**Produced:** 2026-05-31  
**Status:** Draft for human approval — command handlers must not enforce contested authority rules until sign-off below.

---

## 1. Purpose

This document is the **mutation authority and policy map** for Workflow Cannon agent orchestration v1. It resolves open policy surfaces flagged in **AGENT_ORCHESTRATION_COMMANDS.md** §12 (P-CMD-01 through P-CMD-12) and normative intent in **AGENT_ORCHESTRATION_FOUNDATION.md** §6.

It defines:

- **Tiered mutation authority** — Orchestration Agent vs Task Work Agent vs read-only roles
- **Command allowlists and denylists** mapped to `workspace-kit run` commands
- **Blocked worker flow** — bounded create/report/stop semantics; no self-reconcile or self-unblock
- **Task transition rules** — when workers may use Tier A `run-transition` vs when orchestrator must act
- **Reconcile / cancel / unblock authority** — supervisor-only assignment lifecycle
- **`policyApproval` surfaces** — Tier A/B requirements, dry-run, dashboard elevation
- **Forbidden manual DB edits** — task store, assignment store, activity leases, policy traces

Command contracts and argv shapes live in **AGENT_ORCHESTRATION_COMMANDS.md** (A-COMMANDS). JSON shapes live in **AGENT_ORCHESTRATION_CONTRACTS.md** (A-SCHEMA). Workflow Cannon policy canon: `.ai/POLICY-APPROVAL.md`, `.ai/AGENT-CLI-MAP.md`.

---

## 2. Authority model (normative)

### 2.1 Roles

| Role | `AgentDefinition.role` | Authority summary |
| --- | --- | --- |
| **Orchestration Agent** | `orchestrator` | Owns strategic task/assignment lifecycle, reconciliation, unblock/resume, phase planning intake |
| **Task Work Agent** | `task_worker` | Owns scoped delivery on a single active assignment: activity, handoff, bounded blocker/defect reporting |
| **Reviewer / Validator** | `reviewer`, `validator` | Read-heavy; handoff evidence only unless explicitly assigned orchestrator hat (out of v1 default) |
| **Human operator** | `manual` | May invoke any command with valid JSON **`policyApproval`**; not impersonated by workers |
| **Supervisor id on assignment row** | `supervisorId` | **Orchestrator instance id** — required for `block-assignment`, `reconcile-assignment`, `cancel-assignment` |

### 2.2 Core invariants

```text
1. Orchestrator owns assignment terminal states (reconciled, cancelled, supervisor-blocked).
2. Worker owns self-report paths (handoff submit, report-assignment-blocked) but cannot reconcile, cancel, or supervisor-block.
3. Worker cannot unblock itself — resume requires orchestrator action + host prompt.
4. Task DB mutations outside assignment scope require orchestrator authority (or general maintainer delivery loop for human operators).
5. Chat, slash commands, and dashboard drawer clicks are NOT policyApproval — JSON on wk run argv is required (see .ai/POLICY-APPROVAL.md).
6. Dashboard and terminal agents use the same kit validation; only rationale UX differs (P-CMD-08).
```

### 2.3 Enforcement layers (implementation target)

| Layer | v1 behavior | WP-3 hardening (T-AO-340) |
| --- | --- | --- |
| **Documentation** | This artifact + A-COMMANDS | Signed-off policy |
| **Command argv validation** | Role hints via `workerId` / `supervisorId` match | Hard deny with `assignment-authority-denied`, `worker-scope-violation` |
| **Access profiles** | Declarative in A-PROFILES (T100628) | `orchestrator_access_v1`, `task_worker_strict_v1` capability matrix |
| **Agent prompts** | T-AO-510 / T-AO-520 | Profile-bound command lists |

Until WP-3 ships, agents **must** follow this document; handlers may still be permissive on contested paths.

---

## 3. Mutation authority matrix (P-CMD-01)

Legend: **Y** = allowed (with `policyApproval` when Tier A/B), **N** = forbidden, **R** = read-only, **O** = orchestrator only, **W** = worker only (own assignment), **H** = human maintainer delivery loop (not worker orchestration path).

### 3.1 Agent registry and sessions

| Command | Orchestrator | Worker | Notes |
| --- | --- | --- | --- |
| `register-subagent` | **Y** | **N** | Orchestrator registers role definitions |
| `retire-subagent` | **Y** | **N** | |
| `spawn-subagent` | **Y** | **Y** | Worker may open **own** session; orchestrator opens worker sessions |
| `close-subagent-session` | **Y** | **Y** | Own session only for worker |
| `message-subagent` | **Y** | **N** | Orchestrator → worker messaging |
| `update-subagent-session` | **O** | **N** | **P-CMD-06:** orchestrator links assignment/activity; worker must not self-set `currentAssignmentId` to bypass assignment registration |
| `list-subagents`, `get-subagent` | **R** | **R** | |
| `list-subagent-sessions`, `get-subagent-session` | **R** | **R** | Worker filters to own `sessionId` |

### 3.2 Assignments and handoffs

| Command | Orchestrator | Worker | Notes |
| --- | --- | --- | --- |
| `register-assignment` | **O** | **N** | Supervisor creates bounded assignment |
| `list-assignments` | **R** | **R** | Worker filters `workerId=self` |
| `submit-assignment-handoff` | **N** | **W** | Worker submits **own** handoff only |
| `report-assignment-blocked` | **N** | **W** | Worker self-report; **P-CMD-02** |
| `block-assignment` | **O** | **N** | Requires `supervisorId`; worker **cannot** pass supervisor id (**P-CMD-02**) |
| `reconcile-assignment` | **O** | **N** | **P-CMD-03:** hard deny when caller is row `workerId` |
| `cancel-assignment` | **O** | **N** | **P-CMD-03** |
| `reconcile-assignment` (resume path) | **O** | **N** | Unblock/resume is orchestrator via reconcile + session update — not worker |

### 3.3 Blocker and defect paths

| Command | Orchestrator | Worker | Notes |
| --- | --- | --- | --- |
| `report-assignment-blocker` | **N** | **W** | Scoped linked blocker only; **P-CMD-04**, **P-CMD-05** |
| `report-assignment-defect` | **N** | **W** | Scoped defect only |
| `create-task` | **O** | **N** | General create; workers use scoped commands |
| `report-defect` | **O** | **N** | General intake |
| `create-task` (worker direct) | **N** | **N** | **P-CMD-04:** reject when active assignment context exists |

### 3.4 Activity

| Command | Orchestrator | Worker | Notes |
| --- | --- | --- | --- |
| `set-agent-activity` | **Y** | **W** | Own `agentId` only for worker |
| `clear-agent-activity` | **Y** | **W** | Own `agentId` only for worker |

### 3.5 Task engine (execution tasks)

| Command | Orchestrator | Worker | Notes |
| --- | --- | --- | --- |
| `run-transition` `start` | **H** / **O** | **H** | Maintainer loop: worker agent on **assigned executionTaskId** may start |
| `run-transition` `complete` | **H** / **O** | **H** | **P-CMD-09** — see §6 |
| `run-transition` `block` / `unblock` | **O** | **N** | Task-level block/unblock is orchestrator/human |
| `run-transition` other | **O** | **N** | accept, cancel, reprioritize paths |
| `completion-preflight`, `wait-for-pr-checks` | **R** | **R** | |
| `list-tasks`, `get-task`, `get-next-actions` | **R** | **R** | |
| `get-orchestration-status` | **R** | **R** | |

### 3.6 Maintainer delivery overlay

Human or agent operators following **`.ai/playbooks/task-to-phase-branch.md`** may run the full Tier A lifecycle on **their assigned execution task** (`T###`) without orchestrator reconcile of the assignment row — orchestration commands are **additive** when supervision is implicit (A-COMMANDS §11.3). This does **not** grant workers permission to reconcile assignments or unblock themselves on orchestrated multi-agent paths.

---

## 4. Assignment lifecycle authority

### 4.1 State machine (row `status`)

```text
assigned → submitted (worker handoff)
assigned → blocked (worker report-assignment-blocked OR orchestrator block-assignment)
submitted → reconciled (orchestrator reconcile-assignment only)
submitted → blocked (orchestrator block-assignment)
* → cancelled (orchestrator cancel-assignment only)
```

### 4.2 Reconcile rules (P-CMD-03, P-CMD-12)

| Rule | Policy |
| --- | --- |
| **Who may reconcile** | Caller must match assignment `supervisorId` (orchestrator instance) |
| **Worker self-reconcile** | **Forbidden** — return `assignment-authority-denied` |
| **Precondition** | Assignment row `status === submitted` with Handoff v2 present (or v1 fallback) |
| **Handoff v2 `status` vs row** | **P-CMD-12:** Handoff `status` (`completed`, `blocked`, `partial`, `failed`, `needs_review`) is **evidence**; row stays `submitted` until orchestrator reconciles, blocks, or cancels |
| **Reconcile after `needs_review`** | Orchestrator may reconcile with rework notes or block for follow-up assignment |
| **Reconcile after worker `blocked` report** | Orchestrator reconciles only after blocker task resolved and worker resumed — not while worker still blocked |

### 4.3 Cancel rules

| Rule | Policy |
| --- | --- |
| **Who may cancel** | Orchestrator (`supervisorId`) only |
| **Worker** | May stop work and report blocked; **cannot** cancel assignment or parent task |
| **Terminal effect** | Cancel clears expectation of handoff; orchestrator should `close-subagent-session` when appropriate |

### 4.4 Block and unblock rules (P-CMD-02)

| Path | Actor | Command | Effect |
| --- | --- | --- | --- |
| **Worker self-report** | Worker | `report-assignment-blocked` | Row → `blocked` (worker-attested); no `supervisorId` in argv |
| **Supervisor block** | Orchestrator | `block-assignment` | Row → `blocked` (supervisor-attested); requires `supervisorId` |
| **Worker forbidden** | Worker | `block-assignment` | **Denied** — cannot supply orchestrator `supervisorId` |
| **Unblock / resume** | Orchestrator | `reconcile-assignment` after fix, OR transition row `assigned` via orchestrator workflow; `update-subagent-session { status: "active" }`; host prompt to worker | Worker **must not** call `reconcile-assignment`, `block-assignment` with unblock semantics, or self-set session to `active` to bypass supervisor |

**No worker self-unblock:** There is **no** worker command that transitions `blocked` → `assigned` on the assignment row. Resume is always orchestrator-mediated (A-COMMANDS §11.4).

---

## 5. Blocked worker flow (bounded)

Normative sequence: **AGENT_ORCHESTRATION_FOUNDATION.md** §427–436, **AGENT_ORCHESTRATION_COMMANDS.md** §11.4.

### 5.1 Worker steps (required order)

```text
1. report-assignment-blocker   → linked task with provenance (when blockingPolicy allows)
2. report-assignment-blocked   → assignment row blocked (workerId match)
3. set-agent-activity          → kind: "blocked"
4. submit-assignment-handoff   → optional; handoff.status: "blocked", blockers[] populated
5. STOP                        → no reconcile, no complete, no resume until orchestrator acts
```

### 5.2 Worker-created blocker tasks (P-CMD-04, P-CMD-05)

| Rule | Policy |
| --- | --- |
| **Allowed task kinds** | `improvement` or dedicated `blocker` type (operator config); **not** feature, phase-plan, or unrelated scope |
| **Provenance** | `metadata.provenance.kind === "assignment_blocker"` with `assignmentId`, `workerId`, `executionTaskId` |
| **Linkage** | `dependsOn` / `relatedTaskId` → execution task |
| **`blockingPolicy`** | **P-CMD-05:** When assignment metadata `blockingPolicy !== "worker_may_open_blocking_task_and_report"`, deny `report-assignment-blocker` with `worker-scope-violation` |
| **Default when omitted** | Deny worker blocker create (fail closed) |
| **Defect path** | Same bounds for `report-assignment-defect` with `kind: "assignment_defect"` |

### 5.3 Worker-created bug/defect rules

Workers **may** file defects tied to assignment scope only. They **may not**:

- Create broad feature tasks via `create-task`
- Transition unrelated tasks
- Reprioritize phase queue
- Use sqlite-only plan persist paths (**P-CMD-11**)

### 5.4 Orchestrator steps after worker block

```text
1. list-assignments / get-task on blockerTaskId
2. create-task / run-transition / human gate as needed to resolve blocker
3. block-assignment (optional supervisor attestation) OR prepare reconcile after fix
4. update-subagent-session { status: "active" }
5. message-subagent or host prompt — worker resumes
```

Worker resume:

```text
set-agent-activity { kind: "working_task" }
→ continue from assignmentPromptSummary
```

---

## 6. Task transition authority (P-CMD-09)

### 6.1 Tier A `run-transition` and roles

| Action | Orchestrator | Worker (assigned execution task) | Guard |
| --- | --- | --- | --- |
| `start` | **Y** (planning/orchestration tasks) | **Y** (own `executionTaskId`) | Tier A **`policyApproval`** + `expectedPlanningGeneration` when policy `require` |
| `complete` | **Y** | **Conditional** | See below |
| `block`, `unblock`, `cancel`, `accept`, … | **Y** | **N** | Strategic lifecycle |

### 6.2 Worker `complete` vs assignment state (**P-CMD-09**)

**Default rule (orchestrated path):** Worker **must not** `run-transition complete` while assignment row is `assigned` without submitted handoff.

| Scenario | Worker may `complete`? |
| --- | --- |
| Maintainer delivery loop only (no assignment row) | **Yes** — after `completion-preflight`, PR evidence, playbook loop |
| Assignment `assigned`, no handoff | **No** — submit handoff first or report blocked |
| Assignment `submitted`, orchestrator not yet reconciled | **Conditional waiver** — see below |
| Assignment `blocked` | **No** — await orchestrator |
| Assignment `reconciled` / `cancelled` | **N/A** — terminal assignment |

**Waiver (maintainer overlay):** When `metadata.deliveryEvidence` satisfies **`.ai/playbooks/task-to-phase-branch.md`** and assignment handoff is **optional** per phase policy, worker **may** complete execution task if:

1. Handoff submitted **or** explicit `metadata.deliveryWaiver` documents orchestrator bypass for solo maintainer delivery, **and**
2. `completion-preflight` passes, **and**
3. Tier A **`policyApproval`** present.

**Recommended orchestrated path:** Handoff `submitted` → orchestrator `reconcile-assignment` → then worker or orchestrator runs `complete` with shared evidence.

### 6.3 Orchestrator task transitions

Orchestrator **may** transition orchestration/planning tasks, blocker-resolution tasks, and execution tasks where authorized. Orchestrator **must not** `complete` worker implementation tasks without evidence (foundation §362–373).

### 6.4 Forbidden task mutations (all workers)

- Hand-edit SQLite / JSON task store (see §9)
- `run-transition` on tasks outside assigned `executionTaskId` scope
- `complete` parent phase tasks without delivery evidence
- Direct SQL on `kit_tasks`, `kit_task_transitions`, planning tables

---

## 7. policyApproval surfaces

Canon: **`.ai/POLICY-APPROVAL.md`**, **AGENT_ORCHESTRATION_COMMANDS.md** §3.1.

### 7.1 Tier summary

| Tier | `policyOperationId` | Orchestration commands |
| --- | --- | --- |
| **A** | `tasks.run-transition` | `run-transition` |
| **B** | `subagents.persist` | `register-subagent`, `retire-subagent`, `spawn-subagent`, `message-subagent`, `close-subagent-session`, `update-subagent-session` |
| **B** | `team-execution.persist` | `register-assignment`, `submit-assignment-handoff`, `block-assignment`, `reconcile-assignment`, `cancel-assignment`, `report-assignment-blocked` |
| **B** | `tasks.create` | `create-task`, `report-defect`, `report-assignment-blocker`, `report-assignment-defect` |
| **B** | `tasks.set-agent-activity` | `set-agent-activity`, `clear-agent-activity` |
| **Read (C)** | — | `list-*`, `get-*`, `dashboard-summary`, `get-orchestration-status`, `completion-preflight` |

**Agents:** JSON **`policyApproval`** on third argv. Chat is **not** approval. **`WORKSPACE_KIT_POLICY_APPROVAL` env** does **not** satisfy `run` path.

**Planning generation:** When `tasks.planningGenerationPolicy === "require"`, pass **`expectedPlanningGeneration`** from latest `list-tasks` / `get-next-actions` on mutating commands.

### 7.2 Dry-run approval (**P-CMD-07**)

| Command class | `dryRun: true` requires `policyApproval`? |
| --- | --- |
| **Read commands** | No |
| **Mutating orchestration commands** | **No** for validation-only dry-run that performs **no writes** |
| **Mutating dry-run that returns would-be task ids** | **Yes** — same Tier B as live write when response includes policy-sensitive identifiers |
| **`run-transition`** | **No dry-run** — use `completion-preflight` |

Rationale: dry-run validation should be cheap for agents rehearsing argv; approval is required when dry-run would expose or reserve production identifiers (align with `backfill-task-feature-links` pattern in `.ai/POLICY-APPROVAL.md`).

### 7.3 Dashboard elevation (**P-CMD-08**)

Workflow Cannon Dashboard (Cursor extension) uses the same kit gates. Elevated drawer actions (including **block/cancel assignment**, **register subagent**, critical phase-note dismiss, rewind checkpoint) require operator rationale text; routine actions auto-fill structured rationale.

| Surface | Worker impact |
| --- | --- |
| Dashboard block/cancel | **Orchestrator operator only** — workers use terminal CLI, not elevated drawer |
| Agent terminal | Explicit task-specific **`policyApproval.rationale`** — do not paste dashboard boilerplate |

Cross-ref: `.ai/POLICY-APPROVAL.md` → **Workflow Cannon Dashboard**; `extensions/cursor-workflow-cannon/src/policy/dashboard-policy-tier.ts`.

### 7.4 Session grants and traces

- Traces: `.workspace-kit/policy/traces.jsonl`
- Session grants: `kit_session_grants` when using `"scope":"session"` on **`policyApproval`**
- Workers should use per-command rationale citing assignment/task id

---

## 8. Git-canonical task hygiene (**P-CMD-11**)

| Rule | Policy |
| --- | --- |
| **Phase task materialization** | Orchestrator uses git-canonical plan paths (A-INV §10); manifest tasks `T100623`–`T100633` live in repo + SQLite mirror |
| **Worker plan persist** | Workers **must not** invoke sqlite-only planning backfill or hand-edit plan artifacts |
| **create-task scope** | Orchestrator creates planned phase tasks; workers create **only** assignment-linked blockers/defects via scoped commands |
| **task-sync-hydrate** | Operator/recovery command only — not routine worker path |

---

## 9. Forbidden manual DB and file edits

Agents **must not** hand-edit kit-owned persistence for routine orchestration (`.ai/AGENTS.md` A025, `.ai/AGENT-CLI-MAP.md`).

| Store / file | Forbidden manual edit | Use instead |
| --- | --- | --- |
| `.workspace-kit/tasks/workspace-kit.db` (tasks, transitions) | Status changes, insert tasks | `create-task`, `run-transition`, `update-task` |
| `kit_team_assignments` | status, handoff, metadata | `register-assignment`, `submit-assignment-handoff`, `report-assignment-blocked`, `reconcile-assignment`, … |
| `kit_agent_activity_leases` | activity rows | `set-agent-activity`, `clear-agent-activity` |
| `kit_subagent_definitions` / `kit_subagent_sessions` | registry | `register-subagent`, `spawn-subagent`, `update-subagent-session`, … |
| `.workspace-kit/policy/traces.jsonl` | append approval | CLI **`policyApproval`** only |
| `.workspace-kit/tasks/state.json` | entire file (JSON opt-out mode) | Same commands as SQLite path |

**Recovery exception:** Documented maintainer recovery only (corruption, migration) with human operator sign-off — not worker or orchestrator routine.

**Dashboard rule:** UI **never** mutates orchestration source tables directly; all writes go through **`wk run`** (foundation §1225).

---

## 10. Strict validation flag (**P-CMD-10**)

When workspace config `orchestration.strictMetadataValidation === true` (default **false** until WP-3):

| Mode | Behavior |
| --- | --- |
| **Strict** | Fail closed on A-SCHEMA violations for AgentDefinition, AgentSession, assignment metadata v1, Handoff v2, Activity v1 |
| **Permissive (default)** | Unknown fields stored in `metadata`; validate when `schemaVersion` present |

**Operator opt-in:** Set via workspace-kit config mutation (env **`WORKSPACE_KIT_POLICY_APPROVAL`** lane — not `run` path). Agents should not toggle this during worker delivery.

**Policy interaction:** Authority checks (this document) apply in **both** modes; strict mode adds schema fail-closed before authority evaluation.

---

## 11. P-CMD resolution index

| ID | Resolution | Section |
| --- | --- | --- |
| **P-CMD-01** | Explicit role → command matrix | §3 |
| **P-CMD-02** | Worker cannot use `block-assignment`; use `report-assignment-blocked` | §3.2, §4.4 |
| **P-CMD-03** | Worker hard deny on `reconcile-assignment`, `cancel-assignment` | §3.2, §4.2–4.3 |
| **P-CMD-04** | Worker uses scoped commands; general `create-task` denied in assignment context | §3.3, §5.2 |
| **P-CMD-05** | `blockingPolicy` must be `worker_may_open_blocking_task_and_report` | §5.2 |
| **P-CMD-06** | `update-subagent-session` orchestrator-only | §3.1 |
| **P-CMD-07** | Dry-run: no approval for validation-only; yes when sensitive ids returned | §7.2 |
| **P-CMD-08** | Dashboard elevation unchanged; cross-ref POLICY-APPROVAL | §7.3 |
| **P-CMD-09** | Worker `complete` requires handoff + reconcile or documented waiver | §6.2 |
| **P-CMD-10** | Strict validation operator opt-in | §10 |
| **P-CMD-11** | Git-canonical plan; no worker sqlite-only persist | §8 |
| **P-CMD-12** | Handoff v2 status is evidence; orchestrator reconciles | §4.2 |

---

## 12. Example — blocked worker with policy gates

```bash
# Worker (blockingPolicy allows)
pnpm exec wk run report-assignment-blocker '{
  "assignmentId": "A-phase126-T100628",
  "workerId": "phase-126-delivery-worker",
  "title": "Missing A-POLICY sign-off blocks profile work",
  "summary": "T100628 requires approved A-POLICY per dependency graph.",
  "evidence": "AGENT_ORCHESTRATION_TASKS.md T-AO-050 Requires: A-SCHEMA, A-POLICY",
  "expectedPlanningGeneration": 4612,
  "policyApproval": {"confirmed": true, "rationale": "assignment-scoped blocker for T100628 worker"}
}'

pnpm exec wk run report-assignment-blocked '{
  "assignmentId": "A-phase126-T100628",
  "workerId": "phase-126-delivery-worker",
  "reason": "Upstream policy artifact not approved",
  "blockerTaskId": "T100639",
  "policyApproval": {"confirmed": true, "rationale": "worker self-report blocked on assignment"}
}'

# Orchestrator (after fix) — worker CANNOT run these:
pnpm exec wk run reconcile-assignment '{
  "assignmentId": "A-phase126-T100628",
  "supervisorId": "phase-126-orchestrator",
  "policyApproval": {"confirmed": true, "rationale": "blocker cleared; reconcile handoff"}
}'
```

---

## 13. Verification and human approval

### 13.1 Acceptance mapping (T100627 / A-POLICY)

| Criterion | Section |
| --- | --- |
| Tiered mutation authority explicit | §2, §3 |
| Worker blocker flow supported and bounded | §5 |
| No worker self-reconcile or self-unblock | §4.2, §4.4 |
| Policy approval requirements clear | §7 |
| P-CMD-01–12 resolved | §11 |
| Forbidden manual DB edits documented | §9 |
| Verification evidence + operator sign-off | §13.2–13.3 |

### 13.2 Operator review sign-off (required)

| Field | Value |
| --- | --- |
| Artifact | A-POLICY / `AGENT_ORCHESTRATION_POLICY.md` |
| Reviewer | _pending_ |
| Decision | ☐ Approve as written &nbsp; ☐ Approve with notes &nbsp; ☐ Reject — revise |
| Notes | |
| Date | |

Dependent tasks (**T100628**, **T100632**, T-AO-110+, T-AO-340) should treat authority rules as **draft** until the table above records approval.

### 13.3 Verification evidence (automated / agent)

| Check | Result |
| --- | --- |
| Resolves A-COMMANDS §12 (P-CMD-01–12) | §11 index |
| Aligns with foundation §6 mutation authority | §2–§6 |
| Aligns with `.ai/POLICY-APPROVAL.md` lanes | §7 |
| Orchestrator vs worker reconcile/cancel/block/unblock | §4 |
| Worker scoped blocker/defect create | §5 |
| Forbidden manual task DB edits | §9 |
| `pnpm run check` (repo gate) | Pass — exit 0 on 2026-05-31 (feature/T100627-orchestration-policy) |

---

## 14. Related artifacts

| Doc / path | Role |
| --- | --- |
| [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) | Normative product intent (§6 authority) |
| [AGENT_ORCHESTRATION_COMMANDS.md](./AGENT_ORCHESTRATION_COMMANDS.md) | Command contracts (A-COMMANDS) |
| [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) | JSON shapes (A-SCHEMA) |
| [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md) | Storage bridge (A-ARCH) |
| [AGENT_ORCHESTRATION_INVENTORY.md](./AGENT_ORCHESTRATION_INVENTORY.md) | As-built commands (A-INV) |
| `.ai/POLICY-APPROVAL.md` | Approval lanes |
| `.ai/AGENT-CLI-MAP.md` | Tier table and copy-paste JSON |
| `.ai/playbooks/task-to-phase-branch.md` | Maintainer delivery overlay |
| `src/contracts/builtin-run-command-manifest.json` | Command registry |

---

## 15. Document history

| Date | Change |
| --- | --- |
| 2026-05-31 | Initial A-POLICY for Phase 126 / T100627 |
