# PHASE_131 — Packet Flow Corrective Plan + User Simulation Harness Roadmap

**Status:** Proposed implementation plan  
**Scope:** Phase 131 corrects the Phase 130 packet-flow gaps. Phase 132, defined in this same plan, adds a simulated user testing harness for Workflow Cannon usability and agent-response quality.  
**Primary goal:** Make packet-first phase release usable, safe, and high-savings in actual dashboard-launched agent runs.  
**Secondary goal:** Add a test harness that simulates realistic human users interacting with Workflow Cannon, so we can evaluate intuitive use, state correctness, agent response quality, and command/context efficiency.

## 1. Executive summary

Phase 130 built important packet infrastructure, but the flow is not yet coherent enough to reliably reduce AI token usage in real agent sessions.

Phase 131 fixes the packet-flow issues:

```text
Dashboard Complete & Release
  -> phase-release-orchestration-state { phaseKey }
  -> ready task draft packet refs
  -> register assignment from packet metadata draft
  -> assignment-locked agent-execution-packet
  -> worker handoff
  -> assignment-reconciliation-preflight
  -> phase-drain-delta { phaseKey, cursor }
  -> phase-release-state
  -> prepare-release-artifacts
  -> release-closeout-result
```

Phase 132 then adds a user simulation harness:

```text
User Test Director
  -> select persona + scenario
  -> seed fixture state
  -> simulate dashboard/chat flow
  -> observe user behavior
  -> validate Workflow Cannon state
  -> assess Workflow Cannon agent responses
  -> report usability, correctness, and efficiency findings
```

The user simulation harness is intentionally **not** part of the Phase 131 implementation critical path. Phase 131 should make the packet flow correct. Phase 132 should test whether real human-like operators can use it successfully.

## 2. Phase 130 gaps Phase 131 must fix

Phase 130 succeeded at adding foundations:

- `phase-release-orchestration-state`
- `phase-drain-delta`
- `agent-execution-packet`
- `assignment-reconciliation-preflight`
- packet metadata and packet digest storage
- `prepare-release-artifacts`
- `release-closeout-result`
- a shorter dashboard Complete & Release prompt

But these gaps remain:

1. Key commands ignore dashboard-requested `phaseKey` and operate on canonical workspace phase instead.
2. `phase-release-orchestration-state` lists ready tasks but does not provide packetized assignment next actions.
3. `agent-execution-packet` requires an assignment before it can generate the packet.
4. Worker packets depend too heavily on assignment metadata already containing path boundaries and model tier.
5. CAE is not yet used to select compact instruction refs/guidance cards for packets.
6. There is no true pre-release `phase-release-state` packet.
7. `release-closeout-result` is closer to a final markdown builder than a complete post-release evidence packet.
8. The dashboard prompt still carries rollout leftovers and broad authority attachment pressure.
9. There is no harness that tests the packet flow the way an agent or a human operator actually experiences it.

## 3. CAE usage policy

Use CAE for:

- selecting compact guidance cards for the current packet;
- returning instruction refs instead of embedding full runbooks;
- ranking which runbook sections apply to a packet;
- producing worker-facing `think/do/review/stop` guidance summaries;
- explaining why a model tier or specialist escalation is recommended;
- emitting advisory context that is safe to omit or expand.

Do **not** use CAE for:

- task lifecycle state;
- assignment lifecycle authority;
- release verdict authority;
- git branch truth;
- policy approval bypass;
- package publish safety;
- deciding that a task is complete without task-engine evidence.

Canonical ownership boundaries:

```text
Task Engine owns tasks, statuses, phase classification, closeout/release readiness, and publish safety.
Team Execution owns assignments, packets tied to assignments, handoffs, and reconciliation verdicts.
CAE owns guidance selection, instruction/reference narrowing, and advisory cards.
Dashboard owns the launch prompt and operator intent handoff.
User Simulation Harness owns scenario playback, persona simulation, UX scoring, and flow reports.
```

---

# PHASE 131 — Packet Flow Correction

## P131-T001 — Honor requested `phaseKey` in packet-first phase commands

**Priority:** P0  
**Goal:** Make `phase-release-orchestration-state` and `phase-drain-delta` honor explicit `args.phaseKey`, while still reporting canonical workspace phase and mismatches.

**Blocked by:** None.  
**Blocks:** P131-T002, P131-T003, P131-T006, P131-T007, P131-T008.

**Owned paths:**

- `src/modules/task-engine/commands/phase-delivery-readout-commands.ts`
- `src/modules/task-engine/phase-release-orchestration-state-runtime.ts`
- `src/modules/task-engine/instructions/phase-release-orchestration-state.md`
- `src/modules/task-engine/instructions/phase-drain-delta.md`
- relevant task-engine command tests

**Implementation steps:**

1. Read `args.phaseKey` in `phase-release-orchestration-state` and `phase-drain-delta`.
2. Use explicit `phaseKey` as the operational phase when provided.
3. Include `phaseSelection` metadata:
   - `requestedPhaseKey`
   - `canonicalPhaseKey`
   - `operationalPhaseKey`
   - `source`
   - `matchesCanonical`
   - `mismatchSeverity`
4. If requested phase differs from canonical workspace phase, do not silently switch phases.
5. Make delta cursor phase mismatch compare against the operational phase key.
6. Update instruction docs, snippets, and tests.

**Acceptance criteria:**

- Explicit `phaseKey` scopes command output to that phase.
- Canonical phase mismatch is visible and safe.
- No command silently operates on the wrong phase.
- Tests cover explicit phase, canonical fallback, match, mismatch, and cursor mismatch.

---

## P131-T002 — Add task-first draft mode to `agent-execution-packet`

**Priority:** P0  
**Goal:** Allow the orchestrator to request a draft execution packet from `taskId` before registering a Team Assignment.

**Blocked by:** P131-T001.  
**Blocks:** P131-T003, P131-T004, P131-T005, P131-T006.

**Owned paths:**

- `src/modules/team-execution/index.ts`
- `src/modules/team-execution/agent-execution-packet.ts`
- `src/contracts/team-execution-assignment-metadata.v1.ts`
- `schemas/agent-orchestration/assignment-metadata.v1.json`
- `.ai/agent-cli-snippets/by-command/agent-execution-packet.json`
- `src/modules/team-execution/instructions/agent-execution-packet.md`
- team-execution tests

**Implementation steps:**

1. Support current `assignmentId` mode.
2. Add `taskId` + `phaseKey` + `mode:"draft"` mode.
3. Draft mode returns task summary, acceptance criteria, recommended assignment metadata, model tier recommendation, boundary recommendations, validation recommendations, handoff contract recommendation, and suggested `register-assignment` command template.
4. Add `packetKind: "draft" | "assignment"`.
5. Add `packetLockStatus: "draft_unlocked" | "assignment_locked"`.
6. Keep draft mode read-only.
7. Add tests for draft mode, assignment mode, and invalid mixed args.

**Acceptance criteria:**

- Orchestrator can generate a bounded packet before assignment registration.
- Draft packet includes enough metadata to register a bounded assignment.
- Existing assignment-packet behavior remains compatible.

---

## P131-T003 — Add ready-work packet refs to `phase-release-orchestration-state`

**Priority:** P0  
**Goal:** Make active-work orchestration packets actionable by returning draft packet refs and assignment registration refs for ready work.

**Blocked by:** P131-T001, P131-T002, P131-T006.  
**Blocks:** P131-T008, P132-T003.

**Owned paths:**

- `src/modules/task-engine/phase-release-orchestration-state-runtime.ts`
- `src/modules/task-engine/commands/phase-delivery-readout-commands.ts`
- `src/modules/task-engine/instructions/phase-release-orchestration-state.md`
- `.ai/agent-cli-snippets/by-command/phase-release-orchestration-state.json`
- tests for phase release orchestration state

**Implementation steps:**

1. Add `readyWorkTop` entries for ready, unblocked tasks.
2. Include `taskId`, `title`, `priority`, `type`, `recommendedAction`, `draftPacketRef`, `registerAssignmentRef`, `parallelSafety`, `dependencySummary`, `modelTierRecommendation`, and `guidanceRefs` when available.
3. Keep output bounded with overflow refs.
4. Keep `readyUnblockedTop` temporarily for compatibility, but mark `readyWorkTop` preferred.
5. Add tests for active phase with multiple ready tasks.

**Acceptance criteria:**

- Active phase packet gives immediate draft-packet commands for ready tasks.
- Orchestrator does not need broad `list-tasks` to start ready workers.
- Output remains bounded.

---

## P131-T004 — Derive path boundary recommendations for draft packets

**Priority:** P1  
**Goal:** Give task-first packets candidate owned/read-only/forbidden path recommendations from task and repo metadata, with confidence and source labels.

**Blocked by:** P131-T002.  
**Blocks:** P131-T005, P131-T008.

**Owned paths:**

- `src/modules/team-execution/agent-execution-packet.ts`
- `src/modules/team-execution/index.ts`
- module/path ownership helpers if added
- `src/modules/team-execution/instructions/agent-execution-packet.md`
- packet boundary tests

**Implementation steps:**

1. Derive candidates from `task.technicalScope`, `task.metadata.ownedPaths`, `task.metadata.touchedPaths`, `task.features`, safe acceptance-criteria path mentions, module ownership maps, and task type heuristics.
2. Separate explicit and derived scope.
3. Add confidence labels: `high`, `medium`, `low`.
4. Do not treat low-confidence derived paths as edit authority.
5. Preserve explicit assignment boundaries as authority in assignment mode.
6. Add stop conditions for low-confidence boundaries.

**Acceptance criteria:**

- Draft packets include useful path recommendations.
- Low-confidence derived paths are clearly advisory.
- Assignment packets preserve explicit boundaries.

---

## P131-T005 — Use CAE to select compact packet guidance refs and cards

**Priority:** P1  
**Goal:** Use CAE as an advisory guidance selector for packet instruction refs and compact `think/do/review/stop` cards.

**Blocked by:** P131-T002, P131-T004, P131-T006.  
**Blocks:** P131-T008.

**Owned paths:**

- `src/modules/team-execution/agent-execution-packet.ts`
- `src/modules/context-activation/`
- `src/modules/team-execution/instructions/agent-execution-packet.md`
- CAE packet guidance tests

**Implementation steps:**

1. Add packet `guidance` field:
   - `source`
   - `cards`
   - `instructionRefs`
   - `runbookRefs`
   - `expandCommands`
2. Use CAE to select guidance based on task type, phase context, path boundaries, model tier, assignment status, and handoff contract.
3. Keep CAE output bounded and advisory.
4. Fall back to static refs when CAE is unavailable.
5. Ensure CAE cannot override task-engine or team-execution authority.

**Acceptance criteria:**

- Packets include compact guidance refs/cards.
- Agents receive refs instead of broad runbook text.
- CAE fallback is safe.

---

## P131-T006 — Add deterministic model-tier recommendation

**Priority:** P1  
**Goal:** Classify draft and assignment packets into model tiers with rationale and escalation triggers.

**Blocked by:** P131-T002.  
**Blocks:** P131-T003, P131-T005, P131-T008.

**Owned paths:**

- `src/modules/team-execution/agent-execution-packet.ts`
- `src/contracts/team-execution-assignment-metadata.v1.ts`
- `schemas/agent-orchestration/assignment-metadata.v1.json`
- model-tier tests

**Implementation steps:**

1. Add classifier for `cheap_fast`, `balanced`, `high_reasoning`, and `specialist` or map to existing tier labels if necessary.
2. Use task type, path scope, schema/persistence/release/security involvement, acceptance criteria count, unknown scope, prior failed attempts, and blocked/release-critical status.
3. Return recommended tier, rationale, escalation triggers, and downgrade conditions.
4. Do not override explicit assignment metadata; report mismatch instead.

**Acceptance criteria:**

- Packets always include model-tier recommendation.
- Recommendation is deterministic and explainable.
- Expensive models are reserved for risky/ambiguous work.

---

## P131-T007 — Add true `phase-release-state` pre-release packet

**Priority:** P1  
**Goal:** Add a compact pre-release readiness packet distinct from final `release-closeout-result`.

**Blocked by:** P131-T001.  
**Blocks:** P131-T009, P132-T003.

**Owned paths:**

- `src/modules/task-engine/commands/phase-delivery-readout-commands.ts`
- new `src/modules/task-engine/phase-release-state-runtime.ts`
- `src/modules/task-engine/instructions/phase-release-state.md`
- `src/contracts/builtin-run-command-manifest.json`
- `.ai/agent-cli-snippets/by-command/phase-release-state.json`
- release-state tests

**Implementation steps:**

1. Add command `phase-release-state` accepting explicit `phaseKey`.
2. Return release readiness verdict, branch status, main PR status when available, completed task count, missing evidence, required validation commands, package version, recommended version if available, changelog status, schema/packageVersion mirror status, release evidence manifest status, publish safety, already-published signal, and next action refs.
3. Keep output compact and reference-first.
4. Do not generate final report markdown here.

**Acceptance criteria:**

- Completed-only phase can proceed to release from `phase-release-state`.
- Missing release requirements are compact and explicit.
- Publish safety is explicit.

---

## P131-T008 — Clean and tighten dashboard Complete & Release prompt

**Priority:** P1  
**Goal:** Make dashboard Complete & Release prompt packet-first, explicit-phase, and free of rollout leftovers.

**Blocked by:** P131-T001, P131-T003, P131-T005, P131-T006.  
**Blocks:** P132-T004.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/phase-complete-release-prompt.ts`
- dashboard prompt tests

**Implementation steps:**

1. Remove rollout/review/rollback implementation noise.
2. Make first command explicit with phase key.
3. Tell agents not to open broad playbooks before the packet command unless unavailable.
4. Reduce attached authority list where possible.
5. Make prompt follow packet/verdict outputs.
6. Add prompt snapshot/assertion tests.

**Acceptance criteria:**

- Prompt is shorter and packet-first.
- Prompt includes explicit `phaseKey` in first command.
- Prompt does not encourage broad runbook-first behavior.

---

## P131-T009 — Expand `release-closeout-result` into complete post-release evidence packet

**Priority:** P2  
**Goal:** Include concrete PR/tag/package/CI/workspace evidence so final summaries do not require broad rediscovery.

**Blocked by:** P131-T007.  
**Blocks:** P132-T003.

**Owned paths:**

- `src/modules/task-engine/release-closeout-result-runtime.ts`
- `src/modules/task-engine/commands/phase-delivery-readout-commands.ts`
- `src/modules/task-engine/instructions/release-closeout-result.md`
- `.ai/agent-cli-snippets/by-command/release-closeout-result.json`
- closeout result tests

**Implementation steps:**

1. Extend inputs or derivation for main merge PR, release branch, final commit SHA, tag, package/version, npm publish/dist-tag status, CI/watch result, release evidence manifest path, workspace phase result, and follow-ups.
2. Preserve placeholder-free final report behavior.
3. Add structured `finalEvidence` separate from final markdown.
4. Return precise missing evidence refs when incomplete.

**Acceptance criteria:**

- Final response can be generated from `release-closeout-result` without broad rediscovery.
- Missing final evidence is explicit.

---

## P131-T010 — Add Phase 131 packet-flow regression simulation

**Priority:** P2  
**Goal:** Add deterministic simulation/regression evidence for packet-first flow.

**Blocked by:** P131-T003, P131-T007, P131-T008.  
**Blocks:** P132-T003.

**Owned paths:**

- `artifacts/phase-131-packet-flow-simulation.md`
- packet-flow fixtures/tests

**Implementation steps:**

1. Create synthetic phase cases: empty, completed-only, active work with two ready tasks, requested/canonical mismatch, and assignment handoff ready to reconcile.
2. Capture expected command sequence.
3. Document expected context savings vs old broad discovery path.
4. Add snapshot/assertion tests where practical.

**Acceptance criteria:**

- Simulation proves packet-first flow works without broad `list-tasks` discovery.
- Mismatch/fallback cases are documented.

---

# PHASE 132 — Simulated User Harness

## 4. Phase 132 thesis

Phase 131 proves that Workflow Cannon can expose a correct packet-first agent flow. Phase 132 tests whether realistic human-like users can understand and successfully use Workflow Cannon through dashboard/chat flows.

The goal is not visual testing first. The goal is a deterministic, scriptable harness that simulates users, observes Workflow Cannon agent responses, validates state, and reports usability/correctness/efficiency issues.

The harness should support two primary personas at first:

1. **Project Manager / non-technical operator** — limited technical background, wants plain-language confidence and does not understand internal command mechanics.
2. **Expert Engineer** — audits evidence, packet authority, branch/task correctness, and release safety.

Later personas can include release manager, QA tester, new contributor, founder/operator, or power user.

## 5. User simulation harness architecture

Recommended layers:

```text
Layer 1: Agent Flow Harness
  Tests command/packet/state behavior without human UX simulation.

Layer 2: Simulated User Harness
  Tests persona behavior, agent responses, state correctness, and efficiency.

Layer 3: Dashboard UI Harness
  Later extension/webview automation for actual button clicks and visible UI behavior.
```

Phase 132 should build Layers 1 and 2. Layer 3 should be a later phase unless basic dashboard prompt generation tests are enough.

## 6. Initial personas

### Persona: `pm-nontechnical`

Purpose:

```text
Represents a project manager or product operator with limited technical background.
Tests whether Workflow Cannon is understandable, confidence-building, and safe to operate without CLI expertise.
```

Behavior profile:

- prefers plain English;
- avoids CLI details;
- asks if release/publish is safe;
- may confuse phase vs branch;
- may confuse task status vs assignment status;
- may not understand packet digest, policyApproval, evidence refs, or validation commands;
- expects agent responses to summarize what happened and what needs action.

Success criteria:

- can identify whether the phase is ready;
- understands what the agent is doing;
- is not forced to read raw command output;
- receives clear explanations for blocked or unsafe states;
- does not get asked unnecessary technical questions.

### Persona: `expert-engineer`

Purpose:

```text
Represents a senior engineer auditing correctness, evidence, and state safety.
```

Behavior profile:

- asks for concrete evidence;
- checks explicit `phaseKey` usage;
- notices stale state and phase mismatch;
- challenges unsafe release behavior;
- expects precise task, assignment, branch, packet, and PR state;
- wants concise command refs and evidence refs.

Success criteria:

- can audit why the agent chose a path;
- can verify state correctness;
- can recover from blocked flows;
- can see packet authority and evidence without broad rediscovery.

## 7. Scenario library shape

Store human-editable scenarios under:

```text
test/harness/user-simulation/scenarios/
```

Recommended scenario format: YAML or JSON.

Each scenario should include:

- scenario id;
- title;
- entry point;
- phase key;
- persona ids;
- initial workspace/task/assignment fixture state;
- user script or autonomous persona settings;
- expected workflow events;
- state assertions;
- UX assertions;
- efficiency assertions.

Initial scenarios:

1. `complete-release-empty-phase`
2. `complete-release-completed-only`
3. `complete-release-active-work`
4. `phase-mismatch`
5. `worker-handoff-forbidden-path`
6. `release-artifacts-missing`
7. `blocked-task-needs-user-decision`

## 8. Observability streams

The harness should capture four streams:

### User stream

Tracks persona actions and confusion signals:

- action taken;
- question asked;
- confusion signal;
- confusion type;
- notes.

### Agent response stream

Tracks whether Workflow Cannon agent responses were:

- correct;
- efficient;
- too technical;
- too vague;
- missing evidence;
- asking unnecessary questions;
- failing to mention important user-facing consequences.

### Workflow Cannon state stream

Validates:

- phase state;
- task state;
- assignment state;
- packet metadata/digests;
- handoff/reconciliation state;
- release state;
- no out-of-scope state mutation.

### Efficiency stream

Tracks:

- commands run;
- broad commands avoided;
- runbook files opened;
- packet size / context bytes;
- broad fallback events;
- repeated refreshes;
- estimated token pressure.

---

## P132-T001 — Define persona schema and initial personas

**Priority:** P0  
**Goal:** Add a human-editable persona schema and two initial personas: `pm-nontechnical` and `expert-engineer`.

**Blocked by:** None.  
**Blocks:** P132-T003, P132-T006.

**Owned paths:**

- `test/harness/user-simulation/personas/`
- `test/harness/user-simulation/persona.schema.json` or equivalent
- persona loader tests

**Implementation steps:**

1. Define persona schema.
2. Add `pm-nontechnical.yaml`.
3. Add `expert-engineer.yaml`.
4. Add loader/validator.
5. Add tests for valid and invalid personas.

**Acceptance criteria:**

- Personas are human-editable.
- Harness can load and validate both initial personas.
- Persona fields include goals, behavior profile, likely confusions, and success criteria.

---

## P132-T002 — Define scenario schema and initial scenario library

**Priority:** P0  
**Goal:** Add human-editable scenarios covering the key packet/release/user-flow cases.

**Blocked by:** None.  
**Blocks:** P132-T003, P132-T005, P132-T006, P132-T007.

**Owned paths:**

- `test/harness/user-simulation/scenarios/`
- `test/harness/user-simulation/scenario.schema.json` or equivalent
- scenario loader tests

**Implementation steps:**

1. Define scenario schema.
2. Add initial scenarios:
   - empty phase;
   - completed-only phase;
   - active work;
   - phase mismatch;
   - forbidden-path handoff;
   - missing release artifacts;
   - blocked task needs user decision.
3. Add scenario loader/validator.
4. Keep scenarios easy for humans to edit.

**Acceptance criteria:**

- Scenarios are human-editable.
- Harness can load/validate all initial scenarios.
- Scenarios include state, UX, and efficiency expectations.

---

## P132-T003 — Build scripted agent-flow harness

**Priority:** P0  
**Goal:** Build deterministic harness runner that executes packet-flow scenarios without real LLM calls.

**Blocked by:** P131-T003, P131-T007, P131-T010, P132-T001, P132-T002.  
**Blocks:** P132-T004, P132-T005, P132-T006, P132-T007.

**Owned paths:**

- `scripts/agent-flow-harness.mjs`
- `test/harness/user-simulation/`
- harness tests

**Implementation steps:**

1. Seed fixture state for a scenario.
2. Run the expected packet-flow command sequence deterministically.
3. Support dry-run mode.
4. Record command sequence and outputs.
5. Track broad fallback events.
6. Emit a structured run report.

**Acceptance criteria:**

- Harness can run empty, completed-only, and active-work scenarios.
- Harness validates state assertions.
- Harness does not require real AI calls.

---

## P132-T004 — Add dashboard prompt generation adapter

**Priority:** P1  
**Goal:** Test dashboard-generated prompts without launching the full VSCode webview.

**Blocked by:** P131-T008, P132-T003.  
**Blocks:** P132-T006.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/phase-complete-release-prompt.ts`
- `extensions/cursor-workflow-cannon/test/`
- `test/harness/user-simulation/`

**Implementation steps:**

1. Expose or import prompt generation in tests.
2. Generate prompts for scenario phase context.
3. Assert first command uses explicit phaseKey.
4. Assert prompt is packet-first.
5. Assert prompt does not contain broad runbook-first or rollout leftover language.
6. Feed prompt metadata into harness report.

**Acceptance criteria:**

- Dashboard prompt generation is testable without real UI.
- Prompt assertions cover packet-first behavior.

---

## P132-T005 — Add Workflow Cannon state evaluator

**Priority:** P1  
**Goal:** Validate Workflow Cannon state correctness after each scenario run.

**Blocked by:** P132-T002, P132-T003.  
**Blocks:** P132-T008.

**Owned paths:**

- `test/harness/user-simulation/evaluators/state-evaluator.mjs`
- scenario fixtures/tests

**Implementation steps:**

1. Evaluate phase state.
2. Evaluate task state.
3. Evaluate assignment state.
4. Evaluate packet metadata/digests.
5. Evaluate release state when applicable.
6. Report mismatches with precise evidence.

**Acceptance criteria:**

- State evaluator catches wrong phase operation, missing assignment packet digest, incorrect task state, and missing release evidence.

---

## P132-T006 — Add UX and response evaluator

**Priority:** P1  
**Goal:** Evaluate whether Workflow Cannon agent responses are understandable, correct, and efficient for each persona.

**Blocked by:** P132-T001, P132-T002, P132-T003, P132-T004.  
**Blocks:** P132-T008.

**Owned paths:**

- `test/harness/user-simulation/evaluators/ux-evaluator.mjs`
- `test/harness/user-simulation/evaluators/response-evaluator.mjs`
- persona/scenario tests

**Implementation steps:**

1. Score responses for clarity, correctness, jargon, unnecessary questions, missing evidence, and user-facing next steps.
2. Track confusion signals from persona scripts.
3. Compare response requirements against persona success criteria.
4. Support deterministic rubric scoring first; optional LLM grading can come later.

**Acceptance criteria:**

- PM persona flags over-technical responses.
- Expert persona flags missing evidence or imprecise state claims.
- Evaluator output is deterministic by default.

---

## P132-T007 — Add efficiency/context evaluator

**Priority:** P1  
**Goal:** Measure whether a scenario used the packet-first flow efficiently.

**Blocked by:** P132-T002, P132-T003.  
**Blocks:** P132-T008.

**Owned paths:**

- `test/harness/user-simulation/evaluators/efficiency-evaluator.mjs`
- harness report tests

**Implementation steps:**

1. Count commands run.
2. Track broad command usage.
3. Track runbook-open events if available.
4. Track packet sizes/context bytes.
5. Track broad fallback events.
6. Emit estimated token-pressure metrics.

**Acceptance criteria:**

- Harness reports broad discovery fallback.
- Harness can compare expected vs actual command sequence.
- Packet sizes/context bytes are recorded.

---

## P132-T008 — Add User Test Director and Scout agent roles

**Priority:** P2  
**Goal:** Define agent roles for orchestrating user simulations and reporting UX/state/efficiency defects.

**Blocked by:** P132-T005, P132-T006, P132-T007.  
**Blocks:** P132-T009.

**Owned paths:**

- `.ai/agents/` or existing agent definition area
- `AGENT_ORCHESTRATION_PROFILES.md`
- `AGENT_ORCHESTRATION_CONTRACTS.md`
- harness docs/tests

**Implementation steps:**

1. Define **User Test Director** role:
   - selects persona/scenario;
   - seeds fixture;
   - runs harness;
   - evaluates state, UX, and efficiency;
   - reports findings.
2. Define **Scout / user-testing agent** role:
   - acts like a user tester;
   - does not implement product code;
   - reports defects/improvement candidates.
3. Define allowed and forbidden actions.
4. Add examples for running simulations.

**Acceptance criteria:**

- Roles are documented and bounded.
- User-testing agents cannot publish, merge, or mutate production task state outside dry-run fixtures.

---

## P132-T009 — Add simulation report-to-task workflow

**Priority:** P2  
**Goal:** Convert harness findings into proposed defects or improvements without directly mutating execution scope.

**Blocked by:** P132-T008.  
**Blocks:** None.

**Owned paths:**

- `test/harness/user-simulation/reports/`
- `scripts/agent-flow-harness.mjs`
- optional `report-defect` or `create-task` integration docs

**Implementation steps:**

1. Emit structured finding reports.
2. Classify findings:
   - usability issue;
   - state correctness issue;
   - response quality issue;
   - efficiency issue;
   - dashboard prompt issue;
   - packet gap.
3. Generate suggested `report-defect` or `create-task` payloads.
4. Keep task creation optional/dry-run by default.

**Acceptance criteria:**

- Harness can produce actionable improvement/defect payloads.
- Findings are traceable to scenario, persona, step, and evidence.
- No production task mutation happens by default.

---

## 9. Combined dependency map

```text
Phase 131:
P131-T001
  ├─→ P131-T002
  │     ├─→ P131-T006
  │     │     ├─→ P131-T003
  │     │     └─→ P131-T005
  │     ├─→ P131-T004
  │     │     └─→ P131-T005
  │     └─→ P131-T003
  │           └─→ P131-T008
  └─→ P131-T007
        └─→ P131-T009

P131-T003 + P131-T007 + P131-T008
  └─→ P131-T010

Phase 132:
P132-T001 + P132-T002
  └─→ P132-T003
        ├─→ P132-T004
        ├─→ P132-T005
        ├─→ P132-T006
        └─→ P132-T007
              └─→ P132-T008
                    └─→ P132-T009
```

## 10. Recommended implementation order

1. P131-T001 — explicit phaseKey correctness.
2. P131-T002 — task-first draft packet.
3. P131-T006 — model-tier recommendation.
4. P131-T004 — derived path boundaries.
5. P131-T003 — actionable ready-work refs.
6. P131-T005 — CAE guidance cards/refs.
7. P131-T008 — prompt cleanup.
8. P131-T007 — true phase-release-state.
9. P131-T009 — complete release-closeout-result.
10. P131-T010 — packet-flow simulation.
11. P132-T001 — persona schema/personas.
12. P132-T002 — scenario schema/library.
13. P132-T003 — scripted harness runner.
14. P132-T004 — dashboard prompt adapter.
15. P132-T005 — state evaluator.
16. P132-T006 — UX/response evaluator.
17. P132-T007 — efficiency/context evaluator.
18. P132-T008 — User Test Director / Scout roles.
19. P132-T009 — report-to-task workflow.

## 11. Task-engine creation notes

This connector cannot directly execute local `wk run create-task`. To create the tasks locally:

1. Use each task heading as the task title.
2. Use each task's goal as the task summary.
3. Use `phaseKey: "131"` for P131 tasks and `phaseKey: "132"` for P132 tasks.
4. Use the `Blocked by` field as `dependsOn` where the task engine supports it.
5. Use `Owned paths` as `technicalScope` and `metadata.ownedPaths`.
6. Use `Acceptance criteria` as task acceptance criteria.
7. Use `priority` from each task.

Recommended local command pattern:

```bash
pnpm exec wk run create-task '{
  "title":"<task title>",
  "type":"execution",
  "status":"ready",
  "priority":"<P0|P1|P2>",
  "phaseKey":"<131|132>",
  "phase":"Phase <131|132>",
  "summary":"<goal>",
  "dependsOn":["<task ids or titles if supported>"],
  "acceptanceCriteria":["..."],
  "technicalScope":["..."],
  "metadata":{
    "ownedPaths":["..."],
    "validationCommands":[
      {"command":"pnpm run build"},
      {"command":"pnpm run test"}
    ]
  }
}'
```

## 12. Done criteria

Phase 131 is done when:

- dashboard-launched Complete & Release operates on explicit target phase safely;
- active ready work proceeds from `readyWorkTop` to draft packet to assignment registration to locked worker packet;
- packets provide useful derived boundaries and model tier recommendations;
- CAE provides compact guidance refs/cards without owning lifecycle authority;
- closeout uses `phase-release-state` before release execution;
- final release reporting can use `release-closeout-result` without broad rediscovery;
- prompt is clean, packet-first, and free of rollout leftovers;
- simulation proves the packet-first flow reduces context compared with broad discovery.

Phase 132 is done when:

- PM and expert engineer personas exist and validate;
- editable scenario library exists;
- scripted harness can run core scenarios without real AI calls;
- dashboard prompt generation is tested through the harness;
- state, UX/response, and efficiency evaluators produce structured reports;
- User Test Director and Scout roles are defined;
- harness findings can produce proposed defect/improvement payloads without mutating production task state by default.
