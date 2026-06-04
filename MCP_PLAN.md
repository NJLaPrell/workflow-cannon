# MCP_PLAN — Workflow Cannon MCP Server and Shared Command Runtime

**Status:** Proposed planner-ready implementation plan  
**Purpose:** Add a Model Context Protocol (MCP) access layer for Workflow Cannon so agent platforms can consume Workflow Cannon packets, CAE guidance, memory, and selected command surfaces through structured tools/resources without replacing the CLI.  
**Recommended phases:** Phase 134 for MCP server, Phase 135 for shared runtime cleanup  
**Primary outcome:** Workflow Cannon gains portable, structured agent access across Cursor, Claude, OpenAI/ChatGPT-style agent hosts, VS Code agents, and future platforms while preserving CLI, policy, and deterministic core behavior.

## 1. Product thesis

MCP should not replace the CLI.

The desired end state is:

```text
One canonical Workflow Cannon command/runtime core
  -> CLI adapter
  -> MCP adapter
  -> Dashboard adapter
  -> future HTTP/automation adapters if needed
```

The CLI remains essential for:

```text
humans
CI
scripts
local debugging
shell workflows
release automation
non-MCP agent hosts
```

MCP becomes the preferred agent integration surface for:

```text
read-only packets
structured context
CAE guidance
memory recall
instruction refs
phase/task/assignment summaries
portable agent prompts
```

## 2. Core rule

Do **not** build two implementations.

Bad end state:

```text
CLI has one implementation
MCP has another implementation
Dashboard has special hidden behavior
```

Good end state:

```text
CommandRegistry / WorkflowRuntime owns command execution
CLI formats it for shell users
MCP exposes it as tools/resources
Dashboard invokes it for UI flows
```

## 3. MCP vs CLI usage policy

### Prefer MCP for read/context operations

Agents should use MCP for:

```text
phase-release-orchestration-state
agent-execution-packet draft
phase-drain-delta
phase-release-state
CAE guidance
memory recall
persona/scenario lookup
architecture summaries
instruction refs
```

Why:

```text
structured JSON
no shell parsing
portable across agent hosts
bounded context
better tool discovery
less prompt stuffing
```

### Prefer CLI for mutation/execution operations

Agents should use CLI for:

```text
register-assignment
run-transition
submit-assignment-handoff
prepare-release-artifacts when it writes files
reconcile/complete task
build/test/check/parity
git operations
npm publish
policyApproval-gated commands
```

Why:

```text
local shell environment
existing policy enforcement
CI/script compatibility
exact stdout/stderr
repo mutation visibility
human auditability
```

### Later MCP mutation tools

MCP can eventually expose mutation tools, but only when they call the same command handlers and enforce the same policyApproval/audit rules.

## 4. Staged implementation strategy

### Stage 1 — Read-only MCP wrapper

Expose packet/context commands through MCP, initially wrapping existing command handlers or CLI execution.

### Stage 2 — Shared command runtime

Refactor CLI and MCP to use the same command registry/runtime directly.

### Stage 3 — Selected mutation tools

Expose carefully selected mutation tools through MCP, disabled by default until policy/audit confidence is high.

### Stage 4 — Adapter parity

Ensure CLI, MCP, and Dashboard adapters are tested against the same command contracts.

## 5. Initial MCP surface

Start small.

### Read-only tools

```text
workflow_cannon.phase_release_orchestration_state
workflow_cannon.agent_execution_packet
workflow_cannon.assignment_reconciliation_preflight
workflow_cannon.phase_drain_delta
workflow_cannon.phase_release_state
workflow_cannon.release_closeout_result
workflow_cannon.recall_memory
workflow_cannon.cae_guidance
```

### Resources

```text
workflow-cannon://project/agent-rules
workflow-cannon://project/architecture-summary
workflow-cannon://phase/{phaseKey}/orchestration-state
workflow-cannon://task/{taskId}/execution-packet
workflow-cannon://assignment/{assignmentId}/reconciliation-preflight
workflow-cannon://memory/recent-approved
workflow-cannon://cae/guidance/{contextId}
```

### Prompts

```text
complete-release-phase
assign-task-worker
reconcile-assignment
investigate-failure
user-test-scenario
```

## 6. Security policy

Default MCP mode should be read-only.

Security requirements:

```text
small allowlisted tool set
bounded output sizes
schemas generated from Workflow Cannon contracts
no secrets in resources
audit log for every MCP call
policyApproval required for gated mutation tools
mutation tools disabled by default initially
external/untrusted content clearly marked
memory recalls include source/confidence/freshness
```

MCP must not bypass:

```text
Workflow Cannon policy approval
Task Engine lifecycle rules
Team Execution assignment rules
release/publish gates
git/package safety checks
```

## 7. Relationship with memory

MCP should expose memory through Workflow Cannon's memory adapter, not directly through a third-party backend.

Correct:

```text
MCP -> WorkflowMemory interface -> configured backend
```

Incorrect:

```text
MCP -> Mem0/Zep/etc directly, bypassing Workflow Cannon governance
```

Memory tools should be read-only by default:

```text
recall_memory
list_memory_proposals
```

Proposal/approval mutation tools can be added later with policy controls.

## 8. Planner-ready task breakdown

---

## P134-T001 — Define MCP architecture and adapter boundary

**Priority:** P0  
**Goal:** Define how MCP fits beside CLI and Dashboard without becoming a second implementation.

**Blocked by:** None.  
**Blocks:** P134-T002, P134-T003, P134-T004, P135-T001.

**Owned paths:**

- `MCP_PLAN.md`
- `src/modules/mcp/README.md`
- `docs/maintainers/mcp.md`
- architecture docs if needed

**Implementation steps:**

1. Document MCP/CLI/Dashboard adapter strategy.
2. Define read-only first policy.
3. Define tool/resource/prompt categories.
4. Define security/audit requirements.
5. Define shared runtime target architecture.

**Acceptance criteria:**

- Architecture explicitly says MCP does not replace CLI.
- CLI/MCP/Dashboard share command/runtime direction is documented.
- Read-only first and mutation policy are documented.

---

## P134-T002 — Add minimal read-only MCP server scaffold

**Priority:** P0  
**Goal:** Add a working MCP server process/module with no broad tool surface yet.

**Blocked by:** P134-T001.  
**Blocks:** P134-T003, P134-T004, P134-T005.

**Owned paths:**

- `src/modules/mcp/`
- `src/modules/mcp/server.ts`
- `src/modules/mcp/tools/`
- `src/modules/mcp/resources/`
- package/build config if needed
- MCP tests

**Implementation steps:**

1. Add MCP server module.
2. Add startup entrypoint.
3. Add basic health/resource endpoint if supported by selected MCP library.
4. Keep tool set empty or limited to `health` initially.
5. Add tests for server startup and tool/resource registration.

**Acceptance criteria:**

- MCP server can start locally.
- MCP server exposes only a minimal safe surface.
- Build/test pipeline remains green.

---

## P134-T003 — Expose packet read commands as MCP tools

**Priority:** P0  
**Goal:** Expose high-value read/context packet commands as MCP tools.

**Blocked by:** P134-T002 and Phase 131 packet command corrections.  
**Blocks:** P134-T005, P134-T006, P134-T007.

**Owned paths:**

- `src/modules/mcp/tools/packet-tools.ts`
- packet command adapters
- MCP tool tests

**Initial tools:**

- `workflow_cannon.phase_release_orchestration_state`
- `workflow_cannon.agent_execution_packet`
- `workflow_cannon.assignment_reconciliation_preflight`
- `workflow_cannon.phase_drain_delta`
- `workflow_cannon.phase_release_state`
- `workflow_cannon.release_closeout_result`

**Implementation steps:**

1. Add tool schemas based on existing command contracts.
2. Route MCP calls to existing command handlers or CLI bridge.
3. Return structured JSON outputs.
4. Enforce output size budgets.
5. Include errors in a consistent MCP-safe shape.
6. Add CLI/MCP parity tests for read commands where possible.

**Acceptance criteria:**

- MCP tools return equivalent structured results to CLI commands.
- Tools require explicit `phaseKey` where appropriate.
- Outputs are bounded.
- No mutation tools are exposed in this task.

---

## P134-T004 — Expose CAE guidance and memory recall through MCP

**Priority:** P1  
**Goal:** Let agent hosts retrieve compact guidance and memory through MCP without reading broad runbooks.

**Blocked by:** P134-T002, Memory Phase 133 adapter if memory recall is included.  
**Blocks:** P134-T007.

**Owned paths:**

- `src/modules/mcp/tools/context-tools.ts`
- `src/modules/mcp/resources/context-resources.ts`
- CAE adapter tests
- memory adapter tests if available

**Tools/resources:**

- `workflow_cannon.cae_guidance`
- `workflow_cannon.recall_memory`
- `workflow-cannon://cae/guidance/{contextId}`
- `workflow-cannon://memory/recent-approved`

**Implementation steps:**

1. Expose bounded CAE guidance retrieval.
2. Expose memory recall through WorkflowMemory interface only.
3. Include source refs, confidence, freshness, and non-authoritative markers.
4. Add fallback behavior when memory backend is disabled.
5. Add tests for CAE-only, memory-enabled, and memory-disabled modes.

**Acceptance criteria:**

- Agent hosts can retrieve guidance without opening broad runbooks.
- Memory recall is governed and source-cited.
- MCP does not bypass memory governance.

---

## P134-T005 — Add MCP audit log and security controls

**Priority:** P1  
**Goal:** Make MCP calls auditable and safe by default.

**Blocked by:** P134-T002.  
**Blocks:** P134-T006, P134-T008.

**Owned paths:**

- `src/modules/mcp/security.ts`
- `src/modules/mcp/audit.ts`
- `src/modules/mcp/config.ts`
- tests

**Implementation steps:**

1. Add MCP config with read-only default mode.
2. Add allowlist of exposed tools/resources.
3. Add output size limits.
4. Add audit log for every call:
   - tool/resource name;
   - args summary;
   - result status;
   - duration;
   - mutation flag;
   - policy status.
5. Mark external/untrusted content where applicable.
6. Add tests for disabled tools, output bound enforcement, and audit records.

**Acceptance criteria:**

- MCP defaults to read-only.
- Unknown tools are rejected.
- Calls are auditable.
- Outputs are bounded.

---

## P134-T006 — Add MCP setup docs for agent platforms

**Priority:** P1  
**Goal:** Document how to use Workflow Cannon MCP from supported agent hosts.

**Blocked by:** P134-T003, P134-T005.  
**Blocks:** P134-T007.

**Owned paths:**

- `docs/maintainers/mcp.md`
- `.ai/runbooks/mcp-agent-usage.md`
- platform setup examples

**Implementation steps:**

1. Document server startup.
2. Document tool list and intended use.
3. Document MCP vs CLI decision rule.
4. Document security/read-only defaults.
5. Add examples for phase release packet flow.

**Acceptance criteria:**

- Docs explain when an agent should use MCP vs CLI.
- Docs include setup and example tool calls.
- Docs warn that MCP memory is advisory, not canonical.

---

## P134-T007 — Add user simulation scenarios for MCP mode

**Priority:** P2  
**Goal:** Extend the user simulation harness to compare CLI mode and MCP mode.

**Blocked by:** Phase 132 user simulation harness, P134-T003, P134-T004, P134-T006.  
**Blocks:** None.

**Owned paths:**

- `test/harness/user-simulation/scenarios/`
- `test/harness/user-simulation/evaluators/`
- MCP harness adapter

**Implementation steps:**

1. Add harness mode: `mcp`.
2. Run core scenarios through MCP tools where appropriate.
3. Compare command sequence, context size, and response quality against CLI mode.
4. Add expert persona checks for explicit phaseKey, packet authority, memory source refs, and tool selection.
5. Add PM persona checks for clarity and lack of unnecessary technical detail.

**Acceptance criteria:**

- Harness can run at least one complete-release scenario in MCP mode.
- CLI and MCP outputs are comparable.
- MCP mode does not require broad prompt/runbook context.

---

## P134-T008 — Design mutation-tool policy, keep disabled by default

**Priority:** P2  
**Goal:** Prepare for future MCP mutation tools without exposing unsafe behavior now.

**Blocked by:** P134-T005.  
**Blocks:** Phase 135 mutation work.

**Owned paths:**

- `docs/maintainers/mcp-mutation-policy.md`
- `src/modules/mcp/config.ts`
- policy tests if needed

**Implementation steps:**

1. Define candidate mutation tools:
   - `register_assignment`
   - `submit_assignment_handoff`
   - `run_transition`
   - `review_memory_proposal`
2. Define policyApproval requirements.
3. Define audit requirements.
4. Define disabled-by-default config.
5. Define parity expectations with CLI.

**Acceptance criteria:**

- Mutation tool policy is documented.
- Mutation tools remain disabled by default.
- Future work has clear guardrails.

---

# PHASE 135 — Shared Command Runtime Cleanup

Phase 134 can wrap existing command surfaces initially. Phase 135 should remove duplication risk by putting CLI, MCP, and Dashboard on a shared runtime.

## P135-T001 — Define shared CommandRegistry runtime

**Priority:** P0  
**Goal:** Establish one canonical command execution path used by CLI, MCP, and Dashboard adapters.

**Blocked by:** P134-T001.  
**Blocks:** P135-T002, P135-T003.

**Owned paths:**

- `src/core/command-runtime/`
- existing CLI command registry files
- runtime tests

**Implementation steps:**

1. Identify current command dispatch paths.
2. Define shared `CommandRegistry.execute()` shape.
3. Separate command execution from adapter formatting.
4. Add tests for command execution independent of CLI.

**Acceptance criteria:**

- Commands can be invoked through shared runtime without shelling out.
- CLI behavior remains compatible.

---

## P135-T002 — Move CLI onto shared runtime

**Priority:** P0  
**Goal:** Make CLI an adapter over the shared command runtime.

**Blocked by:** P135-T001.  
**Blocks:** P135-T003.

**Owned paths:**

- CLI entrypoint files
- command dispatch files
- CLI tests

**Implementation steps:**

1. Route CLI command execution through shared runtime.
2. Preserve CLI output formatting and exit codes.
3. Preserve policyApproval behavior.
4. Add regression tests.

**Acceptance criteria:**

- Existing CLI command behavior remains stable.
- CLI and runtime outputs are equivalent.

---

## P135-T003 — Move MCP onto shared runtime

**Priority:** P0  
**Goal:** Make MCP tools call the shared runtime instead of shelling out or duplicating command logic.

**Blocked by:** P135-T001, P135-T002.  
**Blocks:** P135-T004.

**Owned paths:**

- `src/modules/mcp/`
- shared runtime adapters
- MCP tests

**Implementation steps:**

1. Route MCP tools through shared runtime.
2. Preserve MCP-safe result formatting.
3. Preserve audit and output bounds.
4. Add CLI/MCP parity tests.

**Acceptance criteria:**

- MCP no longer duplicates command execution logic.
- MCP and CLI produce equivalent core results for shared commands.

---

## P135-T004 — Add adapter parity tests

**Priority:** P1  
**Goal:** Ensure CLI, MCP, and Dashboard adapters remain consistent over time.

**Blocked by:** P135-T003.  
**Blocks:** P135-T005.

**Owned paths:**

- adapter parity tests
- fixtures

**Implementation steps:**

1. Select read commands for parity tests.
2. Run through CLI adapter and MCP adapter.
3. Compare normalized results.
4. Add Dashboard prompt/packet behavior checks where practical.

**Acceptance criteria:**

- Parity tests catch adapter drift.
- Packet commands behave consistently across CLI and MCP.

---

## P135-T005 — Expose selected MCP mutation tools behind policy controls

**Priority:** P2  
**Goal:** Add carefully selected mutation tools after shared runtime and audit controls are proven.

**Blocked by:** P134-T008, P135-T004.  
**Blocks:** None.

**Owned paths:**

- `src/modules/mcp/tools/mutation-tools.ts`
- policy/audit tests

**Implementation steps:**

1. Enable one low-risk mutation tool first, likely `submit_assignment_handoff` or `propose_memory`.
2. Require policyApproval where applicable.
3. Audit every mutation.
4. Add tests for approved, missing approval, disabled, and rejected cases.

**Acceptance criteria:**

- Mutation tools remain disabled unless explicitly enabled.
- Policy/audit behavior matches CLI expectations.

---

## 9. Dependency map

```text
Phase 134:
P134-T001
  -> P134-T002
      -> P134-T003
          -> P134-T006
              -> P134-T007
      -> P134-T004
          -> P134-T007
      -> P134-T005
          -> P134-T006
          -> P134-T008

Phase 135:
P135-T001
  -> P135-T002
      -> P135-T003
          -> P135-T004
              -> P135-T005
```

## 10. Planner creation guidance

Use this file as the brainstorm/source artifact for the planner.

Recommended PlanArtifacts:

### Phase 134 PlanArtifact

- phase key: `134`
- title: `Workflow Cannon MCP Server`
- objective: add read-only MCP access to Workflow Cannon packets, CAE guidance, memory recall, resources, prompts, and audit/security controls;
- WBS rows: P134-T001 through P134-T008;
- non-goal: replacing CLI or exposing mutation tools by default.

### Phase 135 PlanArtifact

- phase key: `135`
- title: `Shared Command Runtime for CLI and MCP`
- objective: refactor CLI and MCP onto one canonical command runtime and add adapter parity tests;
- WBS rows: P135-T001 through P135-T005;
- non-goal: removing CLI.

Recommended planner prompts:

```text
Create a PlanArtifact for Phase 134 using MCP_PLAN.md. Preserve the read-only-first MCP strategy, the MCP vs CLI policy, and the WBS tasks P134-T001 through P134-T008. The output should be ready for review-plan-artifact, accept-plan-artifact, and finalize-plan-to-phase.
```

```text
Create a PlanArtifact for Phase 135 using MCP_PLAN.md. Preserve the shared command runtime objective and WBS tasks P135-T001 through P135-T005. The output should be ready for review-plan-artifact, accept-plan-artifact, and finalize-plan-to-phase.
```

## 11. Done criteria

Phase 134 is done when:

- MCP architecture and security policy are documented;
- read-only MCP server starts locally;
- packet commands are exposed as bounded MCP tools;
- CAE guidance and memory recall are exposed through governed MCP surfaces;
- audit log and allowlist controls exist;
- agent platform setup docs exist;
- user simulation can run at least one MCP-mode scenario;
- mutation tools remain disabled by default.

Phase 135 is done when:

- CLI and MCP use a shared command runtime;
- adapter formatting is separate from command execution;
- policy enforcement sits below adapters;
- CLI compatibility is preserved;
- MCP parity tests prove equivalent core outputs;
- selected mutation tools can be safely enabled behind policy controls.
