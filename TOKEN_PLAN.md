# Token Reduction Implementation Plan

**Status:** Proposed 3-phase release plan  
**Goal:** Reduce AI token/credit usage while improving task clarity, orchestration quality, and release safety.  
**Strategy:** Apply packet-first orchestration, progressive disclosure, references-over-content, delta refresh, and structured verdicts across Workflow Cannon.

## 1. Problem

Workflow Cannon currently asks agents to succeed by reading prompts, attached runbooks, broad task state, dashboard summaries, handoffs, logs, diffs, and release files. This works, but it spends too many tokens because agents repeatedly rediscover Workflow Cannon's operating model.

The desired shift is:

```text
read everything -> infer what matters -> act
```

to:

```text
receive the right packet -> act inside clear bounds -> expand only when needed
```

## 2. Patterns to apply

### Pattern A — Context packets

Create purpose-built packets that give an agent exactly the context it needs for the current stage.

Primary packets:

- `phase-release-orchestration-state`
- `agent-execution-packet`
- `phase-release-state`
- later: `phase-drain-plan`, `release-closeout-result`

### Pattern B — Progressive disclosure

Do not provide all runbooks and all release/task procedures upfront. First classify the phase, then provide only the next needed context.

### Pattern C — References over content

Packets should include runbook, schema, command, file, and evidence references instead of embedding full text by default.

### Pattern D — Delta refresh

After the first snapshot, return only what changed since the last known generation/cursor.

### Pattern E — Structured verdicts

Use deterministic preflight/verdict commands so agents do not inspect raw logs, diffs, and handoffs unless a check fails or risk is present.

## 3. Three-phase release plan

The plan prioritizes the highest token savings first while keeping each release independently valuable.

---

# Phase 1 — High-savings orchestration and worker packets

**Theme:** Stop agents from discovering the phase and task scope manually.  
**Primary savings target:** Orchestrator startup and subagent worker prompts.  
**Expected impact:** Highest immediate token reduction.

## Phase 1 deliverables

### 1. Add `phase-release-orchestration-state`

**Purpose:** Replace the initial broad read/classification loop for Complete & Release.

This command should return a compact phase classification packet:

- phase key;
- workspace current/next phase;
- integration branch;
- task counts;
- completed task count;
- non-terminal task count;
- ready unblocked task summaries;
- blocked task summaries;
- proposed/wishlist/research counts;
- path classification;
- next action;
- packet refs for next stage;
- relevant runbook refs, not full runbook text.

Supported paths:

- `empty`;
- `completed-only`;
- `active-work`;
- `blocked-needs-decision`;
- `release-ready`;
- `release-blocked`.

**Acceptance criteria:**

- A dashboard-launched Complete & Release agent can run one command and know which path applies.
- Empty phase returns a stop recommendation.
- Completed-only phase returns a closeout/release recommendation.
- Active phase returns ready unblocked tasks and blocked decision points.
- Output is bounded and does not include full task histories or full runbook text.

### 2. Add `agent-execution-packet`

**Purpose:** Give subagents bounded task context so workers do not rediscover Workflow Cannon or reread broad runbooks.

Each packet should include:

- task id;
- phase key;
- assignment intent;
- task title and summary;
- acceptance criteria;
- owned paths;
- read-only paths;
- forbidden paths;
- base branch;
- suggested worker branch;
- validation commands;
- model tier recommendation;
- runbook references;
- handoff contract;
- stop conditions;
- packet digest.

**Acceptance criteria:**

- A worker can start from the packet without reading the full task queue.
- A worker can identify owned and forbidden paths.
- A worker receives validation and handoff requirements.
- Packet includes references to runbooks instead of embedding full playbooks.
- Packet can be stored or referenced by Team Assignment metadata.

### 3. Integrate packets with Team Assignments

Add packet metadata to Team Assignment records or assignment creation flow:

- `packetId` or `packetDigest`;
- `modelTier`;
- `ownedPaths`;
- `forbiddenPaths`;
- `handoffContractId`;
- `validationCommands`.

**Acceptance criteria:**

- Registered assignments can point to the packet used to create them.
- The orchestrator can audit which context a worker received.
- Packet digest helps detect stale assignment context.

### 4. Update Complete & Release prompt to be packet-first

The prompt should no longer ask the agent to manually refresh and classify all state from broad commands. It should direct the agent to run `phase-release-orchestration-state` first and follow its packet references.

Keep the prompt limited to:

- role;
- intent;
- dashboard authorization semantics;
- policy reminder;
- first command;
- stop conditions;
- final reporting shape.

**Acceptance criteria:**

- Prompt is shorter than the current version.
- Prompt no longer restates runbook procedures.
- Prompt tells the agent to start with `phase-release-orchestration-state`.
- Prompt instructs workers to use `agent-execution-packet` for ready task assignment.

## Phase 1 release value

Phase 1 attacks the two largest token sinks:

1. orchestrator discovery/classification;
2. repeated worker rediscovery across subagents.

This is the fastest way to reduce credit usage without lowering quality.

## Phase 1 validation

- Simulate Path A: empty phase.
- Simulate Path B: completed-only phase.
- Simulate Path C: active work remains.
- Confirm a worker can execute from `agent-execution-packet` with no broad task list.
- Confirm packet output is bounded.
- Confirm Team Assignment stores packet metadata.

---

# Phase 2 — Deterministic reconciliation and delta refresh

**Theme:** Stop the orchestrator from rereading the world during active phase drain.  
**Primary savings target:** Handoff reconciliation, repeated refreshes, and long-running orchestration loops.  
**Expected impact:** High savings in phases with multiple tasks/subagents.

## Phase 2 deliverables

### 1. Add `assignment-reconciliation-preflight`

**Purpose:** Return a deterministic verdict for worker handoffs so the orchestrator does not have to inspect full diffs, logs, and prose handoffs by default.

Checks should include:

- handoff present;
- required fields present;
- acceptance criteria addressed;
- changed files are within owned paths;
- forbidden paths untouched;
- required validation commands present;
- PR exists and targets the phase branch;
- policyApproval requirements satisfied;
- risks/blockers declared.

Verdicts:

- `ready_to_reconcile`;
- `needs_worker_followup`;
- `needs_orchestrator_review`;
- `needs_user_decision`;
- `unsafe`.

**Acceptance criteria:**

- Successful handoff returns `ready_to_reconcile` with compact evidence refs.
- Missing evidence returns a specific follow-up recommendation.
- Forbidden path changes return unsafe or needs-review verdict.
- Orchestrator can reconcile without reading full logs when verdict is clean.

### 2. Add structured handoff enforcement

Make worker handoffs JSON-first and prose-second.

Required fields:

- task id;
- assignment id;
- summary;
- files changed;
- commands run;
- acceptance criteria status;
- PR/ref;
- risks;
- blockers;
- follow-ups.

**Acceptance criteria:**

- Handoff validation is machine-checkable.
- Assignment preflight can operate on handoff data.
- Prose summary remains available but is not the source of truth.

### 3. Add `phase-drain-delta`

**Purpose:** After the first phase packet, return only phase changes since a generation/cursor.

Delta should include:

- changed tasks;
- newly ready tasks;
- completed assignments;
- active assignments;
- still blocked tasks;
- updated phase path;
- next action;
- new cursor/generation.

**Acceptance criteria:**

- Orchestrator can refresh after material changes without calling broad task list.
- Invalid or stale cursor returns a safe full-refresh recommendation.
- Newly ready work is easy to assign from delta output.

### 4. Add assignment/worker activity delta support if needed

If `phase-drain-delta` is not enough, add a focused assignment delta covering:

- assignment status changes;
- worker activity;
- submitted handoffs;
- blocked reports;
- reconcile-needed items.

**Acceptance criteria:**

- Orchestrator can monitor active workers without broad dashboard summary reads.
- Output is bounded and generation-aware.

## Phase 2 release value

Phase 2 reduces the cost of active orchestration. It matters most when a phase has many tasks, parallel subagents, or repeated handoff cycles.

## Phase 2 validation

- Run active-work simulation with at least three ready tasks.
- Confirm orchestrator uses deltas after initial packet.
- Confirm clean handoff reconciliation does not require raw diff/log expansion.
- Confirm unsafe handoff exposes evidence refs and next action.

---

# Phase 3 — Release closeout packets and automation

**Theme:** Stop release closeout from requiring broad file and evidence discovery.  
**Primary savings target:** Changelog/version/schema/release evidence/publish context.  
**Expected impact:** Medium-high savings and higher release safety.

## Phase 3 deliverables

### 1. Add `phase-release-state`

**Purpose:** Give the agent a compact release readiness packet once the phase is drained.

Packet should include:

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

- Agent can determine closeout readiness without reading broad files first.
- Missing release artifacts are explicitly listed.
- Version/mirror problems are summarized compactly.
- Publish safety is represented as a structured field.

### 2. Add `prepare-release-artifacts`

**Purpose:** Deterministically prepare or update release artifacts where safe.

Potential responsibilities:

- changelog stub/update from completed task evidence;
- package version bump;
- packageVersion mirror updates;
- schema mirror updates;
- release evidence manifest seed.

**Acceptance criteria:**

- Command can run in dry-run mode.
- Command reports exact files it would change.
- Command requires policyApproval when appropriate.
- Agent does not need to read full changelog/schema content for routine updates.

### 3. Add `release-closeout-result`

**Purpose:** Return final release state after merge/publish/workspace update.

Should include:

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

- Final response can be generated from this compact packet.
- No placeholders are needed.
- Evidence refs are concrete.

### 4. Update Complete & Release prompt again

After Phase 3, the prompt should reference the full packet chain:

1. `phase-release-orchestration-state`;
2. `agent-execution-packet` for workers;
3. `assignment-reconciliation-preflight` for handoffs;
4. `phase-drain-delta` during active drain;
5. `phase-release-state` for closeout;
6. `release-closeout-result` for final report.

**Acceptance criteria:**

- Prompt remains short.
- Prompt does not restate release mechanics.
- Prompt instructs agent to follow packet/verdict outputs.

## Phase 3 release value

Phase 3 reduces closeout/release token usage and decreases release risk. It is less urgent than worker/orchestrator packets because it happens once per phase, but it is important for publish safety and final evidence quality.

## Phase 3 validation

- Simulate completed-only phase closeout.
- Confirm agent can act from `phase-release-state`.
- Confirm release artifact dry-run shows exact changes.
- Confirm final response can be produced from `release-closeout-result`.

---

## 4. Overall priority and savings ranking

Highest token savings:

1. `agent-execution-packet` — prevents subagent context multiplication.
2. `phase-release-orchestration-state` — prevents orchestrator discovery/classification loops.
3. `assignment-reconciliation-preflight` — prevents raw diff/log/handoff expansion.
4. `phase-drain-delta` — prevents repeated broad refresh during long sessions.
5. `phase-release-state` — prevents broad release closeout discovery.

The first release should include both `phase-release-orchestration-state` and `agent-execution-packet` because they solve different halves of the same problem:

- orchestrator waste;
- worker waste.

## 5. Command sequence after all phases

Desired final flow:

```text
Dashboard Complete & Release
  -> compact prompt
  -> wk run phase-release-orchestration-state
  -> if empty: report stop
  -> if completed-only: wk run phase-release-state
  -> if active: get agent-execution-packet per ready task
  -> register Team Assignments with packet digests
  -> workers execute from packets
  -> wk run assignment-reconciliation-preflight
  -> wk run phase-drain-delta
  -> repeat until drained
  -> wk run phase-release-state
  -> wk run prepare-release-artifacts
  -> release gates
  -> merge/publish
  -> wk run release-closeout-result
  -> final evidence report
```

## 6. Prompt strategy after Phase 1

The dashboard prompt should say less, not more.

Keep:

- role;
- phase key;
- dashboard authorization;
- policy reminder;
- first command;
- ask/stop conditions;
- final report shape.

Remove:

- command-by-command release instructions;
- task delivery procedure;
- branch mechanics;
- validation details;
- handoff schema details;
- full runbook restatement.

The agent should follow packet and verdict outputs.

## 7. Risk controls

- Packets must include enough context to be safe, not just small.
- Every packet needs schema validation.
- Every packet should include a digest so stale context can be detected.
- Dangerous or gated actions must still require JSON policyApproval.
- Raw evidence must remain expandable by reference.
- If a packet cannot classify safely, it should return `needs_user_decision` or `needs_full_refresh`.
- Deltas must fall back to full packets on generation mismatch.

## 8. Success metrics

Track before/after:

- average prompt size for dashboard Complete & Release;
- number of broad task-list reads per phase release;
- number of runbook files read per worker;
- average worker prompt size;
- number of full handoff/diff/log expansions per assignment;
- number of broad state refreshes during phase drain;
- total estimated input/output tokens per phase release;
- model tier used per worker task;
- successful release rate without user intervention.

## 9. Final recommendation

Release in this order:

1. **Phase 1:** packet-first orchestration and worker packets.
2. **Phase 2:** structured reconciliation and delta refresh.
3. **Phase 3:** release closeout packets and deterministic release artifact preparation.

This sequencing ships the largest savings first, then improves long-session efficiency, then optimizes final release closeout.
