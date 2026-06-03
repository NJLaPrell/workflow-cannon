# PHASE_131 — Packet Flow Corrective Plan

**Status:** Proposed next phase after `release/phase-130`  
**Purpose:** Turn Phase 130's packet infrastructure into a coherent low-token orchestration flow.  
**Primary goal:** Make packet-first phase release usable, safe, and high-savings in actual dashboard-launched agent runs.  
**Secondary goal:** Use CAE where it is the right solution: guidance selection, instruction/reference scoping, and packet advisory cards — not task lifecycle ownership.

## 1. Phase 131 thesis

Phase 130 built important infrastructure:

- `phase-release-orchestration-state`
- `phase-drain-delta`
- `agent-execution-packet`
- `assignment-reconciliation-preflight`
- packet metadata and packet digest storage
- `prepare-release-artifacts`
- `release-closeout-result`
- a shorter dashboard Complete & Release prompt

But the flow is not yet coherent enough to reliably reduce AI tokens:

1. Key commands ignore the dashboard-requested `phaseKey` and operate on canonical workspace phase instead.
2. `phase-release-orchestration-state` lists ready tasks but does not provide packetized assignment next actions.
3. `agent-execution-packet` requires an assignment before it can generate the packet, creating a task/assignment chicken-and-egg problem.
4. Worker packets depend too heavily on assignment metadata already containing path boundaries and model tier.
5. CAE is not yet used to select compact instruction refs/guidance cards for packets.
6. There is no true pre-release `phase-release-state` packet.
7. `release-closeout-result` is closer to a final markdown builder than a complete post-release evidence packet.
8. The dashboard prompt still carries rollout leftovers and broad authority attachment pressure.

Phase 131 should make the high-savings path real:

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

## 2. CAE usage policy for Phase 131

Use CAE for:

- selecting compact guidance cards for the current packet;
- returning instruction refs instead of embedding full runbooks;
- ranking which runbook sections apply to a packet;
- producing worker-facing `think/do/review` guidance summaries;
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
```

## 3. Phase 131 task breakdown

---

## P131-T001 — Honor requested `phaseKey` in packet-first phase commands

**Priority:** P0  
**Severity:** Critical  
**Value:** Correctness and release safety. Prevents the dashboard from requesting one phase while commands operate on another.

**Goal:** Make `phase-release-orchestration-state` and `phase-drain-delta` honor an explicit `args.phaseKey`, while still reporting canonical workspace phase and mismatches.

**Blocked by:** None.

**Blocks:** P131-T002, P131-T003, P131-T006, P131-T008.

**Owned paths:**

- `src/modules/task-engine/commands/phase-delivery-readout-commands.ts`
- `src/modules/task-engine/phase-release-orchestration-state-runtime.ts`
- `src/modules/task-engine/instructions/phase-release-orchestration-state.md`
- `src/modules/task-engine/instructions/phase-drain-delta.md`
- `test/` or existing task-engine command tests

**Implementation steps:**

1. In the `phase-release-orchestration-state` command handler, read `args.phaseKey` if provided.
2. Use the explicit `phaseKey` as the operational phase key.
3. Include canonical phase metadata separately.
4. Add `phaseSelection` to the packet:
   - `requestedPhaseKey`
   - `canonicalPhaseKey`
   - `operationalPhaseKey`
   - `source: "args.phaseKey" | "canonical"`
   - `matchesCanonical`
   - `mismatchSeverity`
5. If requested phase differs from canonical workspace phase, do not silently switch phases. Return a safe verdict such as `blocked` or a dedicated `phase-mismatch` indicator with next action requiring operator/orchestrator decision.
6. Apply the same explicit phase handling to `phase-drain-delta`.
7. Make cursor phase mismatch compare against the operational phase key.
8. Update instruction docs and command snippets.
9. Add tests for explicit phase, canonical fallback, requested/canonical match, requested/canonical mismatch, and delta cursor mismatch.

**Acceptance criteria:**

- `wk run phase-release-orchestration-state '{"phaseKey":"131"}'` scopes to Phase 131 even if workspace current phase differs.
- Packet includes canonical phase metadata and mismatch status.
- Mismatch does not silently operate on the canonical phase.
- `phase-drain-delta` uses the same operational phase key as the initial packet.
- Tests cover explicit and fallback phase selection.

**Validation commands:**

```bash
pnpm run build
pnpm run test
pnpm exec wk run phase-release-orchestration-state '{"phaseKey":"131"}'
pnpm exec wk run phase-drain-delta '{"phaseKey":"131"}'
```

---

## P131-T002 — Add task-first draft mode to `agent-execution-packet`

**Priority:** P0  
**Severity:** Critical  
**Value:** Removes the assignment-before-packet chicken-and-egg problem and enables bounded worker context before assignment registration.

**Goal:** Allow the orchestrator to request a draft execution packet from a `taskId` before registering a Team Assignment.

**Blocked by:** P131-T001.

**Blocks:** P131-T003, P131-T004, P131-T005.

**Owned paths:**

- `src/modules/team-execution/index.ts`
- `src/modules/team-execution/agent-execution-packet.ts`
- `src/contracts/team-execution-assignment-metadata.v1.ts`
- `schemas/agent-orchestration/assignment-metadata.v1.json`
- `.ai/agent-cli-snippets/by-command/agent-execution-packet.json`
- `src/modules/team-execution/instructions/agent-execution-packet.md`
- tests for team-execution commands

**Implementation steps:**

1. Extend `agent-execution-packet` input to support:
   - `assignmentId` mode, current behavior;
   - `taskId` + `phaseKey` + `mode:"draft"` mode.
2. Draft mode should not require assignment existence.
3. Draft mode should return:
   - task summary;
   - acceptance criteria;
   - phase key;
   - recommended assignment metadata;
   - model tier recommendation;
   - path boundary recommendations;
   - validation recommendations;
   - handoff contract recommendation;
   - suggested `register-assignment` command template;
   - packet digest for the draft.
4. Assignment mode should remain the locked worker packet for an actual worker.
5. Add `packetKind: "draft" | "assignment"`.
6. Add `packetLockStatus`:
   - `draft_unlocked` for task-first mode;
   - `assignment_locked` for assignment mode.
7. Keep draft mode read-only.
8. Update command manifest and snippets.
9. Add tests proving draft mode works before assignment registration and assignment mode still works after registration.

**Acceptance criteria:**

- Orchestrator can call `agent-execution-packet` with `taskId` before registering an assignment.
- Draft packet includes enough metadata to register a bounded assignment.
- Existing assignment packet behavior remains backward compatible.
- Draft packet clearly states that assignment is not yet locked.
- Tests cover draft packet, assignment packet, and invalid mixed args.

**Validation commands:**

```bash
pnpm run build
pnpm run test
pnpm exec wk run agent-execution-packet '{"taskId":"TAMPLE","phaseKey":"131","mode":"draft"}'
```

---

## P131-T003 — Add ready-work packet refs to `phase-release-orchestration-state`

**Priority:** P0  
**Severity:** High  
**Value:** Makes the orchestration packet actionable instead of merely descriptive.

**Goal:** Replace or supplement `readyUnblockedTop` with actionable ready-work entries that point to draft packets and assignment registration next steps.

**Blocked by:** P131-T001, P131-T002.

**Blocks:** P131-T008.

**Owned paths:**

- `src/modules/task-engine/phase-release-orchestration-state-runtime.ts`
- `src/modules/task-engine/commands/phase-delivery-readout-commands.ts`
- `src/modules/task-engine/instructions/phase-release-orchestration-state.md`
- `.ai/agent-cli-snippets/by-command/phase-release-orchestration-state.json`
- tests for phase release orchestration state

**Implementation steps:**

1. Add `readyWorkTop` entries for ready, unblocked tasks.
2. Each entry should include:
   - `taskId`
   - `title`
   - `priority`
   - `type`
   - `recommendedAction`
   - `draftPacketRef`
   - `registerAssignmentRef`
   - `parallelSafety`
   - `dependencySummary`
   - `modelTierRecommendation` if available
   - `guidanceRefs` if CAE integration is available from P131-T005
3. Keep a bounded limit and overflow refs.
4. Keep `readyUnblockedTop` temporarily if needed for compatibility, but mark `readyWorkTop` as the preferred field.
5. If no ready work exists but tasks remain, return blocked/in-progress/proposed summary and next safe command.
6. Add tests for active-work phase with multiple ready tasks.

**Acceptance criteria:**

- Active phase packet gives the orchestrator immediate draft-packet commands for ready tasks.
- The orchestrator no longer needs to call broad `list-tasks` to know how to start ready workers.
- Output remains bounded.
- Overflow is explicit.

**Validation commands:**

```bash
pnpm run build
pnpm run test
pnpm exec wk run phase-release-orchestration-state '{"phaseKey":"131"}'
```

---

## P131-T004 — Derive path boundary recommendations for draft packets

**Priority:** P1  
**Severity:** High  
**Value:** Makes packets useful even before the orchestrator manually supplies owned paths.

**Goal:** Give task-first packets candidate owned/read-only/forbidden path recommendations from task and repo metadata, with confidence and source labels.

**Blocked by:** P131-T002.

**Blocks:** P131-T005, P131-T008.

**Owned paths:**

- `src/modules/team-execution/agent-execution-packet.ts`
- `src/modules/team-execution/index.ts`
- module/path ownership helper files if present
- `src/modules/team-execution/instructions/agent-execution-packet.md`
- tests for packet boundary derivation

**Implementation steps:**

1. Derive candidate paths from:
   - `task.technicalScope`
   - `task.metadata.ownedPaths`
   - `task.metadata.touchedPaths`
   - `task.features`
   - acceptance criteria path mentions, if already supported safely
   - module ownership map if available
   - task type heuristics
2. Separate explicit and derived scope:
   - `explicitOwnedPaths`
   - `derivedOwnedPaths`
   - `readOnlyPaths`
   - `forbiddenPaths`
   - `requiresApprovalPaths`
3. Add confidence:
   - `high` when explicit task/metadata paths exist;
   - `medium` when module map/features infer paths;
   - `low` for text heuristics.
4. In draft mode, recommend metadata but do not treat low-confidence paths as hard owned scope.
5. In assignment mode, keep existing assignment metadata as authority.
6. Add stop conditions when confidence is low.
7. Add tests for explicit metadata paths, technicalScope paths, no-path fallback, and forbidden path preservation.

**Acceptance criteria:**

- Draft packets usually include useful path recommendations without manual discovery.
- Assignment packets preserve explicit assignment boundaries as authority.
- Low-confidence derived scope is clearly labeled and does not silently authorize edits.
- Stop conditions reflect boundary confidence.

**Validation commands:**

```bash
pnpm run build
pnpm run test
```

---

## P131-T005 — Use CAE to select compact packet guidance refs and cards

**Priority:** P1  
**Severity:** Medium-high  
**Value:** Applies CAE where it fits: reducing runbook/context bloat through targeted guidance selection.

**Goal:** Add optional CAE-backed guidance selection to draft and assignment packets so agents receive compact relevant guidance instead of broad runbooks.

**Blocked by:** P131-T002, P131-T004.

**Blocks:** P131-T008.

**Owned paths:**

- `src/modules/team-execution/agent-execution-packet.ts`
- CAE command/dispatcher files as needed
- `src/modules/context-activation/`
- `src/modules/team-execution/instructions/agent-execution-packet.md`
- tests for CAE packet guidance selection

**Implementation steps:**

1. Add packet field `guidance`:
   - `source: "cae" | "static" | "none"`
   - `cards`
   - `instructionRefs`
   - `runbookRefs`
   - `expandCommands`
2. Use CAE to select compact guidance based on:
   - task type;
   - phase release context;
   - path boundaries;
   - model tier recommendation;
   - assignment status;
   - handoff contract.
3. CAE output should be bounded and advisory.
4. Do not embed full runbook text.
5. Return stable refs and short cards, for example:
   - `think`
   - `do`
   - `review`
   - `stop`
6. If CAE is unavailable, fall back to static instruction refs.
7. Ensure CAE does not override task-engine or team-execution authority.
8. Add tests for CAE available, CAE unavailable, and bounded output.

**Acceptance criteria:**

- Packets include compact guidance refs/cards.
- CAE guidance is advisory and cannot override lifecycle/policy fields.
- Agents do not need broad playbook reads for normal worker starts.
- Packet output stays bounded.

**Validation commands:**

```bash
pnpm run build
pnpm run test
pnpm exec wk run agent-execution-packet '{"taskId":"TAMPLE","phaseKey":"131","mode":"draft"}'
```

---

## P131-T006 — Add deterministic model-tier recommendation

**Priority:** P1  
**Severity:** High  
**Value:** Directly supports lower credit usage by routing routine work to cheaper models and reserving specialist models for risk.

**Goal:** Produce a deterministic model-tier recommendation in draft and assignment packets, using task risk/scope signals and escalation triggers.

**Blocked by:** P131-T002.

**Blocks:** P131-T003, P131-T005, P131-T008.

**Owned paths:**

- `src/modules/team-execution/agent-execution-packet.ts`
- `src/contracts/team-execution-assignment-metadata.v1.ts`
- `schemas/agent-orchestration/assignment-metadata.v1.json`
- tests for model-tier recommendation

**Implementation steps:**

1. Add model-tier classifier with tiers such as:
   - `cheap_fast`
   - `balanced`
   - `high_reasoning`
   - `specialist`
2. Map to existing model tier labels if the current schema only allows `tier_1`, `tier_2`, `tier_3`; otherwise update schema carefully.
3. Use signals:
   - task type;
   - touched/owned paths;
   - schema/persistence/release/security involvement;
   - number of acceptance criteria;
   - unknown/low-confidence path scope;
   - prior failed attempts if available;
   - blocked/release-critical status.
4. Return:
   - recommended tier;
   - rationale;
   - escalation triggers;
   - downgrade conditions.
5. Do not override explicit assignment metadata; instead report explicit vs recommended mismatch.
6. Add tests for docs-only, normal implementation, schema/persistence, release blocker, and low-confidence scope.

**Acceptance criteria:**

- Packets always include a model-tier recommendation.
- Recommendation is explainable and deterministic.
- Expensive model use is reserved for high-risk or ambiguous work.
- Explicit assignment model tier remains visible if different from recommendation.

**Validation commands:**

```bash
pnpm run build
pnpm run test
```

---

## P131-T007 — Add true `phase-release-state` pre-release packet

**Priority:** P1  
**Severity:** High  
**Value:** Reduces closeout/release discovery and avoids conflating pre-release readiness with final release reporting.

**Goal:** Add a pre-release packet that summarizes release readiness before merge/publish.

**Blocked by:** P131-T001.

**Blocks:** P131-T009.

**Owned paths:**

- `src/modules/task-engine/commands/phase-delivery-readout-commands.ts`
- new `src/modules/task-engine/phase-release-state-runtime.ts`
- `src/modules/task-engine/instructions/phase-release-state.md`
- `src/contracts/builtin-run-command-manifest.json`
- `.ai/agent-cli-snippets/by-command/phase-release-state.json`
- schema snapshots
- tests for release-state packet

**Implementation steps:**

1. Add command `phase-release-state`.
2. Accept explicit `phaseKey`.
3. Return:
   - phase key;
   - release readiness verdict;
   - phase branch status;
   - main PR status if available;
   - completed task count;
   - missing evidence;
   - required validation commands;
   - package version;
   - proposed/recommended version if available;
   - changelog status;
   - schema/packageVersion mirror status;
   - release evidence manifest status;
   - publish safety;
   - already-published signal if available;
   - next action refs.
4. Keep output compact and reference-first.
5. Do not generate final report markdown here.
6. Add tests for ready, missing artifacts, missing evidence, version mismatch, and publish blocked.

**Acceptance criteria:**

- A completed-only phase can proceed to release from `phase-release-state` without broad file discovery.
- Missing release requirements are listed compactly.
- Publish safety is explicit.
- `release-closeout-result` remains post-release/final-report focused.

**Validation commands:**

```bash
pnpm run build
pnpm run test
pnpm exec wk run phase-release-state '{"phaseKey":"131"}'
```

---

## P131-T008 — Clean and tighten dashboard Complete & Release prompt

**Priority:** P1  
**Severity:** Medium-high  
**Value:** Prevents agents from reading broad runbooks or following rollout leftovers before packet-first execution.

**Goal:** Update the dashboard prompt so it clearly starts with `phase-release-orchestration-state { phaseKey }`, avoids rollout leftovers, and defers broad runbooks until packet refs require them.

**Blocked by:** P131-T001, P131-T003, P131-T005, P131-T006.

**Blocks:** None.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/phase-complete-release-prompt.ts`
- dashboard prompt tests
- docs/snippets if prompt snapshots exist

**Implementation steps:**

1. Remove rollout-specific leftovers such as Phase 1 plan review warning text.
2. Remove or move rollback implementation instructions into maintainer docs.
3. Make first command explicit and include phase key:
   - `pnpm exec wk run phase-release-orchestration-state '{"phaseKey":"<N>"}'`
4. Add instruction:
   - do not open broad playbooks before running the packet command unless the packet command is unavailable.
5. Reduce attached authority list if possible.
6. Make prompt follow packet refs:
   - orchestration packet;
   - draft worker packets;
   - assignment packets;
   - reconciliation preflight;
   - drain delta;
   - phase release state;
   - final closeout result.
7. Update tests for prompt content and absence of rollout leftovers.

**Acceptance criteria:**

- Prompt is shorter and packet-first.
- Prompt includes explicit phaseKey in first command.
- Prompt does not tell agents to inspect broad runbooks before packet command.
- Rollout/rollback implementation noise is removed.
- Tests assert the prompt includes packet flow and excludes old leftover text.

**Validation commands:**

```bash
pnpm run ext:compile
node --test extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs
pnpm run test
```

---

## P131-T009 — Expand `release-closeout-result` into a complete post-release evidence packet

**Priority:** P2  
**Severity:** Medium-high  
**Value:** Reduces final-report discovery and ensures final release summaries contain concrete evidence.

**Goal:** Make `release-closeout-result` include concrete post-release evidence rather than only a markdown report derived from release notes/follow-up summary.

**Blocked by:** P131-T007.

**Blocks:** None.

**Owned paths:**

- `src/modules/task-engine/release-closeout-result-runtime.ts`
- `src/modules/task-engine/commands/phase-delivery-readout-commands.ts`
- `src/modules/task-engine/instructions/release-closeout-result.md`
- `.ai/agent-cli-snippets/by-command/release-closeout-result.json`
- tests for release closeout result

**Implementation steps:**

1. Extend inputs or derivation to include:
   - main merge PR;
   - release branch;
   - final commit SHA;
   - tag;
   - package name/version;
   - npm publish/dist-tag status;
   - GitHub Actions/watch result;
   - release evidence manifest path;
   - workspace phase result;
   - remaining follow-ups.
2. Preserve placeholder-free final report behavior.
3. Add structured `finalEvidence` field separate from final markdown.
4. If fields are missing, return precise missing evidence refs.
5. Add tests for complete packet, missing PR/tag/publish evidence, and placeholder refusal.

**Acceptance criteria:**

- Final response can be generated from `release-closeout-result` without broad rediscovery.
- Packet includes concrete PR/tag/package/workspace evidence when available.
- Missing final evidence is explicit.
- Existing final markdown behavior remains compatible.

**Validation commands:**

```bash
pnpm run build
pnpm run test
pnpm exec wk run release-closeout-result '{"phaseKey":"131","releaseVersion":"0.0.0-test","releaseNotes":{"source":"test","entries":["test"]},"followUpSummary":{"count":0,"scannedAt":"2026-06-03","rationale":"test"}}'
```

---

## P131-T010 — Add Phase 131 packet-flow regression simulation

**Priority:** P2  
**Severity:** Medium  
**Value:** Proves the flow reduces discovery/context and prevents regressions.

**Goal:** Add a simulation/test artifact that exercises the packet-first flow from dashboard launch through worker packet creation and release-state readiness.

**Blocked by:** P131-T003, P131-T007, P131-T008.

**Blocks:** None.

**Owned paths:**

- `artifacts/phase-131-packet-flow-simulation.md`
- test fixtures for task/assignment packet flow
- command tests or snapshot tests

**Implementation steps:**

1. Create a synthetic phase with:
   - empty phase case;
   - completed-only case;
   - active work with two ready tasks;
   - requested/canonical phase mismatch;
   - assignment handoff ready to reconcile.
2. Capture expected command sequence:
   - `phase-release-orchestration-state`
   - draft `agent-execution-packet`
   - `register-assignment`
   - locked `agent-execution-packet`
   - `assignment-reconciliation-preflight`
   - `phase-drain-delta`
   - `phase-release-state`
3. Document expected context savings vs old broad discovery path.
4. Add snapshot or assertion tests where practical.

**Acceptance criteria:**

- Simulation proves packet-first flow is usable without broad `list-tasks` discovery.
- Mismatch and fallback cases are documented.
- The artifact gives future agents a concise reference for how Phase 131 should work.

**Validation commands:**

```bash
pnpm run build
pnpm run test
```

---

## 4. Dependency map

```text
P131-T001
  ├─→ P131-T002
  │     ├─→ P131-T003
  │     │     └─→ P131-T008
  │     ├─→ P131-T004
  │     │     └─→ P131-T005
  │     │           └─→ P131-T008
  │     └─→ P131-T006
  │           └─→ P131-T003
  │           └─→ P131-T008
  └─→ P131-T007
        └─→ P131-T009

P131-T003 + P131-T007 + P131-T008
  └─→ P131-T010
```

## 5. Recommended implementation order

1. P131-T001 — explicit phaseKey correctness.
2. P131-T002 — task-first draft packet.
3. P131-T006 — model-tier recommendation.
4. P131-T004 — derived path boundaries.
5. P131-T003 — actionable ready-work refs in orchestration state.
6. P131-T005 — CAE guidance cards/refs in packets.
7. P131-T008 — prompt cleanup.
8. P131-T007 — true phase-release-state.
9. P131-T009 — complete release-closeout-result.
10. P131-T010 — simulation/regression evidence.

## 6. Parallelization guidance

After P131-T001 and P131-T002 land, the following can run in parallel:

- P131-T004 path boundary derivation;
- P131-T006 model-tier recommendation;
- P131-T007 phase-release-state.

P131-T003 should wait for draft packets and model-tier recommendation so ready-work refs are actually useful.

P131-T005 should wait for path/model packet fields so CAE guidance can use real packet signals.

P131-T008 should happen late enough to point to stable fields and command shapes.

## 7. Task-engine creation commands

The current connector cannot execute `wk run create-task` directly. These are the exact commands to create the Phase 131 tasks in the task engine from a local checkout after this file lands.

> Replace `expectedPlanningGeneration` if your workspace requires it.

```bash
pnpm exec wk run create-task '{"title":"P131-T001 — Honor requested phaseKey in packet-first phase commands","type":"execution","status":"ready","priority":"P0","phaseKey":"131","phase":"Phase 131","summary":"Make phase-release-orchestration-state and phase-drain-delta honor explicit args.phaseKey while reporting canonical phase mismatch safely.","acceptanceCriteria":["phase-release-orchestration-state scopes to explicit phaseKey when provided","phase-drain-delta uses the same operational phase key","phaseSelection metadata reports requested/canonical/operational phase","requested/canonical mismatch does not silently operate on the wrong phase","tests cover explicit, fallback, match, mismatch, and cursor mismatch cases"],"technicalScope":["src/modules/task-engine/commands/phase-delivery-readout-commands.ts","src/modules/task-engine/phase-release-orchestration-state-runtime.ts","src/modules/task-engine/instructions/phase-release-orchestration-state.md","src/modules/task-engine/instructions/phase-drain-delta.md"],"metadata":{"ownedPaths":["src/modules/task-engine/commands/phase-delivery-readout-commands.ts","src/modules/task-engine/phase-release-orchestration-state-runtime.ts","src/modules/task-engine/instructions/phase-release-orchestration-state.md","src/modules/task-engine/instructions/phase-drain-delta.md"],"validationCommands":[{"command":"pnpm run build","rationale":"compile check"},{"command":"pnpm run test","rationale":"regression suite"}]}}'

pnpm exec wk run create-task '{"title":"P131-T002 — Add task-first draft mode to agent-execution-packet","type":"execution","status":"ready","priority":"P0","phaseKey":"131","phase":"Phase 131","summary":"Allow agent-execution-packet to generate a read-only draft packet from taskId before Team Assignment registration.","dependsOn":["P131-T001"],"acceptanceCriteria":["agent-execution-packet supports taskId + phaseKey + mode draft","draft packet returns assignment metadata draft and register-assignment command template","assignmentId mode remains backward compatible","draft packet is clearly unlocked/read-only","tests cover draft, assignment, and invalid mixed args"],"technicalScope":["src/modules/team-execution/index.ts","src/modules/team-execution/agent-execution-packet.ts","src/contracts/team-execution-assignment-metadata.v1.ts","schemas/agent-orchestration/assignment-metadata.v1.json","src/modules/team-execution/instructions/agent-execution-packet.md"],"metadata":{"ownedPaths":["src/modules/team-execution/index.ts","src/modules/team-execution/agent-execution-packet.ts","src/contracts/team-execution-assignment-metadata.v1.ts","schemas/agent-orchestration/assignment-metadata.v1.json","src/modules/team-execution/instructions/agent-execution-packet.md"],"validationCommands":[{"command":"pnpm run build"},{"command":"pnpm run test"}]}}'

pnpm exec wk run create-task '{"title":"P131-T003 — Add ready-work packet refs to phase-release-orchestration-state","type":"execution","status":"ready","priority":"P0","phaseKey":"131","phase":"Phase 131","summary":"Make phase-release-orchestration-state return actionable readyWorkTop entries with draft packet and assignment registration refs.","dependsOn":["P131-T001","P131-T002"],"acceptanceCriteria":["active phase packet includes readyWorkTop","readyWorkTop includes draftPacketRef and registerAssignmentRef","output remains bounded with overflow refs","agent can start ready workers without broad list-tasks discovery","tests cover active phase with multiple ready tasks"],"technicalScope":["src/modules/task-engine/phase-release-orchestration-state-runtime.ts","src/modules/task-engine/commands/phase-delivery-readout-commands.ts","src/modules/task-engine/instructions/phase-release-orchestration-state.md",".ai/agent-cli-snippets/by-command/phase-release-orchestration-state.json"],"metadata":{"ownedPaths":["src/modules/task-engine/phase-release-orchestration-state-runtime.ts","src/modules/task-engine/commands/phase-delivery-readout-commands.ts","src/modules/task-engine/instructions/phase-release-orchestration-state.md",".ai/agent-cli-snippets/by-command/phase-release-orchestration-state.json"],"validationCommands":[{"command":"pnpm run build"},{"command":"pnpm run test"}]}}'

pnpm exec wk run create-task '{"title":"P131-T004 — Derive path boundary recommendations for draft packets","type":"execution","status":"ready","priority":"P1","phaseKey":"131","phase":"Phase 131","summary":"Generate explicit and derived owned/read-only/forbidden path recommendations for task-first draft packets with confidence labels.","dependsOn":["P131-T002"],"acceptanceCriteria":["draft packets include explicit and derived path recommendations","confidence is reported","low-confidence derived paths do not silently authorize edits","assignment packets preserve explicit assignment boundaries","tests cover explicit metadata, technicalScope, no-path fallback, and forbidden paths"],"technicalScope":["src/modules/team-execution/agent-execution-packet.ts","src/modules/team-execution/index.ts","src/modules/team-execution/instructions/agent-execution-packet.md"],"metadata":{"ownedPaths":["src/modules/team-execution/agent-execution-packet.ts","src/modules/team-execution/index.ts","src/modules/team-execution/instructions/agent-execution-packet.md"],"validationCommands":[{"command":"pnpm run build"},{"command":"pnpm run test"}]}}'

pnpm exec wk run create-task '{"title":"P131-T005 — Use CAE to select compact packet guidance refs and cards","type":"execution","status":"ready","priority":"P1","phaseKey":"131","phase":"Phase 131","summary":"Use CAE as an advisory guidance selector for packet instruction refs and compact think/do/review cards without moving lifecycle authority into CAE.","dependsOn":["P131-T002","P131-T004"],"acceptanceCriteria":["packets include bounded guidance cards or refs","CAE output is advisory and cannot override task/assignment/release authority","fallback static refs work when CAE is unavailable","agents receive refs instead of full runbook text","tests cover CAE available, unavailable, and bounded output"],"technicalScope":["src/modules/team-execution/agent-execution-packet.ts","src/modules/context-activation/","src/modules/team-execution/instructions/agent-execution-packet.md"],"metadata":{"ownedPaths":["src/modules/team-execution/agent-execution-packet.ts","src/modules/context-activation/","src/modules/team-execution/instructions/agent-execution-packet.md"],"validationCommands":[{"command":"pnpm run build"},{"command":"pnpm run test"}]}}'

pnpm exec wk run create-task '{"title":"P131-T006 — Add deterministic model-tier recommendation","type":"execution","status":"ready","priority":"P1","phaseKey":"131","phase":"Phase 131","summary":"Classify draft and assignment packets into cheap/balanced/high_reasoning/specialist model tiers with rationale and escalation triggers.","dependsOn":["P131-T002"],"acceptanceCriteria":["packets always include model-tier recommendation","recommendation is deterministic and explainable","explicit assignment model tier remains visible if different","tests cover docs-only, normal implementation, schema/persistence, release blocker, and low-confidence scope"],"technicalScope":["src/modules/team-execution/agent-execution-packet.ts","src/contracts/team-execution-assignment-metadata.v1.ts","schemas/agent-orchestration/assignment-metadata.v1.json"],"metadata":{"ownedPaths":["src/modules/team-execution/agent-execution-packet.ts","src/contracts/team-execution-assignment-metadata.v1.ts","schemas/agent-orchestration/assignment-metadata.v1.json"],"validationCommands":[{"command":"pnpm run build"},{"command":"pnpm run test"}]}}'

pnpm exec wk run create-task '{"title":"P131-T007 — Add true phase-release-state pre-release packet","type":"execution","status":"ready","priority":"P1","phaseKey":"131","phase":"Phase 131","summary":"Add phase-release-state as the compact pre-release readiness packet distinct from final release-closeout-result.","dependsOn":["P131-T001"],"acceptanceCriteria":["phase-release-state command exists","packet summarizes branch, evidence, version, changelog, schema mirror, release manifest, and publish safety","completed-only phase can proceed from packet without broad file discovery","missing release requirements are compact and explicit","tests cover ready, missing artifacts, version mismatch, and publish blocked"],"technicalScope":["src/modules/task-engine/commands/phase-delivery-readout-commands.ts","src/modules/task-engine/phase-release-state-runtime.ts","src/modules/task-engine/instructions/phase-release-state.md","src/contracts/builtin-run-command-manifest.json",".ai/agent-cli-snippets/by-command/phase-release-state.json"],"metadata":{"ownedPaths":["src/modules/task-engine/commands/phase-delivery-readout-commands.ts","src/modules/task-engine/phase-release-state-runtime.ts","src/modules/task-engine/instructions/phase-release-state.md","src/contracts/builtin-run-command-manifest.json",".ai/agent-cli-snippets/by-command/phase-release-state.json"],"validationCommands":[{"command":"pnpm run build"},{"command":"pnpm run test"}]}}'

pnpm exec wk run create-task '{"title":"P131-T008 — Clean and tighten dashboard Complete & Release prompt","type":"execution","status":"ready","priority":"P1","phaseKey":"131","phase":"Phase 131","summary":"Remove rollout leftovers and make the dashboard Complete & Release prompt explicitly packet-first with phaseKey and no broad playbook reading before the packet command.","dependsOn":["P131-T001","P131-T003","P131-T005","P131-T006"],"acceptanceCriteria":["prompt starts with phase-release-orchestration-state using explicit phaseKey","prompt tells agents not to open broad playbooks before packet command unless unavailable","rollout/review/rollback leftovers are removed or moved to maintainer docs","prompt follows packet/verdict outputs","tests assert included and excluded prompt text"],"technicalScope":["extensions/cursor-workflow-cannon/src/phase-complete-release-prompt.ts","extensions/cursor-workflow-cannon/test/"],"metadata":{"ownedPaths":["extensions/cursor-workflow-cannon/src/phase-complete-release-prompt.ts","extensions/cursor-workflow-cannon/test/"],"validationCommands":[{"command":"pnpm run ext:compile"},{"command":"pnpm run test"}]}}'

pnpm exec wk run create-task '{"title":"P131-T009 — Expand release-closeout-result into complete post-release evidence packet","type":"execution","status":"ready","priority":"P2","phaseKey":"131","phase":"Phase 131","summary":"Make release-closeout-result include concrete PR/tag/package/CI/workspace evidence so final summaries do not require broad rediscovery.","dependsOn":["P131-T007"],"acceptanceCriteria":["release-closeout-result includes main merge PR, tag, package/version, publish status, CI/watch status, workspace phase result, and release evidence refs when available","missing final evidence is explicit","final markdown remains placeholder-free","tests cover complete and missing-evidence packets"],"technicalScope":["src/modules/task-engine/release-closeout-result-runtime.ts","src/modules/task-engine/commands/phase-delivery-readout-commands.ts","src/modules/task-engine/instructions/release-closeout-result.md",".ai/agent-cli-snippets/by-command/release-closeout-result.json"],"metadata":{"ownedPaths":["src/modules/task-engine/release-closeout-result-runtime.ts","src/modules/task-engine/commands/phase-delivery-readout-commands.ts","src/modules/task-engine/instructions/release-closeout-result.md",".ai/agent-cli-snippets/by-command/release-closeout-result.json"],"validationCommands":[{"command":"pnpm run build"},{"command":"pnpm run test"}]}}'

pnpm exec wk run create-task '{"title":"P131-T010 — Add Phase 131 packet-flow regression simulation","type":"execution","status":"ready","priority":"P2","phaseKey":"131","phase":"Phase 131","summary":"Add simulation/regression evidence proving packet-first flow works from dashboard launch through worker packet creation, reconciliation, delta refresh, and release-state readiness.","dependsOn":["P131-T003","P131-T007","P131-T008"],"acceptanceCriteria":["simulation covers empty, completed-only, active-work, phase mismatch, and assignment reconcile cases","expected command sequence is documented","context savings vs old broad discovery path are documented","snapshot/assertion tests are added where practical"],"technicalScope":["artifacts/phase-131-packet-flow-simulation.md","test/","extensions/cursor-workflow-cannon/test/"],"metadata":{"ownedPaths":["artifacts/phase-131-packet-flow-simulation.md","test/","extensions/cursor-workflow-cannon/test/"],"validationCommands":[{"command":"pnpm run build"},{"command":"pnpm run test"}]}}'
```

## 8. Done criteria for Phase 131

Phase 131 is done when:

- dashboard-launched Complete & Release can operate on an explicit target phase safely;
- active ready work can proceed from `readyWorkTop` to draft packet to assignment registration to locked worker packet;
- packets provide useful derived boundaries and model tier recommendations;
- CAE provides compact guidance refs/cards without owning lifecycle authority;
- closeout uses `phase-release-state` before release execution;
- final release reporting can use `release-closeout-result` without broad rediscovery;
- prompt is clean, packet-first, and free of rollout leftovers;
- tests/simulation prove the packet-first flow reduces context compared with broad discovery.
