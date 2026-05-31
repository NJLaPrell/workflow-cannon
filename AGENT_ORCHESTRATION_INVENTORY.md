# AGENT_ORCHESTRATION_INVENTORY.md

**Artifact:** A-INV (current orchestration surface inventory)  
**WBS:** T-AO-000 / task **T100623**  
**Scope baseline:** `AGENT_ORCHESTRATION_FOUNDATION.md`, `AGENT_ORCHESTRATION_TASKS.md`  
**Produced:** 2026-05-31  
**Search terms used:** `subagent`, `team-execution`, `agent-activity`, `assignment`, `handoff`, `DashboardAgentStatus`, `kit_subagent`, `kit_team_assignments`, `kit_agent_activity_leases`, `policyOperationId`, `submit-assignment-handoff`, `set-agent-activity`, `report-defect`, `create-task`, `run-transition`, `persist-planning-execution-drafts`, `canonicalAuthority`

---

## 1. Executive summary

Workflow Cannon already ships **three orchestration-adjacent persistence layers** in unified kit SQLite:

| Layer | Module | Primary tables | Host launch? |
| --- | --- | --- | --- |
| **Agent registry (v0)** | `subagents` | `kit_subagent_definitions`, `kit_subagent_sessions`, `kit_subagent_messages` | No — record-only |
| **Assignment / handoff (v1)** | `team-execution` | `kit_team_assignments` | No — supervisor/worker contract |
| **Live activity (v0)** | `task-engine` | `kit_agent_activity_leases` | No — TTL leases |

The **dashboard** consumes these via `dashboard-summary` (`build-dashboard-base.ts`): derived `agentStatus` from task/planning/team/subagent facts, overridden by a **single** non-expired live activity lease when present. There is **no** unified `DashboardAgentActivitySummary` projection builder yet (planned T-AO-610).

**Foundation gaps** (per `AGENT_ORCHESTRATION_TASKS.md`): AgentDefinition v1, AgentSession v1, structured assignment metadata v1, Handoff v2, Activity v1 lifecycle spec enforcement, worker-scoped blocker/bug path, orchestration profile catalog, and projection merge contract.

---

## 2. Modules and persistence

### 2.1 Subagent registry (`src/modules/subagents/`)

| Path | Role |
| --- | --- |
| `subagent-store.ts` | CRUD for definitions, sessions, messages; dashboard summarize helper |
| `index.ts` | Module router — all subagent commands |
| `config.md` | Module config surface |
| `instructions/*.md` | Per-command agent payloads (9 commands) |

**SQLite requirements:** `user_version >= 6` (`SUBAGENT_KIT_MIN_USER_VERSION`).

**Tables:**

- `kit_subagent_definitions` — id, displayName, description, `allowedCommands[]`, retired, metadata JSON
- `kit_subagent_sessions` — id, definitionId, executionTaskId, status (`open`/`closed`), hostHint, metadata
- `kit_subagent_messages` — sessionId, direction (`outbound`/`inbound`/`system`), body

**Reusable today:** Definition + session + message log as **AgentDefinition/AgentSession bridge** candidates; host-agnostic record path; optional `executionTaskId` link to task store.

**Missing vs foundation:** Profile refs, model tier, capability vocabulary, structured session pointers to assignment/activity, Handoff v2 linkage, validation beyond id/allowedCommands patterns.

### 2.2 Team Execution (`src/modules/team-execution/`)

| Path | Role |
| --- | --- |
| `assignment-store.ts` | Assignment CRUD, Handoff v1 validation, reconcile checkpoint v1, dashboard summarize |
| `index.ts` | Module router — assignment lifecycle commands |
| `config.md` | Module config |
| `instructions/*.md` | 6 commands |

**SQLite requirements:** `user_version >= 7` (`TEAM_EXECUTION_KIT_MIN_USER_VERSION`).

**Table:** `kit_team_assignments`

- Fields: id, executionTaskId, supervisorId, workerId, status (`assigned`/`submitted`/`blocked`/`reconciled`/`cancelled`), handoff JSON, reconcileCheckpoint JSON, blockReason, metadata JSON

**Handoff contract today:** **v1 only** — `{ schemaVersion: 1, summary, evidenceRefs? }` (`validateHandoffContractV1` in `assignment-store.ts`).

**Reusable today:** TeamAssignment-as-AgentAssignment storage bridge; supervisor vs worker id separation; block/reconcile/cancel authority split; metadata JSON column for future structured assignment metadata v1.

**Missing vs foundation:** Handoff v2 fields (status, filesChanged, commandsRun, risks, blockers, nextRecommendedAction); structured metadata validation; worker-only blocker task creation path; orchestrator authority hardening tests (T-AO-340).

### 2.3 Agent activity store (`src/modules/task-engine/`)

| Path | Role |
| --- | --- |
| `agent-activity-store.ts` | Lease CRUD, TTL, kind normalization, dashboard projection |
| `agent-activity-recorder.ts` | Command-boundary recorder used by `set-agent-activity` / `clear-agent-activity` |
| `commands/agent-activity-commands.ts` | CLI handlers |
| `instructions/set-agent-activity.md`, `clear-agent-activity.md` | Agent payloads |
| `dashboard/dashboard-agent-status.ts` | **Derived** status when no live lease |

**Table:** `kit_agent_activity_leases`

**Kinds (enum):** `unavailable`, `planning`, `blocked`, `working_task`, `delegating_task`, `ready_task`, `awaiting_instruction`, `reviewing_item`, `reviewing_pr`, `validating`, `releasing`, `awaiting_policy_approval`, `awaiting_human_gate` (`DASHBOARD_AGENT_STATUS_KINDS` in `agent-activity-store.ts`).

**Reusable today:** TTL heartbeat model; task/phase/command/pr/version/details linkage; dashboard `source: live_activity` vs `derived` split documented in `.ai/AGENT-CLI-MAP.md`.

**Missing vs foundation:** Activity v1 formal lifecycle (fresh/aging/stale/expired tables); assignment/session foreign keys; multi-agent concurrent lease list in dashboard; command-boundary auto-recording hooks.

### 2.4 Task engine (task / blocker / defect paths)

| Path | Role |
| --- | --- |
| `commands/task-row-mutation-commands.ts` | `create-task`, `persist-planning-execution-drafts`, updates |
| `commands/run-transition-on-command.ts` | Lifecycle transitions |
| `instructions/create-task.md` | General task creation |
| `instructions/report-defect.md` | Defect intake → task store |
| `instructions/run-transition.md` | Lifecycle |
| `instructions/completion-preflight.md`, `wait-for-pr-checks.md` | Delivery worker flows |
| `service.ts`, `transitions.ts` | Transition guards |

**Reusable today:** Canonical task lifecycle; `create-task` publishes `task.created` to git-event-log when `tasks.canonicalAuthority` is `git-event-log`; `report-defect` for defect rows; maintainer delivery commands used by phase workers.

**Missing vs foundation:** Worker-scoped **linked** blocker/bug creation tied to assignment (T-AO-330); no command forbids broad task creation from workers today beyond policy discipline.

---

## 3. Commands inventory

### 3.1 Subagent registry (Tier B — `policyOperationId: subagents.persist`)

| Command | Instruction | Mutating |
| --- | --- | --- |
| `list-subagents` | `src/modules/subagents/instructions/list-subagents.md` | No |
| `get-subagent` | `get-subagent.md` | No |
| `list-subagent-sessions` | `list-subagent-sessions.md` | No |
| `get-subagent-session` | `get-subagent-session.md` | No |
| `register-subagent` | `register-subagent.md` | Yes |
| `retire-subagent` | `retire-subagent.md` | Yes |
| `spawn-subagent` | `spawn-subagent.md` | Yes |
| `message-subagent` | `message-subagent.md` | Yes |
| `close-subagent-session` | `close-subagent-session.md` | Yes |

CLI snippets: `.ai/agent-cli-snippets/by-command/{register,spawn,...}-subagent.json`

### 3.2 Team Execution (Tier B — `policyOperationId: team-execution.persist`)

| Command | Instruction | Mutating |
| --- | --- | --- |
| `list-assignments` | `src/modules/team-execution/instructions/list-assignments.md` | No |
| `register-assignment` | `register-assignment.md` | Yes |
| `submit-assignment-handoff` | `submit-assignment-handoff.md` | Yes (worker) |
| `block-assignment` | `block-assignment.md` | Yes (supervisor) |
| `reconcile-assignment` | `reconcile-assignment.md` | Yes (supervisor) |
| `cancel-assignment` | `cancel-assignment.md` | Yes (supervisor) |

### 3.3 Agent activity (task-engine)

| Command | Instruction | Mutating |
| --- | --- | --- |
| `set-agent-activity` | `src/modules/task-engine/instructions/set-agent-activity.md` | Yes |
| `clear-agent-activity` | `clear-agent-activity.md` | Yes |

### 3.4 Task / delivery / orchestration-adjacent (task-engine)

| Command | Instruction | Notes |
| --- | --- | --- |
| `create-task` | `create-task.md` | Tier B; git-canonical publish |
| `report-defect` | `report-defect.md` | Defect → task store |
| `run-transition` | `run-transition.md` | Tier A (`tasks.run-transition`) |
| `get-task`, `list-tasks`, `get-next-actions` | various | Read paths for orchestrators |
| `completion-preflight` | `completion-preflight.md` | Pre-complete gate |
| `wait-for-pr-checks` | `wait-for-pr-checks.md` | CI wait helper |
| `submit-assignment-handoff` | team-execution | Worker handoff (see §3.2) |
| `persist-planning-execution-drafts` | task-engine | Bulk plan task persist — **see §6 risks** |
| `dashboard-summary` | `dashboard-summary.md` | Read-only projection surface |

Manifest source of truth: `src/contracts/builtin-run-command-manifest.json`  
Agent copy-paste index: `.ai/agent-cli-snippets/INDEX.json`

---

## 4. Schemas and contracts

| Artifact | Path | Notes |
| --- | --- | --- |
| Dashboard summary run types | `src/contracts/dashboard-summary-run.ts` | `DashboardAgentStatusSummary`, `DashboardTeamExecutionSummary`, `DashboardSubagentRegistrySummary` |
| Task engine run contracts | `schemas/task-engine-run-contracts.schema.json` | CLI argv/response shapes |
| Agent task read contract | `schemas/agent-task-read-contract.v1.json`, `src/contracts/agent-task-read-contract.ts` | Stable read models for agents |
| Builtin command manifest | `src/contracts/builtin-run-command-manifest.json` | Command registry + policyOperationId |
| Task state events | `src/modules/task-engine/task-state-events/schemas/task-state-event.v1.json` | `task.created`, `task.transitioned`, … |
| Handoff v1 (runtime) | `validateHandoffContractV1` in `assignment-store.ts` | Not yet Handoff v2 |
| Reconcile checkpoint v1 | `validateReconcileCheckpointV1` in `assignment-store.ts` | Supervisor reconcile metadata |

**Not present yet (foundation plan):**

- `src/contracts/agent-orchestration.ts` (T-AO-110)
- `fixtures/agent-orchestration/**` (T-AO-130)
- JSON Schema pack in `AGENT_ORCHESTRATION_CONTRACTS.md` (T-AO-020)

---

## 5. Dashboard and projection touch points

### 5.1 Server-side builders

| File | Output slice |
| --- | --- |
| `src/modules/task-engine/dashboard/build-dashboard-base.ts` | Assembles full `DashboardSummaryData`; calls team/subagent summarizers; merges live activity |
| `src/modules/task-engine/dashboard/dashboard-agent-status.ts` | Derived `agentStatus` from tasks, planning session, team execution, subagent open sessions |
| `src/modules/task-engine/dashboard/dashboard-summary-projection.ts` | Projection slicing (`full`/`overview`/`queue`/`status`) |
| `src/modules/team-execution/assignment-store.ts` | `summarizeTeamAssignmentsForDashboard` |
| `src/modules/subagents/subagent-store.ts` | `summarizeSubagentsForDashboard` |

**Merge rule today:** `agentStatus = liveActivity ?? derivedAgentStatus` (single lease; no multi-agent merge).

### 5.2 Extension / UI

| File | Role |
| --- | --- |
| `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-slice-registry.ts` | Slices: `agentStatus`, `teamExecution`, `subagentRegistry` |
| `extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts` | Renders slices |
| `extensions/cursor-workflow-cannon/src/policy/dashboard-policy-tier.ts` | Routine vs elevated policy UX for gated drawer actions |

**Dashboard mutation rule:** Extension invokes `wk run` with JSON `policyApproval`; dashboard does **not** write orchestration tables directly.

**Gap vs Agent Card plan:** No `build-dashboard-agent-activity-summary.ts`; no merge/confidence/precedence contract (A-PROJECTION / T-AO-610).

---

## 6. Policy surfaces

| Operation ID | Commands | Approval |
| --- | --- | --- |
| `tasks.run-transition` | `run-transition`, intent wrappers | Tier A JSON `policyApproval` |
| `subagents.persist` | register/retire/spawn/message/close subagent | Tier B |
| `team-execution.persist` | register/submit/block/reconcile/cancel assignment | Tier B |
| Task create/update | `create-task`, `update-task`, … | Tier B |
| Planning finalize | `planning.finalize-plan-to-phase` (persist path) | Tier B |

Canon: `.ai/POLICY-APPROVAL.md`, `.ai/AGENT-CLI-MAP.md`, `src/core/policy.ts`

**Elevated dashboard examples:** block/cancel assignment, register subagent (see POLICY-APPROVAL dashboard section).

**Missing vs foundation:** Formal orchestrator vs worker mutation map (A-POLICY); worker blocker permissions; forbidden mutation list for hand-editing orchestration tables.

---

## 7. Agent-facing docs and playbooks

| Doc | Path | Relevance |
| --- | --- | --- |
| Orchestration foundation | `AGENT_ORCHESTRATION_FOUNDATION.md` | Target model (three layers, Handoff v2, profiles) |
| WBS / artifacts | `AGENT_ORCHESTRATION_TASKS.md` | Phase 126–128 work breakdown |
| Agent Card UX plan | `AGENT_CARD_PLAN.md` | Dashboard consumer (separate from foundation) |
| Subagent runbook | `.ai/runbooks/subagent-registry.md` | Operator flow |
| CLI map | `.ai/AGENT-CLI-MAP.md` | Tier table, agent activity workflow |
| Policy approval | `.ai/POLICY-APPROVAL.md` | Approval lanes |
| Task delivery playbook | `.ai/playbooks/task-to-phase-branch.md` | Maintainer / worker delivery loop |
| Task-flow subagent ADR | `.ai/adrs/ADR-cursor3-task-flow-subagent-packaging.md` | Cursor subagent packaging |
| Maintainer delivery loop | `.cursor/rules/maintainer-delivery-loop.mdc` | Branch → PR → `run-transition` |

**Not yet authored (planned A-* artifacts):** `AGENT_ORCHESTRATION_ARCHITECTURE.md`, `_CONTRACTS.md`, `_POLICY.md`, `_PROFILES.md`, orchestration agent prompts under `.ai/prompts/`.

---

## 8. Test coverage

| Test file | Covers |
| --- | --- |
| `test/subagents-store.test.mjs` | SQLite v6+ DDL, definition/session/message round-trip |
| `test/team-execution-store.test.mjs` | SQLite v7+ assignments, handoff v1 submit, reconcile |
| `test/agent-activity-store.test.mjs` | Lease set/heartbeat/clear, dashboard status projection |
| `test/task-phase-canonical-publish.test.mjs` | Git canonical publish for phase mutations |
| `test/module-command-router.test.mjs` | Command routing (includes orchestration modules) |
| `test/task-engine.test.mjs` | Broader task-engine behavior |

**Extension tests:** `extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs`, `command-client.test.mjs`

**Gaps vs foundation test matrix (A-TEST):** No Handoff v2 fixtures; no Activity v1 stale/expired integration tests; no projection merge tests; no blocked-worker E2E; no compatibility suite for additive metadata on legacy rows (T-AO-710).

---

## 9. Reusable vs missing (matrix)

| Foundation concept | Current surface | Status |
| --- | --- | --- |
| AgentDefinition | `kit_subagent_definitions` + `register-subagent` | **Reuse / extend** |
| AgentSession | `kit_subagent_sessions` + spawn/close/message | **Reuse / extend** |
| AgentAssignment | `kit_team_assignments` + metadata JSON | **Reuse / extend** |
| Handoff v2 | Handoff v1 on assignment row | **Missing** — additive schema + validator |
| AgentActivity v1 | `kit_agent_activity_leases` + set/clear | **Partial** — needs lifecycle spec + links |
| Orchestrator/worker authority | Team execution supervisor/worker ids | **Partial** — not enforced on all paths |
| Worker blocker path | `create-task`, `report-defect` (general) | **Missing** — scoped linker |
| Profile catalog | Agent behavior module (advisory only) | **Missing** orchestration profiles |
| Dashboard multi-agent projection | Single `agentStatus` + separate team/subagent slices | **Missing** unified summary |
| Host launch / control | None | **Intentionally out of scope v1** |

---

## 10. Breaking-change risks

| Risk | Detail | Mitigation |
| --- | --- | --- |
| **Git-canonical vs SQLite-only tasks** | `persist-planning-execution-drafts` writes SQLite **without** `task.created` git events; `run-transition` fails with `task-state-canonical-publish-failed` / `task-not-found` when authority is `git-event-log`. `task-sync-hydrate` can **drop** sqlite-only rows. | Prefer `create-task` for git-canonical workspaces; fix persist path to publish events (T-AO-100 compat note); document in A-COMPAT. |
| **Handoff v1 → v2** | Tightening `submit-assignment-handoff` validation could reject legacy handoffs. | Bridge: accept v1, optional v2 fields, explicit fallback (A-COMPAT). |
| **Subagent registry schema** | Renaming columns or retiring `allowedCommands` model breaks existing definitions. | Additive metadata on definitions; bridge AgentDefinition fields. |
| **Team assignment statuses** | New terminal states or stricter worker checks could break supervisor scripts. | Keep status enum backward compatible; gate new rules behind metadata presence. |
| **Activity kind enum** | Adding kinds is safe; **removing/renaming** kinds breaks dashboard + agents. | Treat kinds as versioned contract (A-ACTIVITY). |
| **Dashboard derived status heuristics** | Changes to `buildDashboardAgentStatus` alter operator UX without data migration. | Snapshot tests + projection contract (A-PROJECTION). |
| **Planning generation policy** | `expectedPlanningGeneration: require` rejects stale agents. | Document refresh pattern in worker prompts (already in delivery playbooks). |
| **SQLite user_version gates** | Subagents ≥6, team execution ≥7; older DBs get `invalid-task-schema`. | `wk doctor`, one-time migration on open. |

---

## 11. Recommended reuse strategy

1. **Keep the three-layer separation** from `AGENT_ORCHESTRATION_FOUNDATION.md`: registry (`subagents`), assignment (`team-execution`), activity (`kit_agent_activity_leases`). Do **not** introduce a parallel assignment store in v1.

2. **Bridge, don't fork:** Implement AgentDefinition/AgentSession as **extensions** to subagent definitions/sessions (metadata + optional new columns) per A-ARCH decision — avoid duplicate tables until migration is approved.

3. **TeamAssignment metadata v1:** Use existing `kit_team_assignments.metadata` JSON for profile refs, resource ownership, blockingPolicy, agentDefinitionId, agentSessionId (T-AO-310). Validate only when present.

4. **Handoff v2:** Extend `submit-assignment-handoff` to accept v2 payload; keep v1 validator as fallback parser; store full JSON in `handoff` column.

5. **Activity v1:** Extend `set-agent-activity` args and lease row with assignment/session linkage; implement stale/expired in read paths before write-path enforcement.

6. **Dashboard projection:** Add **read-only** builder (`build-dashboard-agent-activity-summary.ts`) that merges subagent sessions, team assignments, activity leases, and task facts — **no** dashboard writes to orchestration tables.

7. **Task canonical hygiene:** For plan-driven phases, ensure task materialization publishes git `task.created` events (align `persist-planning-execution-drafts` with `finalizeCanonicalCreateTask` path) before worker `run-transition` loops.

8. **Tests first on bridges:** Expand `team-execution-store` and `subagents-store` tests with legacy-row + additive-metadata fixtures before schema tightening.

---

## 12. Inspected files (record)

```
src/modules/subagents/subagent-store.ts
src/modules/subagents/index.ts
src/modules/team-execution/assignment-store.ts
src/modules/team-execution/index.ts
src/modules/task-engine/agent-activity-store.ts
src/modules/task-engine/agent-activity-recorder.ts
src/modules/task-engine/commands/agent-activity-commands.ts
src/modules/task-engine/commands/task-row-mutation-commands.ts
src/modules/task-engine/dashboard/build-dashboard-base.ts
src/modules/task-engine/dashboard/dashboard-agent-status.ts
src/modules/task-engine/dashboard/dashboard-summary-projection.ts
src/contracts/dashboard-summary-run.ts
src/contracts/builtin-run-command-manifest.json
src/core/policy.ts
extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-slice-registry.ts
.ai/runbooks/subagent-registry.md
.ai/AGENT-CLI-MAP.md
.ai/POLICY-APPROVAL.md
test/subagents-store.test.mjs
test/team-execution-store.test.mjs
test/agent-activity-store.test.mjs
test/task-phase-canonical-publish.test.mjs
AGENT_ORCHESTRATION_FOUNDATION.md
AGENT_ORCHESTRATION_TASKS.md
.workspace-kit/config.json (canonicalAuthority)
```

---

## 13. Verification

- [x] Code references included (§2–§8, §12)
- [x] Search terms and inspected files recorded (header, §12)
- [x] Reusable vs missing identified (§9)
- [x] Breaking-change risks identified (§10)
- [x] Recommended reuse strategy included (§11)

**Acceptance mapping (T100623 / A-INV):**

| Criterion | Section |
| --- | --- |
| Lists modules, commands, schemas, docs | §2–§7 |
| Reusable vs missing | §9 |
| Breaking-change risks | §10 |
| Recommended reuse strategy | §11 |
