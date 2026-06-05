# TOKEN_USAGE_2.md — Planner-Ready Token Usage Reduction WBS

**Status:** Proposed planner import plan  
**Scope:** Workflow Cannon AI token/credit reduction without sacrificing delivery quality  
**Primary objective:** Reduce orchestration, worker, reconciliation, refresh, and release-closeout token usage by replacing broad agent rediscovery with compact packets, deterministic verdicts, delta refresh, and model-tier routing.  
**Planner intent:** This document is structured so an agent can import it into the task planner as manageable, dependency-aware implementation tasks.

---

## 0. Operating Principles

1. **Packet first, expansion second.** Agents should start from bounded, purpose-built context packets and expand raw evidence only when packets indicate uncertainty, risk, or failure.
2. **References over embedded content.** Packets should include file, command, schema, runbook, PR, and evidence references instead of embedding full documents or logs by default.
3. **Deterministic checks before reasoning.** Use preflight/verdict commands to classify safe, unsafe, incomplete, or ambiguous states before asking a model to inspect raw diffs or prose handoffs.
4. **Cheap workers, smart escalation.** Default implementation workers to the cheapest capable model tier. Reserve higher-cost thinking models for planning, risk adjudication, release decisions, and unresolved ambiguity.
5. **Quality remains non-negotiable.** Token reduction must not remove validation, evidence, policy approvals, stale-context detection, or release safety gates.
6. **Small reversible tasks.** Each task below should fit inside a single focused agent session and should have clear acceptance criteria.

---

## 1. WBS Overview

| WBS | Workstream | Goal | Depends On |
| --- | --- | --- | --- |
| WBS-TU-000 | Baseline and Contracts | Establish metrics, schemas, and shared vocabulary before implementation | None |
| WBS-TU-100 | Packet-First Orchestration | Replace broad orchestrator discovery with compact phase classification packets | WBS-TU-000 |
| WBS-TU-200 | Worker Execution Packets | Give subagents bounded task context and prevent context multiplication | WBS-TU-000, WBS-TU-100 |
| WBS-TU-300 | Assignment Metadata and Model Tiers | Persist packet/model context with TeamAssignment records | WBS-TU-200 |
| WBS-TU-400 | Compact Dashboard Prompt | Make Complete & Release prompt start from packets instead of runbook restatement | WBS-TU-100, WBS-TU-200, WBS-TU-300 |
| WBS-TU-500 | Structured Handoff v2 | Make worker output machine-checkable | WBS-TU-300 |
| WBS-TU-600 | Reconciliation Preflight | Avoid raw diff/log/handoff expansion when worker handoff is clean | WBS-TU-500 |
| WBS-TU-700 | Delta Refresh | Avoid repeated broad task/dashboard refresh during active phase drain | WBS-TU-100, WBS-TU-600 |
| WBS-TU-800 | Release Closeout Packets | Avoid broad release artifact discovery during closeout | WBS-TU-700 |
| WBS-TU-900 | Metrics and Regression Harness | Prove savings and prevent quality regression | WBS-TU-100 through WBS-TU-800 as applicable |

---

## 2. Planner Import Task List

### WBS-TU-000 — Baseline and Contracts

#### T-TU-001 — Capture current token-cost baseline

**Type:** research / measurement  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-010, T-TU-901  
**Blocked by:** none

**Goal:** Establish a before-state so token reduction can be measured instead of guessed.

**Implementation notes:**

- Identify representative flows:
  - dashboard Complete & Release startup;
  - active phase with at least three ready tasks;
  - worker execution handoff;
  - assignment reconciliation;
  - release closeout.
- Capture current prompt sizes, broad command reads, runbook reads, and raw evidence expansions where practical.
- If exact token counts are not available, create a deterministic proxy metric based on prompt character count, attached file count, command count, and expanded evidence count.

**Acceptance criteria:**

- Baseline file or report exists with at least five representative flows.
- Each flow includes current context sources and approximate size/cost proxy.
- Report names the largest observed token sinks.
- Follow-up metric hooks are identified for T-TU-901.

---

#### T-TU-010 — Define token reduction contract types

**Type:** contracts / design  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-101, T-TU-201, T-TU-501, T-TU-701, T-TU-801  
**Blocked by:** T-TU-001

**Goal:** Create shared TypeScript and/or JSON schema contracts for packet, verdict, delta, and metric objects.

**Implementation notes:**

Define initial contracts for:

- `PhaseReleaseOrchestrationStatePacket`;
- `AgentExecutionPacket`;
- `AssignmentReconciliationPreflightResult`;
- `PhaseDrainDeltaPacket`;
- `PhaseReleaseStatePacket`;
- `ReleaseCloseoutResultPacket`;
- `TokenUsageMetricSnapshot`.

Contracts should include:

- `schemaVersion`;
- `generatedAt`;
- `workspaceGeneration` or equivalent cursor/generation marker where available;
- `packetDigest` for packets;
- `refs` for expandable raw evidence;
- `recommendedNextAction`;
- safe fallback states such as `needs_full_refresh`, `needs_user_decision`, or `unsafe`.

**Acceptance criteria:**

- Contract definitions are added in the appropriate `src/contracts` location or an existing contract module.
- JSON schema or runtime validation exists where the project convention requires it.
- Contracts are additive and do not break legacy task, team-execution, or subagent flows.
- At least one fixture/example exists for each contract.

---

#### T-TU-020 — Add token-reduction terminology to docs index

**Type:** docs / taxonomy  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-402, T-TU-902  
**Blocked by:** T-TU-010

**Goal:** Make the new packet/verdict/model-tier terms discoverable to future agents without requiring long explanatory prompts.

**Implementation notes:**

- Add concise definitions for:
  - context packet;
  - packet digest;
  - progressive disclosure;
  - references-over-content;
  - deterministic verdict;
  - delta refresh;
  - model tier;
  - evidence expansion.
- Prefer canonical `.ai` terminology surfaces if this repo uses generated docs for human-facing copies.

**Acceptance criteria:**

- New terms are added to the canonical terms/index location.
- Human-facing generated docs are refreshed if required by documentation rules.
- Definitions are short enough to be reused in prompts without bloating them.

---

### WBS-TU-100 — Packet-First Orchestration

#### T-TU-101 — Implement read model for phase release orchestration state

**Type:** backend / read model  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-102, T-TU-401  
**Blocked by:** T-TU-010

**Goal:** Build the internal read model that classifies a phase without requiring the agent to manually inspect broad task and release state.

**Implementation notes:**

The read model should compute:

- phase key;
- current phase and next phase if known;
- integration branch;
- task counts by lifecycle status;
- completed task count;
- non-terminal task count;
- ready unblocked task summaries;
- blocked task summaries;
- proposed/wishlist/research counts;
- release readiness hints;
- path classification.

Supported path classifications:

- `empty`;
- `completed_only`;
- `active_work`;
- `blocked_needs_decision`;
- `release_ready`;
- `release_blocked`;
- `needs_full_refresh`.

**Acceptance criteria:**

- Read model returns bounded data and does not include full task histories.
- Read model includes enough information for an orchestrator to choose the next action.
- Unit tests cover at least empty, completed-only, active-work, blocked, and release-ready scenarios.

---

#### T-TU-102 — Add `phase-release-orchestration-state` command

**Type:** command / CLI  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-103, T-TU-401, T-TU-701  
**Blocked by:** T-TU-101

**Goal:** Expose the phase orchestration packet as a read-only command agents can run first.

**Command:**

```text
wk run phase-release-orchestration-state '{...}'
```

**Implementation notes:**

- Command should be read-only.
- Output should match `PhaseReleaseOrchestrationStatePacket`.
- Include packet refs for likely next commands:
  - `agent-execution-packet` when active work exists;
  - `phase-release-state` when closeout is likely;
  - stop/report recommendation when phase is empty;
  - user-decision recommendation when blocked.
- Include a `packetDigest`.

**Acceptance criteria:**

- Command is registered in the command manifest.
- Command instruction file exists for agents.
- Output is bounded and schema-validated.
- Snapshot tests cover all supported path classifications.

---

#### T-TU-103 — Add phase orchestration packet fixtures and simulations

**Type:** tests / fixtures  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-901  
**Blocked by:** T-TU-102

**Goal:** Ensure packet behavior stays stable as task/release internals evolve.

**Implementation notes:**

- Add fixtures for each supported path classification.
- Simulate dashboard Complete & Release startup using only the packet.
- Assert no full runbook content or full task histories leak into the packet.

**Acceptance criteria:**

- Fixture set exists and is documented.
- Tests fail if packet output becomes unbounded.
- Tests prove an orchestrator can determine next action from the packet alone.

---

### WBS-TU-200 — Worker Execution Packets

#### T-TU-201 — Implement agent execution packet builder

**Type:** backend / read model  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-202, T-TU-301  
**Blocked by:** T-TU-010, T-TU-102

**Goal:** Build bounded worker packets so subagents do not read the full queue, broad runbooks, or unrelated repo context.

**Packet fields:**

- task id;
- phase key;
- assignment intent;
- title and summary;
- acceptance criteria;
- owned paths;
- read-only paths;
- forbidden paths;
- shared paths if needed;
- requires-approval paths if needed;
- base branch;
- suggested worker branch;
- validation commands;
- model tier recommendation;
- runbook references;
- handoff contract reference;
- stop conditions;
- packet digest;
- stale-context generation marker.

**Acceptance criteria:**

- Builder can create a packet for a ready task.
- Packet does not include the full task queue.
- Packet does not embed full runbooks by default.
- Packet explicitly identifies owned, read-only, forbidden, and approval-sensitive paths.
- Unit tests cover normal task, missing scope metadata, blocked task, and stale task scenarios.

---

#### T-TU-202 — Add `agent-execution-packet` command

**Type:** command / CLI  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-203, T-TU-302, T-TU-401  
**Blocked by:** T-TU-201

**Goal:** Expose worker execution packets through a read-only command.

**Command:**

```text
wk run agent-execution-packet '{ "taskId": "T..." }'
```

**Implementation notes:**

- Command should be read-only.
- Allow lookup by `taskId` and optionally by ready-task selector from the orchestration packet.
- Include warnings when scope metadata is incomplete.
- Return `needs_user_decision` or `needs_full_refresh` instead of guessing on unsafe ambiguity.

**Acceptance criteria:**

- Command is registered in the command manifest.
- Agent instruction file exists.
- Command output validates against the packet contract.
- A worker can start implementation from this packet without reading the broad task list.

---

#### T-TU-203 — Add worker packet prompt examples

**Type:** docs / prompt guidance  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-402  
**Blocked by:** T-TU-202

**Goal:** Teach agents to use worker packets without reintroducing long prompts.

**Implementation notes:**

- Add one compact example for a worker launched from `agent-execution-packet`.
- Include escalation examples:
  - incomplete owned paths;
  - forbidden path conflict;
  - validation command unavailable;
  - ambiguous acceptance criteria.
- Keep examples short and reference-based.

**Acceptance criteria:**

- Documentation exists in the appropriate agent instruction/playbook location.
- Examples do not embed large runbook content.
- Examples instruct the worker to expand refs only when needed.

---

### WBS-TU-300 — Assignment Metadata and Model Tiers

#### T-TU-301 — Define model-tier policy catalog

**Type:** policy / config  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-302, T-TU-303, T-TU-904  
**Blocked by:** T-TU-201

**Goal:** Create a small model-tier routing policy that chooses cheap capable models by default and escalates only for clear reasons.

**Suggested tiers:**

| Tier | Intended use |
| --- | --- |
| `cheap_worker` | Clear implementation, contained edits, docs generation, simple tests |
| `balanced_worker` | Cross-file implementation, moderate refactor, ambiguous tests |
| `planner_thinking` | orchestration planning, task splitting, risk analysis |
| `release_thinking` | release/publish decisions, policy-sensitive operations |
| `review_escalation` | failed preflight, unclear handoff, safety/risk review |

**Escalation reasons:**

- acceptance criteria conflict;
- forbidden or approval-sensitive path touched;
- validation failure after bounded retry;
- public contract/schema impact;
- release or migration risk;
- stale packet digest;
- user decision required.

**Acceptance criteria:**

- Model-tier catalog exists in config, docs, or contract location consistent with project conventions.
- Catalog is intentionally small.
- Each tier has clear allowed use and escalation rules.
- No provider-specific model names are required by the core contract.

---

#### T-TU-302 — Persist packet metadata on TeamAssignment records

**Type:** backend / persistence  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-303, T-TU-501, T-TU-602  
**Blocked by:** T-TU-202, T-TU-301

**Goal:** Store the packet and model routing context used to launch a worker so the orchestrator can audit and detect stale context.

**Metadata fields:**

- `schemaVersion`;
- `packetId` or `packetDigest`;
- `packetGeneratedAt`;
- `modelTier`;
- `modelEscalationPolicyId`;
- `ownedPaths`;
- `readOnlyPaths`;
- `forbiddenPaths`;
- `requiresApprovalPaths`;
- `handoffContractId`;
- `validationCommands`;
- `assignmentPromptSummary`;
- `contextProfileId`;
- `accessProfileId`.

**Acceptance criteria:**

- `register-assignment` accepts structured metadata without breaking legacy assignments.
- Metadata validation is strict only when `schemaVersion` is present.
- Existing assignments without metadata still work.
- Tests cover valid metadata, missing optional metadata, invalid forbidden/owned path conflicts, and legacy assignment compatibility.

---

#### T-TU-303 — Add model-tier visibility to assignment reads and dashboard summaries

**Type:** dashboard / read model  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-904  
**Blocked by:** T-TU-302

**Goal:** Make model-tier choices visible enough to manage cost without requiring raw metadata inspection.

**Implementation notes:**

- Add model tier, packet digest, and stale-context warning to relevant assignment read paths.
- Dashboard projection should show compact model-tier info where useful.
- Avoid adding noisy UI detail; this is primarily for audit and cost review.

**Acceptance criteria:**

- Assignment read command includes model tier and packet digest when present.
- Dashboard or summary read path exposes compact model-tier information.
- Missing legacy metadata does not produce scary false warnings.

---

### WBS-TU-400 — Compact Dashboard Prompt

#### T-TU-401 — Rewrite Complete & Release launch prompt to be packet-first

**Type:** prompt / dashboard integration  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-402, T-TU-903  
**Blocked by:** T-TU-102, T-TU-202, T-TU-302

**Goal:** Replace broad runbook-style dashboard launch prompts with a compact prompt that starts from `phase-release-orchestration-state`.

**Prompt should keep only:**

- role;
- intent;
- dashboard authorization semantics;
- policy reminder;
- first command;
- stop/ask conditions;
- final report shape.

**Prompt should remove:**

- command-by-command release instructions;
- task delivery procedure;
- branch mechanics;
- validation details;
- handoff schema details;
- full runbook restatement.

**Acceptance criteria:**

- Prompt instructs the agent to run `phase-release-orchestration-state` first.
- Prompt instructs worker assignment through `agent-execution-packet`.
- Prompt is materially shorter than the current version.
- Prompt points to refs instead of embedding long procedural content.

---

#### T-TU-402 — Add long-session recovery instructions for packet flow

**Type:** prompt hygiene / docs  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-903  
**Blocked by:** T-TU-020, T-TU-203, T-TU-401

**Goal:** Ensure compacted or long-running chats recover from packet truth instead of thread momentum.

**Implementation notes:**

- Add guidance that recovery should re-run `phase-release-orchestration-state` or `phase-drain-delta` depending on stage.
- Agents should not rely on stale packet digests.
- Agents should expand raw references only when packet state is ambiguous or stale.

**Acceptance criteria:**

- Long-session recovery instructions exist.
- Instructions explicitly reject broad rediscovery unless packet/delta refresh says it is required.
- Instructions include stale digest handling.

---

### WBS-TU-500 — Structured Handoff v2

#### T-TU-501 — Define Handoff v2 contract

**Type:** contracts / schema  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-502, T-TU-601  
**Blocked by:** T-TU-010, T-TU-302

**Goal:** Make worker handoffs machine-checkable while preserving compatibility with Handoff v1.

**Required fields:**

- `schemaVersion`;
- `taskId`;
- `assignmentId`;
- `summary`;
- `filesChanged`;
- `commandsRun`;
- `acceptanceCriteriaStatus`;
- `prRef` or branch/ref evidence;
- `risks`;
- `blockers`;
- `followUps`;
- `nextRecommendedAction`.

**Acceptance criteria:**

- Handoff v2 contract is defined and validated.
- Handoff v1 remains accepted.
- Handoff v2 supports clean machine parsing without prose interpretation.
- Fixtures cover clean, incomplete, risky, blocked, and legacy handoffs.

---

#### T-TU-502 — Update `submit-assignment-handoff` for Handoff v2

**Type:** command / persistence  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-503, T-TU-601  
**Blocked by:** T-TU-501

**Goal:** Let workers submit structured Handoff v2 without breaking existing workflows.

**Implementation notes:**

- Accept Handoff v2 when `schemaVersion` indicates v2.
- Continue parsing Handoff v1.
- Validate assignment/task id consistency where available.
- Validate required fields and return focused follow-up errors.

**Acceptance criteria:**

- Existing v1 handoff tests still pass.
- New v2 handoff tests pass.
- Invalid v2 handoffs fail with actionable validation errors.
- Command docs include a compact v2 example.

---

#### T-TU-503 — Add worker handoff generation instructions

**Type:** docs / agent instructions  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-602  
**Blocked by:** T-TU-502

**Goal:** Ensure workers produce structured handoffs without verbose narrative bloat.

**Implementation notes:**

- Add a concise Handoff v2 template.
- Instruct workers that JSON is source of truth and prose is optional.
- Include examples for partial completion and blocked work.

**Acceptance criteria:**

- Worker instructions clearly prefer JSON-first handoff.
- Template is short enough to avoid replacing one token sink with another.
- Instructions name when to declare blockers instead of guessing.

---

### WBS-TU-600 — Reconciliation Preflight

#### T-TU-601 — Implement assignment reconciliation preflight read model

**Type:** backend / read model  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-602, T-TU-701  
**Blocked by:** T-TU-501, T-TU-502

**Goal:** Determine whether an assignment can be reconciled without model-driven inspection of raw diffs, logs, or prose handoffs.

**Checks:**

- handoff exists;
- required Handoff v2 fields present;
- acceptance criteria addressed;
- changed files are within owned/shared paths;
- forbidden paths untouched;
- approval-sensitive paths flagged;
- required validation commands present;
- PR exists and targets expected branch when applicable;
- policy approval requirements satisfied or listed;
- risks/blockers declared;
- packet digest is not stale when available.

**Verdicts:**

- `ready_to_reconcile`;
- `needs_worker_followup`;
- `needs_orchestrator_review`;
- `needs_user_decision`;
- `unsafe`.

**Acceptance criteria:**

- Clean handoff returns `ready_to_reconcile` with compact evidence refs.
- Missing evidence returns a specific follow-up recommendation.
- Forbidden path changes return `unsafe` or `needs_orchestrator_review`.
- Stale packet digest returns a refresh recommendation.
- Tests cover each verdict.

---

#### T-TU-602 — Add `assignment-reconciliation-preflight` command

**Type:** command / CLI  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-603, T-TU-701, T-TU-903  
**Blocked by:** T-TU-503, T-TU-601

**Goal:** Expose deterministic reconciliation as a command used before any expensive review.

**Command:**

```text
wk run assignment-reconciliation-preflight '{ "assignmentId": "A..." }'
```

**Acceptance criteria:**

- Command is registered in the command manifest.
- Command output validates against `AssignmentReconciliationPreflightResult`.
- Agent instruction file exists.
- Command documentation says raw evidence expansion should happen only when verdict requires it.

---

#### T-TU-603 — Integrate preflight into orchestrator reconciliation guidance

**Type:** prompt / playbook  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-903  
**Blocked by:** T-TU-602

**Goal:** Make the orchestrator run preflight before reading handoff prose, raw diffs, logs, or broad task history.

**Acceptance criteria:**

- Reconciliation guidance starts with `assignment-reconciliation-preflight`.
- `ready_to_reconcile` path avoids raw expansion by default.
- Failed/risky verdicts specify focused expansion by referenced evidence only.

---

### WBS-TU-700 — Delta Refresh

#### T-TU-701 — Implement phase drain delta read model

**Type:** backend / read model  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-702, T-TU-903  
**Blocked by:** T-TU-102, T-TU-601

**Goal:** Avoid repeated broad refreshes during active phase drain.

**Delta should include:**

- changed tasks;
- newly ready tasks;
- completed assignments;
- active assignments;
- blocked assignments or tasks;
- reconcile-needed items;
- updated phase path;
- next action;
- new cursor/generation.

**Acceptance criteria:**

- Read model accepts a prior cursor/generation.
- Valid cursor returns only material changes.
- Stale or invalid cursor returns `needs_full_refresh`.
- Newly ready work can be assigned from delta output.
- Tests cover no-change, changed-task, new-ready-task, completed-assignment, and stale-cursor cases.

---

#### T-TU-702 — Add `phase-drain-delta` command

**Type:** command / CLI  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-TU-703, T-TU-801  
**Blocked by:** T-TU-701

**Goal:** Expose delta refresh to orchestrators after the initial phase packet.

**Command:**

```text
wk run phase-drain-delta '{ "cursor": "..." }'
```

**Acceptance criteria:**

- Command is registered in the command manifest.
- Output is bounded and schema-validated.
- Command returns a safe full-refresh recommendation on stale cursor.
- Command docs explain when to use delta vs full orchestration packet.

---

#### T-TU-703 — Update active phase drain guidance to use deltas

**Type:** prompt / playbook  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-903  
**Blocked by:** T-TU-702

**Goal:** Prevent agents from repeatedly calling broad dashboard/task reads in long active phases.

**Acceptance criteria:**

- Active phase guidance uses `phase-drain-delta` after the first orchestration packet.
- Broad refresh is allowed only on stale cursor, unsafe verdict, or explicit user/orchestrator decision.
- Guidance describes how to assign newly ready tasks from delta output.

---

### WBS-TU-800 — Release Closeout Packets

#### T-TU-801 — Implement phase release state packet builder

**Type:** backend / read model  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-802, T-TU-803  
**Blocked by:** T-TU-010, T-TU-702

**Goal:** Let agents determine release readiness without broad discovery of changelog, version, schema, PR, and evidence files.

**Packet fields:**

- phase key;
- release path verdict;
- phase branch status;
- main PR status;
- completed task count;
- missing evidence;
- required validation commands;
- current package version;
- recommended version bump;
- version mirror status;
- changelog status;
- release evidence manifest status;
- schema packageVersion mirror status;
- publish already-published check if available;
- next action.

**Acceptance criteria:**

- Builder returns compact release state.
- Missing release artifacts are explicitly listed.
- Packet contains refs instead of full changelog/schema content.
- Tests cover release-ready, missing-evidence, version-mismatch, and publish-blocked scenarios.

---

#### T-TU-802 — Add `phase-release-state` command

**Type:** command / CLI  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-804  
**Blocked by:** T-TU-801

**Goal:** Expose release readiness as a bounded packet.

**Command:**

```text
wk run phase-release-state '{ "phaseKey": "..." }'
```

**Acceptance criteria:**

- Command is registered in the command manifest.
- Output validates against `PhaseReleaseStatePacket`.
- Command docs tell agents not to inspect broad release files unless packet indicates missing/unsafe state.

---

#### T-TU-803 — Add `prepare-release-artifacts` dry-run command

**Type:** command / release automation  
**Size:** single session  
**Priority:** P2  
**Blocks:** T-TU-804  
**Blocked by:** T-TU-801

**Goal:** Deterministically prepare or preview release artifact updates so agents do not manually inspect and edit release files for routine closeout.

**Potential responsibilities:**

- changelog stub/update from completed task evidence;
- package version bump;
- packageVersion mirror updates;
- schema mirror updates;
- release evidence manifest seed.

**Acceptance criteria:**

- Command supports dry-run mode.
- Dry run reports exact files it would change.
- Mutating mode requires existing project policy approval conventions.
- Routine release artifact updates do not require reading full changelog/schema content first.

---

#### T-TU-804 — Add `release-closeout-result` command

**Type:** command / reporting  
**Size:** single session  
**Priority:** P2  
**Blocks:** T-TU-903, T-TU-905  
**Blocked by:** T-TU-802, T-TU-803

**Goal:** Generate final compact release evidence after merge/publish/workspace update.

**Result fields:**

- phase key;
- version;
- tag;
- main merge PR;
- published package;
- CI/watch status;
- workspace phase result;
- release evidence refs;
- remaining follow-ups.

**Acceptance criteria:**

- Command output can be used directly for the agent final report.
- No placeholders are required in successful closeout.
- Evidence refs are concrete and expandable.

---

### WBS-TU-900 — Metrics and Regression Harness

#### T-TU-901 — Add token usage metric snapshot command

**Type:** metrics / command  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-902, T-TU-904  
**Blocked by:** T-TU-001, T-TU-103

**Goal:** Provide repeatable before/after measurements for token-reduction work.

**Metric dimensions:**

- average dashboard Complete & Release prompt size;
- number of broad task-list reads per phase release;
- number of runbook files read per worker;
- average worker prompt size;
- number of full handoff/diff/log expansions per assignment;
- number of broad state refreshes during phase drain;
- model tier used per worker task;
- packet/delta command counts;
- successful release rate without user intervention.

**Acceptance criteria:**

- Command or report generator exists.
- Metrics can be captured from fixtures/simulations or real runs.
- Output is stable enough for regression comparison.

---

#### T-TU-902 — Add packet size budget tests

**Type:** tests / regression  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-903  
**Blocked by:** T-TU-020, T-TU-901

**Goal:** Prevent packet outputs from becoming the new bloated prompts.

**Implementation notes:**

- Define max-size budgets for key packet types.
- Budgets can be character-count based if tokenizer integration is not available.
- Tests should fail if full runbook text, full task histories, or raw logs appear in packets.

**Acceptance criteria:**

- Budget tests exist for orchestration, worker, delta, reconciliation, and release packets.
- Tests include explicit assertions against embedded full runbooks/logs.
- Budget thresholds are documented and adjustable.

---

#### T-TU-903 — Add end-to-end low-token orchestration simulation

**Type:** integration test / simulation  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-TU-905  
**Blocked by:** T-TU-401, T-TU-602, T-TU-703, T-TU-804, T-TU-902

**Goal:** Prove the intended packet chain works end to end.

**Target flow:**

```text
Dashboard Complete & Release
  -> compact prompt
  -> wk run phase-release-orchestration-state
  -> if active: wk run agent-execution-packet per ready task
  -> register assignments with packet digests/model tiers
  -> workers execute from packets
  -> workers submit Handoff v2
  -> wk run assignment-reconciliation-preflight
  -> wk run phase-drain-delta
  -> repeat until drained
  -> wk run phase-release-state
  -> wk run prepare-release-artifacts --dry-run
  -> release gates
  -> wk run release-closeout-result
  -> final compact evidence report
```

**Acceptance criteria:**

- Simulation runs without broad task-list reads after initial packet except when forced by stale cursor.
- Clean handoff reconciliation does not expand raw diffs/logs.
- Final report is produced from compact release result packet.
- Simulation records token/cost proxy improvements against baseline.

---

#### T-TU-904 — Add model-tier audit report

**Type:** metrics / reporting  
**Size:** single session  
**Priority:** P2  
**Blocks:** T-TU-905  
**Blocked by:** T-TU-301, T-TU-303, T-TU-901

**Goal:** Track whether expensive models are being used only where justified.

**Report fields:**

- assignment id;
- task id;
- recommended model tier;
- actual model tier if captured;
- escalation reason;
- packet digest;
- verdict/reconciliation status;
- validation outcome.

**Acceptance criteria:**

- Report identifies expensive-tier usage.
- Report flags missing escalation reasons.
- Report can be used during release review or maintainer audit.

---

#### T-TU-905 — Update maintainer documentation with new low-token workflow

**Type:** docs / generated docs  
**Size:** single session  
**Priority:** P2  
**Blocks:** none  
**Blocked by:** T-TU-804, T-TU-903, T-TU-904

**Goal:** Document the final intended low-token workflow for maintainers and future agents.

**Acceptance criteria:**

- Maintainer docs explain the packet/verdict/delta flow.
- Docs include command sequence and escalation rules.
- Docs identify quality gates that must not be skipped.
- Generated docs are refreshed according to documentation module rules if applicable.

---

## 3. Dependency Graph

```text
T-TU-001
  -> T-TU-010
      -> T-TU-101 -> T-TU-102 -> T-TU-103
      -> T-TU-201 -> T-TU-202 -> T-TU-203
      -> T-TU-501 -> T-TU-502 -> T-TU-503
      -> T-TU-701 -> T-TU-702 -> T-TU-703
      -> T-TU-801 -> T-TU-802 -> T-TU-804
      -> T-TU-801 -> T-TU-803 -> T-TU-804

T-TU-201 -> T-TU-301 -> T-TU-302 -> T-TU-303
T-TU-102 + T-TU-202 + T-TU-302 -> T-TU-401 -> T-TU-402
T-TU-501 + T-TU-502 -> T-TU-601 -> T-TU-602 -> T-TU-603
T-TU-102 + T-TU-601 -> T-TU-701
T-TU-001 + T-TU-103 -> T-TU-901 -> T-TU-902
T-TU-401 + T-TU-602 + T-TU-703 + T-TU-804 + T-TU-902 -> T-TU-903
T-TU-301 + T-TU-303 + T-TU-901 -> T-TU-904
T-TU-804 + T-TU-903 + T-TU-904 -> T-TU-905
```

---

## 4. Recommended Release Slices

### Release Slice 1 — Stop the Bleeding

**Goal:** Largest immediate token reduction.

Tasks:

1. T-TU-001 — Capture current token-cost baseline
2. T-TU-010 — Define token reduction contract types
3. T-TU-101 — Implement read model for phase release orchestration state
4. T-TU-102 — Add `phase-release-orchestration-state` command
5. T-TU-201 — Implement agent execution packet builder
6. T-TU-202 — Add `agent-execution-packet` command
7. T-TU-301 — Define model-tier policy catalog
8. T-TU-302 — Persist packet metadata on TeamAssignment records
9. T-TU-401 — Rewrite Complete & Release launch prompt to be packet-first

**Expected impact:** Highest immediate savings because orchestrator startup and subagent worker prompts stop repeating broad context.

---

### Release Slice 2 — Cheap Review

**Goal:** Reduce reconciliation cost and make worker completion machine-checkable.

Tasks:

1. T-TU-501 — Define Handoff v2 contract
2. T-TU-502 — Update `submit-assignment-handoff` for Handoff v2
3. T-TU-503 — Add worker handoff generation instructions
4. T-TU-601 — Implement assignment reconciliation preflight read model
5. T-TU-602 — Add `assignment-reconciliation-preflight` command
6. T-TU-603 — Integrate preflight into orchestrator reconciliation guidance

**Expected impact:** High savings in every phase with multiple workers because clean handoffs no longer require raw diff/log/prose expansion by default.

---

### Release Slice 3 — No More Rereading the World

**Goal:** Reduce long-running orchestration and active phase drain refresh cost.

Tasks:

1. T-TU-701 — Implement phase drain delta read model
2. T-TU-702 — Add `phase-drain-delta` command
3. T-TU-703 — Update active phase drain guidance to use deltas
4. T-TU-402 — Add long-session recovery instructions for packet flow

**Expected impact:** High savings in active phases with repeated updates, blocked tasks, or parallel assignments.

---

### Release Slice 4 — Cheap Release Closeout

**Goal:** Reduce final release preparation and reporting context size.

Tasks:

1. T-TU-801 — Implement phase release state packet builder
2. T-TU-802 — Add `phase-release-state` command
3. T-TU-803 — Add `prepare-release-artifacts` dry-run command
4. T-TU-804 — Add `release-closeout-result` command

**Expected impact:** Medium-high savings and improved release safety. Less urgent than worker packetization because closeout happens once per phase.

---

### Release Slice 5 — Prove and Guard the Savings

**Goal:** Make cost reduction measurable and durable.

Tasks:

1. T-TU-020 — Add token-reduction terminology to docs index
2. T-TU-303 — Add model-tier visibility to assignment reads and dashboard summaries
3. T-TU-901 — Add token usage metric snapshot command
4. T-TU-902 — Add packet size budget tests
5. T-TU-903 — Add end-to-end low-token orchestration simulation
6. T-TU-904 — Add model-tier audit report
7. T-TU-905 — Update maintainer documentation with new low-token workflow

**Expected impact:** Prevents cost creep from returning after the initial optimization work lands.

---

## 5. Planner Import Notes

- Each task is intentionally sized for a single agent session.
- Do not combine P0 implementation tasks unless an agent explicitly confirms the combined work remains bounded.
- Prefer implementing contracts and fixtures before commands.
- Prefer read-only packet commands before mutating workflow changes.
- Keep legacy compatibility unless a separate migration/release task explicitly approves a breaking change.
- When a task touches documentation-owned generated files, follow the repository documentation module rules rather than hand-editing generated surfaces.
- When a task touches policy-gated operations, preserve existing JSON `policyApproval` conventions.

---

## 6. Definition of Done for the Full Plan

The full token-reduction initiative is complete when:

1. Dashboard Complete & Release starts with a compact packet-first prompt.
2. Orchestrators use `phase-release-orchestration-state` for initial classification.
3. Workers use `agent-execution-packet` instead of broad task/runbook rediscovery.
4. TeamAssignment records preserve packet digest and model-tier context.
5. Workers submit Handoff v2 JSON as the source of truth.
6. Orchestrators run `assignment-reconciliation-preflight` before raw evidence expansion.
7. Active phase drain uses `phase-drain-delta` after the first packet.
8. Release closeout uses `phase-release-state`, `prepare-release-artifacts`, and `release-closeout-result`.
9. Metrics show reduced prompt size, broad reads, raw expansions, and expensive model use.
10. Tests prevent packet bloat, stale context misuse, and quality-gate bypass.
