# MEMORY_PLAN — Workflow Cannon Memory Layer

**Status:** Proposed planner-ready implementation plan  
**Purpose:** Add a governed memory layer that helps Workflow Cannon remember lessons, troubleshooting patterns, persona confusion, release gotchas, and context-selection hints without replacing canonical task, assignment, release, or git state.  
**Recommended phase:** Phase 133  
**Primary outcome:** Workflow Cannon gains a reusable learning layer that improves CAE guidance, packet relevance, user simulation, The Wolf troubleshooting, and model/context selection while preserving deterministic source-of-truth boundaries.

## 1. Product thesis

Workflow Cannon already has **state**. It does not yet have **experience**.

Workflow Cannon is good at knowing:

```text
current task state
current phase state
current assignment state
current PlanArtifact state
current release evidence
current policy requirements
current packet contents
current git/package state
```

Memory adds the ability to recall:

```text
what went wrong before
what agents misunderstood before
what context helped solve similar tasks
what user personas found confusing
what release gotchas recur
what troubleshooting episodes The Wolf should know about
what model tier was sufficient for similar work
```

Memory must be **advisory**, not authoritative.

## 2. Core rule

Memory must never become another task store.

Do **not** use memory for:

```text
task status
phase status
assignment status
release readiness
publish safety
policy approval
current package version
current git branch
PlanArtifact approval
handoff completion
```

Those remain canonical in:

```text
Task Engine
Team Execution
PlanArtifact
Release Evidence
Git / package files
Policy approval system
```

Use memory for:

```text
lessons learned
troubleshooting episodes
user/persona confusion patterns
context-selection hints
release gotchas
model-routing evidence
historical fix patterns
```

## 3. Architecture

Target shape:

```text
Workflow Cannon Core
  Task Engine
  Team Execution
  PlanArtifact
  Release Evidence
  Git State

Context Layer
  CAE
  Packet Builders
  Model Tier Classifier
  Path Boundary Classifier

Memory Layer
  WorkflowMemory interface
  MemoryRecallService
  MemoryWriteProposalService
  MemoryGovernance

Backends
  Local SQLite backend
  Optional Mem0 backend
  Future graph backend if needed

Access Layer
  CLI
  MCP
  Dashboard
  User Simulation Harness
```

Only these areas should call memory directly:

```text
CAE
agent-execution-packet builder
phase-release-state builder
The Wolf troubleshooting packet
user simulation harness
memory management commands
MCP memory tools/resources
```

Everything else should consume memory indirectly through CAE or packets.

## 4. Initial backend strategy

Start with a local-first Workflow Cannon memory adapter and SQLite backend.

Rationale:

- auditable;
- deterministic;
- easy to test;
- fits existing Workflow Cannon local workspace model;
- avoids binding the architecture to a single third-party memory product;
- can later support Mem0 or a graph backend behind the same interface.

Optional later backend:

```text
Mem0 for agent-style semantic memory and easier long-term recall.
Zep/Graphiti or another graph memory backend if temporal relationship memory becomes important.
```

## 5. Memory types

Initial memory taxonomy:

```text
lesson
troubleshooting_episode
persona_confusion
context_selection_hint
release_gotcha
model_routing_observation
workflow_antipattern
```

### `lesson`

A general learned rule.

Example:

```text
Agents should run phase-release-orchestration-state with explicit phaseKey before opening broad runbooks.
```

### `troubleshooting_episode`

A symptom/root-cause/fix episode.

Example:

```text
Symptom: dashboard-summary repeatedly failed with extension-refresh-paused.
Root cause: behavior-rule sync rewrote generated rule file too often.
Fix: make sync idempotent and narrow triggers.
```

### `persona_confusion`

A user simulation or real-user confusion pattern.

Example:

```text
PM persona confused “blocked” with “failed.” Prefer “needs a decision” when addressing non-technical users.
```

### `context_selection_hint`

A hint for CAE/packet builders.

Example:

```text
For dashboard prompt cleanup tasks, include prompt snapshot tests and do not include full release runbook unless release behavior changes.
```

### `release_gotcha`

A recurring release issue.

Example:

```text
Package version mirrors can drift from package.json during release artifact preparation.
```

### `model_routing_observation`

Evidence about which tier was enough or insufficient.

Example:

```text
Docs-only command snippet updates are usually cheap_fast unless schema generation fails.
```

### `workflow_antipattern`

Repeated behavior that wastes tokens or causes bad state.

Example:

```text
Broad list-tasks after every assignment reconciliation causes unnecessary context reload.
```

## 6. Memory governance

Agents should not freely write permanent memory.

Memory write flow:

```text
agent/harness/user proposes memory
  -> memory proposal stored
  -> proposal reviewed or auto-approved by trusted rule
  -> approved memory becomes recallable
```

Every memory item should include:

```json
{
  "memoryId": "mem_...",
  "type": "lesson",
  "summary": "...",
  "scope": "workflow-cannon",
  "sourceRefs": ["task:T...", "artifact:..."],
  "createdBy": "agent|human|harness|system",
  "confidence": "low|medium|high",
  "freshness": "current|possibly_stale|historic",
  "reviewStatus": "proposed|approved|rejected",
  "canonicalRefs": [],
  "notAuthoritativeFor": ["task_status", "release_safety", "policy_approval"]
}
```

## 7. Memory recall flow

CAE and packet builders should call memory through a bounded query shape.

Example recall query:

```json
{
  "intent": "packet_guidance",
  "scope": "workflow-cannon",
  "taskType": "execution",
  "commandName": "agent-execution-packet",
  "pathHints": ["extensions/cursor-workflow-cannon/src/phase-complete-release-prompt.ts"],
  "maxItems": 3,
  "maxTokens": 600
}
```

Memory results must be compact and cite source refs.

Example result:

```json
{
  "items": [
    {
      "memoryId": "mem_123",
      "type": "context_selection_hint",
      "summary": "Prompt cleanup tasks should include prompt snapshot tests and avoid full release runbook context unless release mechanics change.",
      "sourceRefs": ["artifact:PHASE_131.md"],
      "confidence": "high",
      "freshness": "current",
      "notAuthoritativeFor": ["task_status", "release_safety"]
    }
  ]
}
```

## 8. Integration points

### CAE

CAE should be the primary selector.

Flow:

```text
Packet builder asks CAE for guidance.
CAE recalls relevant memories.
CAE emits compact guidance cards and refs.
Packet includes selected guidance.
```

### `agent-execution-packet`

Include `memoryHints` or CAE-selected guidance:

```json
{
  "memoryHints": [
    {
      "summary": "Similar tasks often require prompt snapshot tests.",
      "sourceRef": "memory:mem_123",
      "confidence": "high"
    }
  ]
}
```

### `phase-release-state`

Recall release gotchas, but only as warnings. Never let memory decide publish safety.

### The Wolf

Use memory for similar troubleshooting episodes, prior root causes, false fixes, and suggested inspection paths.

### User Simulation Harness

Harness can propose memories from repeated user confusion or failed scenarios.

### MCP

Expose memory recall as read-only MCP tools/resources after MCP server exists.

## 9. Planner-ready task breakdown

---

## P133-T001 — Define memory taxonomy and governance

**Priority:** P0  
**Goal:** Define what Workflow Cannon memory is allowed to store, what it cannot store, and how memory write proposals are governed.

**Blocked by:** None.  
**Blocks:** P133-T002, P133-T004, P133-T005.

**Owned paths:**

- `MEMORY_PLAN.md`
- `src/modules/memory/README.md`
- `src/modules/memory/instructions/`
- `docs/maintainers/memory.md`

**Implementation steps:**

1. Create memory module documentation.
2. Define memory taxonomy.
3. Define authoritative vs advisory boundaries.
4. Define memory write proposal lifecycle.
5. Define allowed and forbidden memory use.
6. Add maintainer docs.

**Acceptance criteria:**

- Documentation clearly says memory is advisory, not canonical.
- Memory types and governance are defined.
- Forbidden memory uses are explicit.

---

## P133-T002 — Add WorkflowMemory interface and contracts

**Priority:** P0  
**Goal:** Add a narrow memory adapter interface so memory does not become spaghetti code.

**Blocked by:** P133-T001.  
**Blocks:** P133-T003, P133-T004, P133-T005, P133-T006.

**Owned paths:**

- `src/modules/memory/`
- `src/contracts/memory/`
- `schemas/memory/`
- memory contract tests

**Implementation steps:**

1. Add `WorkflowMemory` interface with recall, propose, approve, reject, and list proposal operations.
2. Add TypeScript types for recall query, recall result, proposed memory, approved memory, and governance status.
3. Add JSON schemas if project convention requires.
4. Add contract tests.

**Acceptance criteria:**

- Memory has a single adapter interface.
- Memory results include source refs, confidence, freshness, and non-authoritative markers.
- No other module depends on backend-specific memory code.

---

## P133-T003 — Add local SQLite memory backend

**Priority:** P0  
**Goal:** Implement local auditable memory storage using Workflow Cannon's local-first model.

**Blocked by:** P133-T002.  
**Blocks:** P133-T004, P133-T005, P133-T006, P133-T007.

**Owned paths:**

- `src/modules/memory/local-sqlite-memory.ts`
- `src/modules/memory/memory-store.ts`
- `src/modules/memory/migrations/` if needed
- memory backend tests

**Implementation steps:**

1. Add local memory table/schema.
2. Store proposed and approved memories.
3. Support recall by type, intent, scope, path hints, source refs, and text query.
4. Start with keyword/hybrid matching if embeddings are not available.
5. Keep output bounded.
6. Add tests for propose, approve, reject, recall, and stale/missing memory.

**Acceptance criteria:**

- Local backend works without external service.
- Approved memories are recallable.
- Proposed memories are not used by default unless explicitly requested.
- Recall output is bounded.

---

## P133-T004 — Add memory proposal and review commands

**Priority:** P1  
**Goal:** Expose governed memory writes through Workflow Cannon commands.

**Blocked by:** P133-T002, P133-T003.  
**Blocks:** P133-T007, P133-T008.

**Owned paths:**

- `src/modules/memory/index.ts`
- `src/modules/memory/instructions/`
- `src/contracts/builtin-run-command-manifest.json`
- `.ai/agent-cli-snippets/by-command/`
- command tests

**Commands:**

- `propose-memory`
- `review-memory-proposal`
- `list-memory-proposals`
- `recall-memory`

**Implementation steps:**

1. Add read-only `recall-memory`.
2. Add `propose-memory` for agents/harnesses.
3. Add `review-memory-proposal` for approve/reject.
4. Add `list-memory-proposals`.
5. Add instructions and snippets.
6. Add policy gates if approval mutates trusted memory.

**Acceptance criteria:**

- Agents can propose memory but not silently approve permanent memory.
- Approved memories can be recalled.
- Rejected memories are not recalled by default.

---

## P133-T005 — Integrate memory recall into CAE

**Priority:** P1  
**Goal:** Let CAE use memory as advisory evidence when selecting guidance cards and refs.

**Blocked by:** P133-T002, P133-T003.  
**Blocks:** P133-T006, P133-T007.

**Owned paths:**

- `src/modules/context-activation/`
- `src/modules/memory/`
- CAE tests

**Implementation steps:**

1. Add optional memory recall to CAE guidance selection.
2. Use bounded recall queries.
3. Include selected memories as short guidance hints with source refs.
4. Ensure CAE can run without memory backend.
5. Ensure memory cannot override lifecycle/policy verdicts.

**Acceptance criteria:**

- CAE can include memory-backed guidance cards.
- Memory guidance is clearly advisory.
- CAE output remains bounded.

---

## P133-T006 — Add memory hints to packet builders

**Priority:** P1  
**Goal:** Include CAE-selected memory hints in `agent-execution-packet` and `phase-release-state`.

**Blocked by:** P133-T005.  
**Blocks:** P133-T007.

**Owned paths:**

- `src/modules/team-execution/agent-execution-packet.ts`
- `src/modules/task-engine/phase-release-state-runtime.ts`
- packet tests

**Implementation steps:**

1. Add optional `memoryHints` field or include memory under packet guidance.
2. Use CAE as the selector.
3. Keep max item/token budget small.
4. Include source refs and confidence.
5. Add tests for memory present, memory absent, and memory backend unavailable.

**Acceptance criteria:**

- Packets can include useful memory hints without bloating context.
- Memory hints never claim current state authority.

---

## P133-T007 — Add The Wolf troubleshooting memory recall

**Priority:** P1  
**Goal:** Give The Wolf relevant prior root-cause/fix episodes when assigned hard troubleshooting work.

**Blocked by:** P133-T006.  
**Blocks:** None.

**Owned paths:**

- agent definition docs for The Wolf
- `src/modules/team-execution/agent-execution-packet.ts`
- memory tests/fixtures

**Implementation steps:**

1. Detect specialist/troubleshooting assignments.
2. Query memory for similar troubleshooting episodes.
3. Include compact episode summaries in packet guidance.
4. Include source refs and confidence.
5. Add tests for relevant recall and no-recall cases.

**Acceptance criteria:**

- The Wolf receives useful prior troubleshooting episodes.
- Routine workers do not receive expensive troubleshooting memory unless relevant.

---

## P133-T008 — Add user simulation memory proposals

**Priority:** P2  
**Goal:** Let the user simulation harness propose memories from repeated user confusion or workflow failures.

**Blocked by:** P133-T004 and Phase 132 user simulation harness.  
**Blocks:** None.

**Owned paths:**

- `test/harness/user-simulation/`
- `src/modules/memory/`
- harness report code

**Implementation steps:**

1. Map UX/state/efficiency findings into proposed memories.
2. Generate proposed `persona_confusion`, `workflow_antipattern`, and `context_selection_hint` memories.
3. Keep memory writes dry-run/proposed by default.
4. Add report examples.

**Acceptance criteria:**

- Harness can propose memories from repeated findings.
- Proposed memories include persona/scenario/source refs.
- No permanent memory write happens without review.

---

## 10. Dependency map

```text
P133-T001
  -> P133-T002
      -> P133-T003
          -> P133-T004
          -> P133-T005
              -> P133-T006
                  -> P133-T007
          -> P133-T008
```

## 11. Planner creation guidance

Use this file as the brainstorm/source artifact for the planner. The planner should produce a PlanArtifact with:

- phase key: `133`
- title: `Workflow Cannon Memory Layer`
- objective: add governed advisory memory to improve CAE, packets, The Wolf, and user simulation without replacing canonical state;
- WBS rows matching P133-T001 through P133-T008;
- dependencies matching the dependency map;
- acceptance criteria copied from each task;
- explicit non-goals preventing memory from becoming canonical task/release state.

Recommended planner prompt:

```text
Create a PlanArtifact for Phase 133 using MEMORY_PLAN.md. Preserve the canonical/advisory boundary, the memory governance model, and the task breakdown P133-T001 through P133-T008. The output should be ready for review-plan-artifact, accept-plan-artifact, and finalize-plan-to-phase.
```

## 12. Done criteria

Phase 133 is done when:

- memory taxonomy and governance are documented;
- WorkflowMemory interface exists;
- local SQLite memory backend works;
- memory proposal/review/recall commands exist;
- CAE can recall advisory memory;
- packets can include bounded memory hints;
- The Wolf can receive relevant troubleshooting memories;
- user simulation harness can propose memories from repeated findings;
- no canonical task, assignment, release, policy, or git truth moved into memory.
