# AGENT_ORCHESTRATION_TASKS.md

**Artifact:** `AGENT_ORCHESTRATION_TASKS.md` (repo root)

| Document | Role |
| --- | --- |
| [`AGENT_ORCHESTRATION_FOUNDATION.md`](./AGENT_ORCHESTRATION_FOUNDATION.md) | Product / architecture foundation — what the agent orchestration model should become |
| **`AGENT_ORCHESTRATION_TASKS.md`** | Implementation WBS — how to build it, including human-reviewed prerequisite artifacts before dependent code |
| [`AGENT_CARD_PLAN.md`](./AGENT_CARD_PLAN.md) | Separate Agent Activity Dashboard UX/projection plan; consumes this foundation but does not own it |

## Scope

This WBS operationalizes `AGENT_ORCHESTRATION_FOUNDATION.md` into planner-ready work.

It covers:

- host-agnostic `AgentDefinition` v1
- practical `AgentSession` v1
- TeamAssignment-as-AgentAssignment structured metadata
- tiered task/assignment mutation authority
- Activity v1 contract and lifecycle rules
- Handoff v2 contract
- role-based context/access/model profiles
- host compatibility and capability vocabulary
- resource/file ownership metadata
- dashboard projection source contract
- docs/prompts for Orchestration Agent and Task Work Agent

This WBS does **not** implement full host runtime orchestration, automatic Cursor/VS Code agent launching, full model routing, enforceable resource locks, or event-stream runtime services.

Tasks are sized for **one focused frontier-LLM session** each: one primary outcome, bounded file touch set, concrete acceptance criteria, and explicit verification.

**Rule:** Do not start a task until every artifact listed in its **Requires** field exists and has explicit human approval. Chat alone does not unlock downstream implementation work.

---

## 1. Product goal / success standard

Workflow Cannon should support this user-facing loop:

```text
User reviews a phase / goal / backlog
→ Orchestration Agent analyzes work, risks, dependencies, and available agents
→ Orchestration Agent creates bounded assignments with model/context/access/resource scope
→ Task Work Agents execute assigned work only
→ Agents report activity and blockers
→ Workers submit compact structured handoffs
→ Orchestration Agent reconciles, requests rework, or assigns blockers
→ Dashboard displays current agent activity from a stable projection
→ User sees reviewable progress without micromanaging every step
```

Success means Workflow Cannon makes multi-agent software work **observable, bounded, cost-aware, host-agnostic, and trustworthy**.

---

## 2. Source-of-truth hierarchy

```text
AGENT_ORCHESTRATION_FOUNDATION.md = design intent and architecture source
Task Engine / Team Execution       = execution truth and assignment lifecycle
Agent Registry / Session records   = identity/session truth
Agent Activity                     = live visibility truth
Handoff v2                         = worker result/evidence truth
Dashboard projection               = human operating surface, not source of truth
```

---

## 3. Non-goals / constraints

| Constraint | Decision |
| --- | --- |
| Directly launch Cursor subagents | No. Out of scope for v1. |
| Directly launch VS Code agents | No. Out of scope for v1. |
| Cross-host process control | No. Future host adapter work. |
| Full model/provider routing | No. Use model tiers + routing rubric now. |
| Enforced resource locks | No. Use resource ownership metadata now. |
| Hard runtime sandboxing | No. Future capability enforcement work. |
| Token/cost telemetry collection | No. Future model router work. |
| Event-stream runtime service | No. Future projection/runtime work. |
| Dashboard owns orchestration state | No. Dashboard consumes projection only. |
| Replace Team Execution immediately | No. Use TeamAssignment as current storage/command bridge. |

---

## 4. Architecture anchors

### 4.1 Three-layer separation

```text
Agent Registry says who the agent is.
Assignment / Orchestration says what the agent owes.
Activity / Visibility says what the agent is doing right now.
```

### 4.2 Core v1 contracts

```text
AgentDefinition v1
AgentSession v1
Structured TeamAssignment metadata v1
AgentActivity v1
Handoff v2
Context profiles v1
Access profiles v1
Model/cost tiers v1
Host compatibility/capability vocabulary v1
Resource ownership metadata v1
Dashboard orchestration projection source contract
```

### 4.3 First agent definitions

```text
orchestration-agent
  role: orchestrator
  authority: create/manage assignments, monitor/reconcile, choose profiles/model tiers
  restriction: does not implement code unless explicitly assigned as worker

task-worker
  role: task_worker
  authority: implement one bounded assignment, report activity/blockers, submit handoff
  restriction: no broad scope expansion, no self-reconciliation, no self-unblock
```

---

## 5. Recommended delivery phases

Use exactly three planner-facing phases.

| Phase | Theme | Exit criteria |
| --- | --- | --- |
| **Phase 1 — Contracts & Design Gates** | Inventory, architecture, schemas, command contracts, policy, profiles, handoff/activity/projection/test/compatibility artifacts | All A-* artifacts exist and have explicit human approval. No implementation task starts until relevant artifacts are approved. |
| **Phase 2 — Core Orchestration Implementation** | Shared types, validators, fixtures, AgentDefinition/AgentSession bridges, assignment metadata, blocker/bug flow, lifecycle authority, Handoff v2, Activity v1 | Agent definitions/sessions can be represented; assignments carry structured orchestration metadata; workers can report blockers and submit Handoff v2; Activity v1 links agent/session/task/assignment; mutation boundaries are enforced. |
| **Phase 3 — Projection, Docs & Hardening** | Agent docs/prompts, profile catalog docs, dashboard projection bridge, projection tests, compatibility tests, E2E fixtures, release checklist | Agents have usable prompts/docs; dashboard projection can consume orchestration state; existing flows remain compatible; happy-path and blocked-worker E2E fixtures pass; release checklist is complete. |

Phase mapping summary:

```text
Phase 1 = decide exactly what to build
Phase 2 = build the orchestration engine pieces
Phase 3 = make it visible, documented, tested, and safe
```

---

## 6. Required human-reviewed artifacts

These artifacts must be produced and approved before dependent coding starts. They all belong to **Phase 1 — Contracts & Design Gates**.

| ID | Artifact | What it must contain | Produced by | Human approves | Blocks |
| --- | --- | --- | --- | --- | --- |
| **A-INV** | Current orchestration surface inventory | Existing subagent registry, team execution, activity store, task mutation commands, policy surfaces, dashboard summary/projection touch points, gaps vs foundation plan | T-AO-000 | Inventory complete; no surprise persistence or command path | A-ARCH, A-SCHEMA, implementation work |
| **A-ARCH** | Orchestration architecture decision doc | Module boundaries; whether AgentDefinition/AgentSession extend subagent registry or new module; storage choice; compatibility strategy; source-of-truth boundaries; phased migration path | T-AO-010 | Boundaries and storage strategy approved | WP-1, WP-2, WP-3 |
| **A-SCHEMA** | Contract/schema pack | AgentDefinition v1, AgentSession v1, structured assignment metadata v1, AgentActivity v1, Handoff v2, profile refs, JSON examples | T-AO-020 | Schemas match foundation intent and are implementable | Validators, command updates, tests |
| **A-COMMANDS** | Command impact / contract pack | Existing commands to extend; new commands needed; request/response examples; policy approval requirements; idempotency; dry-run behavior | T-AO-030 | CLI/agent contract is stable | WP-3, WP-4 |
| **A-POLICY** | Mutation authority + policy map | Orchestrator vs worker mutation authority; policyApproval surfaces; blocked worker flow; worker-created blocker/bug task permissions; forbidden mutations | T-AO-040 | Permissions safe and aligned with Workflow Cannon policy | WP-3, WP-4 |
| **A-PROFILES** | Profile catalog | orchestrator_access_v1, task_worker_strict_v1, orchestrator_context_v1, task_worker_context_v1, model tiers/rubric, host capabilities, resource metadata rules | T-AO-050 | Profiles are useful and not overbroad | WP-1, WP-3, WP-5 |
| **A-HANDOFF** | Handoff v2 examples/rubric | completed, blocked, partial, failed, needs_review examples; validation rules; compactness expectations; evidence requirements | T-AO-060 | Handoff is compact but sufficient | WP-4 |
| **A-ACTIVITY** | Activity lifecycle spec | Required fields; lifecycle; heartbeat/TTL; stale/expired rules; agent compliance rules; future command-boundary hook notes | T-AO-070 | Visibility behavior is reliable enough for v1 | WP-4, WP-6 |
| **A-PROJECTION** | Dashboard projection source contract | Which orchestration sources feed `DashboardAgentActivitySummary`; merge keys; precedence; source confidence; no-dashboard-mutation rule | T-AO-080 | UX/projection boundary is clear | WP-6 and Agent Card plan work |
| **A-TEST** | Test strategy and fixture matrix | Unit, contract, command, integration, dashboard-projection, E2E scope; fixture locations; malformed/compat cases | T-AO-090 | Coverage is adequate | WP-7 |
| **A-COMPAT** | Compatibility / migration note | Current subagent registry and Team Execution compatibility; no silent breaking of existing commands; bridge/deprecation wording | T-AO-100 | Existing operators not broken | WP-1, WP-2, WP-3 |

### Requires column legend

| Mark | Meaning |
| --- | --- |
| — | No prerequisite beyond normal task dependencies |
| **A-*** | Approved artifact must exist before starting |
| **→ A-*** | Task produces artifact for human review |
| **⛔** | Hard stop until approved |

---

## 7. Work Breakdown Structure

## WP-A — Phase 1: Contracts & Design Gates

### T-AO-000 — Inventory current orchestration surfaces

**Type:** research / inventory  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** —  
**Produces:** A-INV  
**Value:** Prevents building duplicate or incompatible orchestration primitives.

**Scope**

Inventory:

- subagent registry definitions/sessions/messages
- Team Execution assignment store and commands
- agent activity store and commands
- task creation/blocker/bug-report paths
- policy approval requirements
- dashboard summary fields and projection opportunities
- current agent-facing docs/playbooks
- test coverage for these systems

**Acceptance criteria**

- A-INV lists all relevant modules, commands, schemas, and docs.
- A-INV identifies current reusable pieces versus missing pieces.
- A-INV identifies breaking-change risks.
- A-INV includes recommended reuse strategy.

**Testing / verification**

- Code references included.
- Search terms and inspected files recorded.

**Generated task payload hint**

```json
{
  "title": "Inventory current orchestration surfaces",
  "type": "research",
  "planRef": "AGENT_ORCHESTRATION_TASKS.md",
  "wbsId": "T-AO-000",
  "recommendedPhase": "Phase 1 — Contracts & Design Gates",
  "tags": ["agent-orchestration", "inventory", "subagents", "team-execution"]
}
```

---

### T-AO-010 — Draft orchestration architecture decision document

**Type:** architecture  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-INV  
**Produces:** A-ARCH  
**Value:** Locks source-of-truth boundaries before schema or code work.

**Scope**

Create `AGENT_ORCHESTRATION_ARCHITECTURE.md` or equivalent sectioned artifact covering:

- Agent Registry vs Assignment vs Activity ownership
- whether `AgentDefinition` and `AgentSession` extend subagent registry or use new module/tables
- TeamAssignment-as-AgentAssignment bridge strategy
- compatibility with current subagent registry and team execution commands
- persistence and versioning approach
- migration/non-breaking strategy
- dashboard projection boundary
- explicit v1 non-goals

**Acceptance criteria**

- Architecture references `AGENT_ORCHESTRATION_FOUNDATION.md` decisions.
- Storage/module strategy is explicit.
- Existing subagent/team execution compatibility is preserved.
- Human approval recorded before dependent implementation.

---

### T-AO-020 — Draft orchestration schema and contract pack

**Type:** schema / contract  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-ARCH  
**Produces:** A-SCHEMA  
**Value:** Gives agents and implementation code stable payloads.

**Scope**

Create `AGENT_ORCHESTRATION_CONTRACTS.md` or equivalent containing:

- AgentDefinition v1 schema
- AgentSession v1 schema
- structured TeamAssignment metadata v1 schema
- AgentActivity v1 schema
- Handoff v2 schema
- common enums and id fields
- minimal and full JSON examples
- required vs optional fields
- malformed/unknown-field behavior

**Acceptance criteria**

- Schemas match the foundation document.
- Examples exist for Orchestration Agent and Task Work Agent.
- Assignment metadata includes resource ownership and profile references.
- Handoff v2 has examples for completed, blocked, partial, failed, and needs_review.

---

### T-AO-030 — Draft orchestration command contract pack

**Type:** command contract  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-ARCH, A-SCHEMA  
**Produces:** A-COMMANDS  
**Value:** Prevents command/API drift across agents.

**Scope**

Define command changes and any new commands needed for:

- registering/listing agent definitions
- opening/listing/updating agent sessions
- registering assignments with structured metadata
- submitting Handoff v2
- worker-created blocker/bug tasks
- setting/updating/clearing Activity v1
- reading orchestration status for agents

For each command, define request shape, response shape, dry-run behavior if applicable, policyApproval requirement, idempotency key behavior if applicable, error cases, and examples.

**Acceptance criteria**

- Existing commands to reuse/extend are identified.
- New commands are only proposed where current commands are insufficient.
- Orchestrator and worker flows are both represented.
- Policy surfaces are flagged for A-POLICY.

---

### T-AO-040 — Draft mutation authority and policy map

**Type:** policy / safety  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-COMMANDS, A-SCHEMA  
**Produces:** A-POLICY  
**Value:** Protects task DB integrity and prevents worker overreach.

**Scope**

Document Orchestration Agent allowed mutations, Task Work Agent allowed mutations, worker-created blocker/bug rules, who can transition tasks, who can reconcile assignments, who can unblock assignments, required policyApproval surfaces, forbidden DB/manual mutation paths, and alignment with current Workflow Cannon policy docs.

**Acceptance criteria**

- Tiered mutation authority is explicit.
- Worker blocker flow is supported and bounded.
- No path lets worker self-reconcile or self-unblock.
- Policy approval requirements are clear.

---

### T-AO-050 — Draft profile catalog

**Type:** profile design  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-SCHEMA, A-POLICY  
**Produces:** A-PROFILES  
**Value:** Makes agent behavior reusable, cost-aware, and host-agnostic.

**Scope**

Define `orchestrator_access_v1`, `task_worker_strict_v1`, `orchestrator_context_v1`, `task_worker_context_v1`, model/cost tiers and routing rubric, host compatibility labels, required/optional capability vocabulary, and resource ownership metadata rules.

**Acceptance criteria**

- Profiles match selected decisions in foundation doc.
- Profiles are reusable by AgentDefinition records.
- Profiles do not grant workers broad permissions.
- Model tier rubric is usable by an Orchestration Agent.

---

### T-AO-060 — Draft Handoff v2 examples and validation rubric

**Type:** contract / rubric  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-SCHEMA  
**Produces:** A-HANDOFF  
**Value:** Ensures handoffs are compact but sufficient for reconciliation.

**Scope**

Create examples and validation rules for completed, blocked, partial, failed, and needs_review handoffs. Define required fields, evidence requirements, maximum verbosity guidance, acceptance criteria reporting, commands/tests reporting, risk/blocker reporting, and next action requirements.

**Acceptance criteria**

- Orchestrator can reconcile using handoff without reading full transcript.
- Handoff examples are machine-readable JSON.
- Compactness guidance prevents transcript dumps.

---

### T-AO-070 — Draft Activity v1 lifecycle spec

**Type:** contract / lifecycle  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-SCHEMA, A-POLICY  
**Produces:** A-ACTIVITY  
**Value:** Makes live agent visibility reliable.

**Scope**

Document Activity v1 required/optional fields, lifecycle events, heartbeat interval, default TTL, fresh/aging/stale/expired thresholds, block/validation/review activity kinds, clear vs expire behavior, agent compliance expectations, and future command-boundary hook candidates.

**Acceptance criteria**

- Lifecycle supports dashboard visibility goal.
- Activity remains live-state, not assignment/handoff source of truth.
- Stale/expired rules are unambiguous.

---

### T-AO-080 — Draft dashboard projection source contract

**Type:** projection contract  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-SCHEMA, A-ACTIVITY  
**Produces:** A-PROJECTION  
**Value:** Keeps dashboard UX separate from orchestration internals.

**Scope**

Define how the dashboard activity projection consumes AgentDefinition, AgentSession, TeamAssignment / AgentAssignment metadata, AgentActivity, SubagentSession, Handoff summaries, Resource ownership metadata, Model tier metadata, and Host hints/capabilities.

Define merge keys, source precedence, source confidence, stale/blocked/needs-attention derivation, no dashboard mutation rule, and compatibility with `AGENT_CARD_PLAN.md`.

**Acceptance criteria**

- Projection contract can feed `DashboardAgentActivitySummary`.
- Dashboard remains read-only for orchestration state.
- Duplicate source rows can be collapsed.

---

### T-AO-090 — Draft orchestration test strategy

**Type:** test strategy  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-SCHEMA, A-COMMANDS  
**Produces:** A-TEST  
**Value:** Prevents contract and lifecycle regressions.

**Scope**

Define tests for schema validation, command contracts, policy/mutation authority, worker blocker flow, handoff v2 validation, activity lifecycle and stale/expired behavior, assignment metadata validation, dashboard projection source merge, and compatibility with existing subagent/team execution flows.

**Acceptance criteria**

- Fixture matrix covers happy path, blocked path, malformed payloads, and compatibility cases.
- E2E operator checklist exists.
- Required CI/test commands are identified.

---

### T-AO-100 — Draft compatibility and migration note

**Type:** compatibility  
**Priority:** P1  
**Severity:** Medium  
**Recommended phase:** Phase 1 — Contracts & Design Gates  
**Requires:** A-INV, A-ARCH  
**Produces:** A-COMPAT  
**Value:** Avoids breaking current subagent/team execution users.

**Scope**

Document current subagent registry behavior that stays supported, current Team Execution behavior that stays supported, compatibility bridge for structured metadata, whether any commands gain optional new fields, deprecation wording if any, and safe fallback behavior when new metadata is absent.

**Acceptance criteria**

- Existing workflows remain valid.
- New orchestration metadata is additive where possible.
- Fallback behavior is explicit.

---

## WP-1 — Phase 2: Contract validators and shared types

### T-AO-110 — Add shared orchestration contract types

**Type:** implementation / types  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** A-SCHEMA, A-ARCH  
**Value:** Establishes compile-time contract foundation.

**Likely files**

```text
src/contracts/agent-orchestration.ts
src/contracts/agent-session*.ts
src/contracts/agent-activity*.ts
src/contracts/team-execution*.ts
```

**Scope**

Add or extend shared TypeScript types for AgentDefinition v1, AgentSession v1, AgentAssignmentMetadata v1, AgentActivity v1, Handoff v2, context/access/model/resource profile references, and common enums.

**Acceptance criteria**

- Types compile.
- Existing command types remain compatible.
- No runtime behavior changes yet.

**Testing / verification**

- Typecheck.
- Existing tests pass.

---

### T-AO-120 — Add runtime validators for orchestration contracts

**Type:** implementation / validation  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** T-AO-110, A-TEST  
**Value:** Prevents malformed agent payloads from corrupting state.

**Scope**

Add runtime validation for AgentDefinition v1, AgentSession v1, AgentAssignmentMetadata v1, AgentActivity v1, and Handoff v2.

**Acceptance criteria**

- Valid examples pass.
- Missing required fields fail clearly.
- Unknown metadata is handled per A-SCHEMA.
- Error messages are agent-readable.

**Testing / verification**

- Unit tests for each validator.
- Malformed fixture tests.

---

### T-AO-130 — Add canonical example fixtures

**Type:** test fixtures / docs  
**Priority:** P1  
**Severity:** Medium  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** T-AO-120  
**Value:** Gives future agents examples to follow.

**Scope**

Add fixture JSON for Orchestration Agent definition, Task Work Agent definition, AgentSession examples, assignment metadata examples, Activity examples, Handoff v2 examples, and blocked-worker examples.

**Acceptance criteria**

- Fixtures are valid under validators.
- Fixtures are referenced by docs or tests.

---

## WP-2 — Phase 2: Agent registry/session foundations

### T-AO-210 — Implement AgentDefinition v1 storage bridge

**Type:** implementation  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** A-ARCH, A-COMPAT, T-AO-120  
**Value:** Provides host-agnostic agent identity definitions.

**Scope**

Implement the approved A-ARCH approach: extend subagent definitions, add an agent registry module/table, or bridge through metadata if selected.

Support register/update/list/get AgentDefinition, retired flag/version handling, profile references, and host/capability fields.

**Acceptance criteria**

- Orchestration Agent and Task Work Agent definitions can be represented.
- Existing subagent definitions remain compatible.
- Invalid definitions are rejected.

---

### T-AO-220 — Implement AgentSession v1 record path

**Type:** implementation  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** A-ARCH, A-COMPAT, T-AO-120  
**Value:** Links running/participating agents to host/model/current pointers.

**Scope**

Implement the approved session storage/bridge: open/update/list/get/close session path, status enum support, hostHint / hostSessionRef, modelTier / modelHint, currentAssignmentId / currentTaskId / currentActivityId pointers.

**Acceptance criteria**

- Sessions can be recorded for cursor/vscode/cli/manual hosts.
- Existing subagent sessions can be represented or bridged.
- Session does not own assignment or live activity state.

---

### T-AO-230 — Add agent registry/session dashboard/read summaries

**Type:** implementation / read model  
**Priority:** P1  
**Severity:** Medium  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** T-AO-210, T-AO-220  
**Value:** Gives orchestrator and dashboard projection read access.

**Scope**

Add read summaries for registered agent definitions, active/open agent sessions, host/capability availability, and current assignment/activity pointers.

**Acceptance criteria**

- Summary is read-only.
- Missing DB/version support returns safe unavailable summary.
- Projection source contract can consume it.

---

## WP-3 — Phase 2: Assignment orchestration bridge

### T-AO-310 — Add structured assignment metadata validation to Team Execution

**Type:** implementation  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** A-SCHEMA, A-POLICY, T-AO-120  
**Value:** Turns TeamAssignment into the AgentAssignment bridge.

**Scope**

Update assignment registration/update paths to validate optional structured metadata: schemaVersion, agentDefinitionId, agentSessionId, modelTier, contextProfileId, accessProfileId, handoffContractId, resource ownership metadata, assignmentPromptSummary, and blockingPolicy.

**Acceptance criteria**

- Existing assignments without metadata still work.
- Metadata is validated when present.
- Invalid path/resource/profile metadata fails clearly.
- Tests cover old and new assignment rows.

---

### T-AO-320 — Extend register-assignment flow for orchestration metadata

**Type:** implementation / command  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** T-AO-310, A-COMMANDS  
**Value:** Allows Orchestration Agent to create bounded worker assignments.

**Scope**

Extend or wrap `register-assignment` to accept structured metadata and agent/session/profile/resource info.

**Acceptance criteria**

- Orchestrator can register a bounded assignment with metadata.
- Response includes assignment id, task id, worker id, metadata summary.
- Policy approval behavior matches A-POLICY.
- Idempotency behavior is defined if applicable.

---

### T-AO-330 — Add worker blocker/bug creation path

**Type:** implementation / command  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** A-COMMANDS, A-POLICY  
**Value:** Lets bounded workers report blockers without taking over planning.

**Scope**

Implement or adapt a command path that lets a Task Work Agent create a ready blocking task tied to assignment/task or bug report tied to assignment/task. Then require worker to report/block its assignment.

**Acceptance criteria**

- Worker can create only linked blocker/bug tasks.
- Created task has provenance back to assignment and worker.
- Worker cannot create broad unrelated feature tasks through this path.
- Orchestrator remains responsible for unblocking/continuation.

---

### T-AO-340 — Harden assignment lifecycle authority

**Type:** implementation / policy  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** A-POLICY, T-AO-310  
**Value:** Enforces the orchestrator/worker boundary.

**Scope**

Update command validation/policy checks so worker may submit own handoff, worker may mark/report own assignment blocked, worker may not reconcile assignment, worker may not cancel assignment, worker may not unblock itself, and orchestrator may reconcile/block/cancel according to policy.

**Acceptance criteria**

- Unauthorized mutations fail clearly.
- Tests cover worker allowed/forbidden actions.
- Orchestrator actions require expected policy approval where appropriate.

---

## WP-4 — Phase 2: Handoff v2 and activity v1

### T-AO-410 — Implement Handoff v2 submission support

**Type:** implementation / command  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** A-HANDOFF, T-AO-120, T-AO-340  
**Value:** Makes worker output useful for orchestration.

**Scope**

Extend `submit-assignment-handoff` or provide compatible wrapper to accept Handoff v2.

**Acceptance criteria**

- Completed, blocked, partial, failed, and needs_review handoffs validate.
- Handoff v1 compatibility is preserved or explicitly bridged.
- Handoff response is suitable for Orchestrator reconciliation.
- Evidence refs, commandsRun, filesChanged, risks, blockers, and nextRecommendedAction are persisted or safely stored.

---

### T-AO-420 — Update reconcile flow to consume Handoff v2

**Type:** implementation / command  
**Priority:** P1  
**Severity:** High  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** T-AO-410, A-POLICY  
**Value:** Lets the Orchestrator reconcile without rereading chat.

**Scope**

Update reconcile/summary paths to surface Handoff v2 fields and support decisions: reconcile, request rework, assign blocker, assign review, cancel/supersede.

**Acceptance criteria**

- Orchestrator can inspect structured handoff data.
- Reconcile checkpoint can summarize Handoff v2.
- Tests cover blocked/partial/needs_review handling.

---

### T-AO-430 — Implement Activity v1 command compatibility

**Type:** implementation / command  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 2 — Core Orchestration Implementation  
**Requires:** A-ACTIVITY, T-AO-120  
**Value:** Provides live visibility into active agents.

**Scope**

Extend `set-agent-activity`/activity store or bridge fields for Activity v1: agentDefinitionId, assignmentId, taskId, phaseKey, hostHint, modelTier, modelHint, currentStep, command, and TTL.

**Acceptance criteria**

- Existing activity calls still work.
- Activity v1 examples validate.
- Stale/expired behavior matches A-ACTIVITY.
- Activity can be linked to assignment/session/task.

---

## WP-5 — Phase 3: Profiles, prompts, and agent-facing docs

### T-AO-440 — Add activity lifecycle docs/snippets for agents

**Type:** docs / agent guidance  
**Priority:** P1  
**Severity:** Medium  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** A-ACTIVITY, T-AO-430  
**Value:** Improves compliance before command-boundary automation exists.

**Scope**

Document agent lifecycle requirements: assignment accepted, step changes, long-work heartbeat, blocked, handoff submitted, reconciled/cancelled/closed.

**Acceptance criteria**

- Agent-facing docs include copyable command examples.
- Orchestrator and Task Work Agent prompts reference lifecycle.

---

### T-AO-510 — Add Orchestration Agent prompt/contract

**Type:** docs / prompt contract  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** A-PROFILES, A-COMMANDS, A-POLICY  
**Value:** Makes orchestrator behavior repeatable.

**Scope**

Create an agent-facing prompt/contract describing role and authority, context profile, access profile, model tier rubric, assignment creation rules, blocker handling, reconciliation behavior, forbidden implementation behavior, and output format for orchestration plans/assignments.

**Acceptance criteria**

- Prompt reflects foundation decisions.
- Prompt tells orchestrator not to code unless assigned as worker.
- Prompt includes model/cost selection expectations.
- Prompt includes structured assignment output guidance.

---

### T-AO-520 — Add Task Work Agent prompt/contract

**Type:** docs / prompt contract  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** A-PROFILES, A-HANDOFF, A-ACTIVITY, A-POLICY  
**Value:** Makes bounded worker behavior repeatable.

**Scope**

Create an agent-facing prompt/contract describing strict bounded worker role, assignment scope rules, owned/shared/forbidden path rules, activity lifecycle, allowed blocker/bug creation, handoff v2 requirements, escalation rules, and forbidden self-reconcile/self-unblock behavior.

**Acceptance criteria**

- Prompt reflects foundation decisions.
- Prompt emphasizes scope discipline.
- Prompt includes blocked/partial/completed handoff examples.
- Prompt gives clear stop/escalate conditions.

---

### T-AO-530 — Add profile catalog docs

**Type:** docs  
**Priority:** P1  
**Severity:** Medium  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** A-PROFILES  
**Value:** Makes profiles inspectable and reusable.

**Scope**

Document access profiles, context profiles, model/cost tiers, host capability vocabulary, resource ownership metadata, and examples of assigning profiles to AgentDefinitions.

**Acceptance criteria**

- Agents can understand which profile applies.
- Examples match schemas and validators.

---

## WP-6 — Phase 3: Dashboard projection bridge

### T-AO-610 — Add orchestration projection source builder

**Type:** implementation / projection  
**Priority:** P1  
**Severity:** High  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** A-PROJECTION, T-AO-210, T-AO-220, T-AO-310, T-AO-430  
**Value:** Provides normalized orchestration state to the dashboard UX plan.

**Scope**

Build or extend a projection builder that consumes agent definitions, agent sessions, team assignments / assignment metadata, activities, subagent sessions, handoff summaries, and resource/model/host metadata; then produces a normalized source package for `DashboardAgentActivitySummary`.

**Acceptance criteria**

- Projection builder does not mutate orchestration state.
- Missing metadata falls back safely.
- Duplicate sources can be merged/collapsed.
- Projection includes enough data for the Agent Activity Dashboard UX plan.

---

### T-AO-620 — Add projection tests for orchestration sources

**Type:** testing  
**Priority:** P1  
**Severity:** High  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** T-AO-610, A-TEST  
**Value:** Prevents dashboard/source drift.

**Scope**

Test projection cases: live activity + assignment + session merge, subagent session fallback, missing activity but active assignment, stale activity, blocked assignment, completed handoff, malformed metadata, old assignments without new metadata.

**Acceptance criteria**

- Tests prove dashboard can consume stable projection data.
- Existing dashboard summary behavior is not broken.

---

## WP-7 — Phase 3: Hardening, compatibility, and E2E

### T-AO-710 — Add compatibility tests for existing subagent and team execution flows

**Type:** testing  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** A-COMPAT, A-TEST, WP-2, WP-3  
**Value:** Prevents new orchestration layer from breaking existing users.

**Scope**

Test that existing flows still work: register/list/get subagent definitions, spawn/list/close subagent sessions, message subagent sessions, register assignment without new metadata, submit old handoff shape or compatibility path, reconcile/cancel/block existing assignments.

**Acceptance criteria**

- Existing behavior remains compatible.
- Additive fields do not force migration unless approved.

---

### T-AO-720 — Add orchestration happy-path E2E fixture

**Type:** e2e / fixture  
**Priority:** P1  
**Severity:** High  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** A-TEST, WP-2, WP-3, WP-4  
**Value:** Demonstrates the foundation works as a system.

**Scope**

Create an E2E scenario:

```text
register Orchestration Agent + Task Work Agent
open agent session
register assignment with metadata
set activity
submit Handoff v2
reconcile assignment
project dashboard source
```

**Acceptance criteria**

- E2E fixture passes through CLI/test runner.
- Evidence shows assignment and activity are linked.
- Handoff v2 is usable for reconciliation.

---

### T-AO-730 — Add blocked-worker E2E fixture

**Type:** e2e / fixture  
**Priority:** P1  
**Severity:** High  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** A-TEST, T-AO-330, T-AO-430  
**Value:** Proves the blocker flow is safe and visible.

**Scope**

Create E2E scenario:

```text
worker assignment starts
worker discovers blocker
worker creates linked blocker/bug task
worker blocks/reports assignment
activity shows blocked
orchestrator resolves/assigns blocker
original assignment remains blocked until orchestrator resumes/reassigns
```

**Acceptance criteria**

- Worker cannot self-unblock.
- Blocker task is linked to original assignment/task.
- Dashboard projection can show blocked state.

---

### T-AO-740 — Add release readiness checklist

**Type:** docs / release  
**Priority:** P2  
**Severity:** Medium  
**Recommended phase:** Phase 3 — Projection, Docs & Hardening  
**Requires:** A-TEST, A-COMPAT  
**Value:** Gives maintainers a final gate before relying on orchestration.

**Scope**

Create checklist covering schemas and validators, commands and policy, docs and prompts, compatibility tests, E2E happy path, blocked-worker path, dashboard projection bridge, and known limitations/future-work buckets.

**Acceptance criteria**

- Checklist can be used by a maintainer before enabling plan-driven orchestration work.

---

## 8. Dependency summary

```text
T-AO-000 → T-AO-010
T-AO-010 → T-AO-020, T-AO-030, T-AO-100
T-AO-020 → T-AO-040, T-AO-050, T-AO-060, T-AO-070, T-AO-090
T-AO-030 → T-AO-040, T-AO-090
T-AO-040 → T-AO-050, WP-3, WP-4
T-AO-070 → T-AO-080
T-AO-080 → WP-6
T-AO-090 → WP-7

A-SCHEMA + A-ARCH → T-AO-110
T-AO-110 → T-AO-120
T-AO-120 → T-AO-130, T-AO-210, T-AO-220, T-AO-310, T-AO-410, T-AO-430
T-AO-210 + T-AO-220 + T-AO-310 + T-AO-430 → T-AO-610
T-AO-610 → T-AO-620
WP-2 + WP-3 + WP-4 → T-AO-720, T-AO-730
```

---

## 9. Recommended work order

### Phase 1 — Contracts & Design Gates

1. T-AO-000 — Inventory current orchestration surfaces.
2. T-AO-010 — Draft architecture decision document.
3. T-AO-020 — Draft schema and contract pack.
4. T-AO-030 — Draft command contract pack.
5. T-AO-040 — Draft mutation authority and policy map.
6. T-AO-050 — Draft profile catalog.
7. T-AO-060 — Draft Handoff v2 examples/rubric.
8. T-AO-070 — Draft Activity v1 lifecycle spec.
9. T-AO-080 — Draft dashboard projection source contract.
10. T-AO-090 — Draft test strategy.
11. T-AO-100 — Draft compatibility/migration note.

### Phase 2 — Core Orchestration Implementation

12. T-AO-110 — Add shared orchestration contract types.
13. T-AO-120 — Add runtime validators.
14. T-AO-130 — Add canonical fixtures.
15. T-AO-210 — Implement AgentDefinition storage bridge.
16. T-AO-220 — Implement AgentSession record path.
17. T-AO-230 — Add agent registry/session read summaries.
18. T-AO-310 — Add structured assignment metadata validation.
19. T-AO-320 — Extend assignment registration flow.
20. T-AO-330 — Add worker blocker/bug creation path.
21. T-AO-340 — Harden assignment lifecycle authority.
22. T-AO-410 — Implement Handoff v2 submission support.
23. T-AO-420 — Update reconcile flow for Handoff v2.
24. T-AO-430 — Implement Activity v1 command compatibility.

### Phase 3 — Projection, Docs & Hardening

25. T-AO-440 — Add activity lifecycle docs/snippets.
26. T-AO-510 — Add Orchestration Agent prompt/contract.
27. T-AO-520 — Add Task Work Agent prompt/contract.
28. T-AO-530 — Add profile catalog docs.
29. T-AO-610 — Add orchestration projection source builder.
30. T-AO-620 — Add projection tests.
31. T-AO-710 — Add compatibility tests.
32. T-AO-720 — Add happy-path E2E fixture.
33. T-AO-730 — Add blocked-worker E2E fixture.
34. T-AO-740 — Add release readiness checklist.

Note: the WBS now contains **34 task entries** because `T-AO-230` is retained as its own read-summary task. If a tighter 33-task plan is required, merge `T-AO-230` into `T-AO-220`.

---

## 10. Final acceptance criteria

This orchestration foundation is implementation-ready when:

1. Required A-* artifacts exist and have explicit human approval.
2. AgentDefinition v1 and AgentSession v1 can be represented without breaking current subagent registry behavior.
3. TeamAssignment can carry validated AgentAssignment metadata.
4. Orchestrator and Task Work Agent definitions exist and reference approved profiles/contracts.
5. Task Work Agent can submit Handoff v2.
6. Task Work Agent can create linked blocker/bug tasks without taking over planning.
7. Orchestrator remains responsible for reconciliation, cancellation, and unblocking.
8. Activity v1 links agent/session/assignment/task and supports stale/expired behavior.
9. Context/access/model/resource profiles are documented and referenced by AgentDefinitions/Assignments.
10. Dashboard projection source can consume orchestration state without owning or mutating it.
11. Existing subagent and Team Execution flows remain compatible.
12. Happy-path and blocked-worker E2E fixtures pass.

---

## 11. Planner registration guidance

When an agent enters this WBS into the planner, use the foundation document as the design source:

```json
{
  "planRef": "AGENT_ORCHESTRATION_FOUNDATION.md",
  "wbsRef": "AGENT_ORCHESTRATION_TASKS.md",
  "planArea": "agent-orchestration-foundation",
  "requiresPhaseBranch": true,
  "maintainerDeliveryProfile": "github-pr"
}
```

Recommended tags:

```text
agent-orchestration
subagents
team-execution
agent-activity
handoff-v2
activity-v1
host-agnostic
model-cost
resource-ownership
dashboard-projection
```

Recommended task type:

```text
improvement
```

Recommended task sizing rule:

```text
One WBS item should fit in one focused agent session.
If a WBS item touches more than one module boundary or needs more than one primary outcome, split it before registering execution tasks.
```
