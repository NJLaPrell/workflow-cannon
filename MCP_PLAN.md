# MCP_PLAN — Workflow Cannon MCP Server and Shared Command Runtime

**Status:** Proposed planner-ready implementation plan  
**Purpose:** Add a Model Context Protocol (MCP) access layer for Workflow Cannon so agent platforms can consume Workflow Cannon packets, CAE guidance, memory, and selected command surfaces through structured tools/resources without replacing the CLI.  
**Recommended phases:** Phase 134 for MCP server and agent adoption layer, Phase 135 for shared runtime cleanup  
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

### Stage 2 — Agent adoption layer

Teach agents how to use MCP through usage rules, high-quality tool descriptions, a bootstrap/capabilities tool, dashboard prompt integration, freshness metadata, and fallback behavior.

### Stage 3 — Shared command runtime

Refactor CLI and MCP to use the same command registry/runtime directly.

### Stage 4 — Selected mutation tools

Expose carefully selected mutation tools through MCP, disabled by default until policy/audit confidence is high.

### Stage 5 — Adapter parity

Ensure CLI, MCP, and Dashboard adapters are tested against the same command contracts.

## 5. Initial MCP surface

Start small.

### Read-only tools

```text
workflow_cannon.agent_start
workflow_cannon.capabilities
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
workflow-cannon://project/mcp-usage-policy
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
freshness metadata included on state-like results
tool versions and schema versions included in results
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

## 8. Agent adoption requirements

Building MCP tools is not enough. Agents must know when and how to use MCP.

Workflow Cannon must provide:

```text
agent-facing MCP usage rules
high-quality tool descriptions
MCP-first dashboard prompt language
bootstrap/capabilities tool
freshness/staleness metadata
CLI fallback commands
platform setup examples
MCP unavailable/failure scenarios in the harness
```

Default agent behavior should become:

```text
If Workflow Cannon MCP tools are available, use MCP for read/context packet calls.
Use CLI for mutation, validation, git, npm publish, and policyApproval-gated commands.
If MCP is unavailable, fall back to CLI and report the fallback.
Never treat MCP memory or resources as current-state truth unless the tool result is explicitly live and fresh.
```

## 9. Tool description contract

Every MCP tool should include a compact, agent-usable description containing:

```text
purpose
when to use
when not to use
required args
output shape summary
read-only or mutation classification
CLI fallback command
common mistakes
freshness behavior
schema version/tool version
```

Example:

```text
workflow_cannon.phase_release_orchestration_state

Use this first when classifying a phase release path.
Requires explicit phaseKey.
Read-only.
Prefer this over list-tasks, phase-status, or dashboard-summary for release orchestration startup.
CLI fallback: pnpm exec wk run phase-release-orchestration-state '{"phaseKey":"..."}'
Do not use this to mutate task state.
```

## 10. Freshness policy

Every state-like MCP result should include freshness metadata:

```json
{
  "freshness": {
    "generatedAt": "...",
    "workspaceRoot": "...",
    "taskStoreGeneration": 123,
    "planningGeneration": 45,
    "gitHead": "...",
    "stale": false
  }
}
```

Resource-like outputs should include cache policy:

```json
{
  "cachePolicy": "static|generated|live",
  "validForMs": 30000,
  "sourceGeneration": 123
}
```

If freshness cannot be proven, the result must say so.

## 11. Planner-ready task breakdown

---

## P134-T001 — Define MCP architecture and adapter boundary

**Priority:** P0  
**Goal:** Define how MCP fits beside CLI and Dashboard without becoming a second implementation.

**Blocked by:** None.  
**Blocks:** P134-T002, P134-T003, P134-T004, P134-T009, P135-T001.

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
6. Define agent-adoption expectations.

**Acceptance criteria:**

- Architecture explicitly says MCP does not replace CLI.
- CLI/MCP/Dashboard share command/runtime direction is documented.
- Read-only first and mutation policy are documented.
- Agent adoption layer is explicitly part of the MCP plan.

---

## P134-T002 — Add minimal read-only MCP server scaffold

**Priority:** P0  
**Goal:** Add a working MCP server process/module with no broad tool surface yet.

**Blocked by:** P134-T001.  
**Blocks:** P134-T003, P134-T004, P134-T005, P134-T016.

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
**Blocks:** P134-T005, P134-T006, P134-T007, P134-T010, P134-T011, P134-T013, P134-T014.

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
**Blocks:** P134-T007, P134-T010, P134-T012.

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
**Blocks:** P134-T006, P134-T008, P134-T013, P134-T016.

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

**Blocked by:** P134-T003, P134-T005, P134-T009, P134-T010, P134-T016.  
**Blocks:** P134-T007, P134-T015.

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
6. Add platform-specific examples for Cursor, Claude, VS Code agent hosts, manual stdio, and any supported OpenAI/ChatGPT-style client.
7. Add verification instructions showing the agent/user is connected to the correct workspace.

**Acceptance criteria:**

- Docs explain when an agent should use MCP vs CLI.
- Docs include setup and example tool calls.
- Docs warn that MCP memory is advisory, not canonical.
- Docs include platform-specific setup examples and verification steps.

---

## P134-T007 — Add user simulation scenarios for MCP mode

**Priority:** P2  
**Goal:** Extend the user simulation harness to compare CLI mode and MCP mode.

**Blocked by:** Phase 132 user simulation harness, P134-T003, P134-T004, P134-T006, P134-T011, P134-T013, P134-T015.  
**Blocks:** None.

**Owned paths:**

- `test/harness/user-simulation/scenarios/`
- `test/harness/user-simulation/evaluators/`
- MCP harness adapter

**Implementation steps:**

1. Add harness mode: `mcp`.
2. Run core scenarios through MCP tools where appropriate.
3. Compare command sequence, context size, and response quality against CLI mode.
4. Add expert persona checks for explicit phaseKey, packet authority, memory source refs, freshness, and tool selection.
5. Add PM persona checks for clarity and lack of unnecessary technical detail.
6. Add failure/fallback scenarios:
   - MCP server unavailable;
   - MCP tool missing;
   - output too large;
   - memory backend disabled;
   - read-only mode rejects mutation;
   - phaseKey mismatch.

**Acceptance criteria:**

- Harness can run at least one complete-release scenario in MCP mode.
- CLI and MCP outputs are comparable.
- MCP mode does not require broad prompt/runbook context.
- Harness proves agents fall back safely when MCP is unavailable or incomplete.

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

## P134-T009 — Add agent MCP usage rules and fallback policy

**Priority:** P0  
**Goal:** Teach agents when to use MCP, when to use CLI, and how to fall back safely.

**Blocked by:** P134-T001.  
**Blocks:** P134-T006, P134-T015.

**Owned paths:**

- `.ai/runbooks/mcp-agent-usage.md`
- `.cursor/rules/workflow-cannon-mcp.mdc` or generated equivalent
- generated platform instruction projections if present
- `docs/maintainers/mcp.md`

**Implementation steps:**

1. Add MCP-first read/context rule.
2. Add CLI-for-mutation/execution rule.
3. Add fallback behavior when MCP is unavailable.
4. Add rule that MCP memory/resources are not current-state truth unless live/freshness metadata says so.
5. Add examples for Complete & Release, worker assignment, and reconciliation.

**Acceptance criteria:**

- Agents know to try MCP first for read/context packet calls.
- Agents know CLI remains required for mutation, validation, git, publish, and policyApproval-gated work.
- Fallback behavior is explicit and safe.

---

## P134-T010 — Define MCP tool description and discovery contract

**Priority:** P0  
**Goal:** Ensure agents can choose the correct MCP tool without extra coaching.

**Blocked by:** P134-T003, P134-T004.  
**Blocks:** P134-T006, P134-T011.

**Owned paths:**

- `src/modules/mcp/tool-descriptions.ts`
- `src/modules/mcp/tools/`
- MCP docs/tests

**Implementation steps:**

1. Define required tool description fields:
   - purpose;
   - when to use;
   - when not to use;
   - required args;
   - output shape summary;
   - read-only/mutation classification;
   - CLI fallback;
   - common mistakes;
   - freshness behavior;
   - schema/tool version.
2. Apply the contract to all initial MCP tools.
3. Add tests/snapshots for tool descriptions.
4. Ensure descriptions are compact enough not to bloat tool context.

**Acceptance criteria:**

- Each MCP tool has a high-quality, compact, agent-usable description.
- Descriptions include CLI fallback and common mistakes.
- Agents can infer correct tool choice from descriptions.

---

## P134-T011 — Add MCP agent bootstrap/capabilities tool

**Priority:** P0  
**Goal:** Give agents one obvious first MCP call that explains available Workflow Cannon tools and recommended next step.

**Blocked by:** P134-T003, P134-T010.  
**Blocks:** P134-T007, P134-T015.

**Owned paths:**

- `src/modules/mcp/tools/bootstrap-tools.ts`
- `src/modules/mcp/tools/capabilities.ts`
- MCP tests

**Tools:**

- `workflow_cannon.agent_start`
- `workflow_cannon.capabilities`

**Implementation steps:**

1. Add `agent_start` tool accepting workflow, phaseKey, and agentRole.
2. Return recommended first tool, required args, CLI fallback, read/context policy, mutation policy, and unavailable-tool warnings.
3. Add `capabilities` tool listing available MCP tools/resources/prompts and read-only/mutation state.
4. Include workspace binding and freshness information.
5. Add tests for complete-release orchestrator, task worker, user simulation, and unavailable tool cases.

**Acceptance criteria:**

- Agents have one clear MCP starting point.
- `agent_start` recommends `phase_release_orchestration_state` for Complete & Release.
- CLI fallback is included.
- Tool availability and read-only mode are explicit.

---

## P134-T012 — Define MCP resource freshness and cache policy

**Priority:** P1  
**Goal:** Prevent stale MCP resources from being mistaken for live state.

**Blocked by:** P134-T004.  
**Blocks:** P134-T013.

**Owned paths:**

- `src/modules/mcp/resources/`
- `src/modules/mcp/resource-policy.ts`
- resource tests

**Implementation steps:**

1. Define tool vs resource rule:
   - tools for computed, parameterized, fresh, or policy-sensitive reads;
   - resources for stable, cached, or navigable read-only context.
2. Add cache policy metadata to resources.
3. Add freshness/cursor metadata where resources expose generated state.
4. Add tests for static, generated, and live resource policies.

**Acceptance criteria:**

- Resources disclose cache/freshness policy.
- State-like resources do not appear authoritative without freshness metadata.
- Tool/resource boundary is documented and tested.

---

## P134-T013 — Add MCP freshness metadata and stale-result handling

**Priority:** P1  
**Goal:** Add freshness metadata to MCP results so agents can detect stale context.

**Blocked by:** P134-T003, P134-T005, P134-T012.  
**Blocks:** P134-T007, P134-T015.

**Owned paths:**

- `src/modules/mcp/freshness.ts`
- `src/modules/mcp/tools/`
- `src/modules/mcp/resources/`
- freshness tests

**Implementation steps:**

1. Define freshness metadata shape.
2. Attach freshness to state-like tool outputs.
3. Attach cache policy to resource outputs.
4. Include workspace root, generatedAt, task/planning generation when available, gitHead when relevant, and stale flag.
5. Add stale-result behavior and warnings when freshness cannot be proven.

**Acceptance criteria:**

- State-like results include freshness metadata.
- Agents can see whether MCP output is stale or live.
- Missing freshness is explicit, not silent.

---

## P134-T014 — Add MCP tool/version/schema policy

**Priority:** P1  
**Goal:** Make MCP tool contracts stable enough for agents and tests to rely on.

**Blocked by:** P134-T003.  
**Blocks:** P134-T010, P134-T011.

**Owned paths:**

- `src/modules/mcp/versioning.ts`
- MCP tool schemas
- docs/tests

**Implementation steps:**

1. Decide stable tool names with `schemaVersion` and `toolVersion` in output, or versioned tool names if necessary.
2. Prefer stable tool names with output schema version unless breaking changes become frequent.
3. Add version metadata to tool outputs.
4. Add compatibility tests.
5. Document deprecation behavior.

**Acceptance criteria:**

- Every MCP tool output includes schema/tool version.
- Breaking changes have an explicit migration/deprecation strategy.
- Agents and harnesses can assert expected versions.

---

## P134-T015 — Update dashboard prompts for MCP-first read/context flow

**Priority:** P1  
**Goal:** Ensure dashboard-launched agents use MCP when available instead of defaulting to CLI/broad runbook discovery.

**Blocked by:** P134-T006, P134-T009, P134-T011, P134-T013.  
**Blocks:** P134-T007.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/phase-complete-release-prompt.ts`
- dashboard prompt tests
- `.cursor/rules/` or generated prompt rules if applicable

**Implementation steps:**

1. Add MCP-first instruction for read/context packet calls.
2. Include CLI fallback for first command.
3. Tell agents not to open broad playbooks before MCP/packet call unless MCP and CLI packet command are unavailable.
4. Add tests for prompt content.
5. Preserve dashboard authorization and policyApproval reminders.

**Acceptance criteria:**

- Complete & Release prompt directs agents to MCP first when available.
- Prompt includes CLI fallback.
- Prompt does not encourage broad runbook-first behavior.

---

## P134-T016 — Define MCP server launch and workspace binding

**Priority:** P0  
**Goal:** Make MCP server startup, workspace binding, and verification explicit and reliable.

**Blocked by:** P134-T002, P134-T005.  
**Blocks:** P134-T006.

**Owned paths:**

- `src/modules/mcp/server.ts`
- package scripts/bin entries
- `docs/maintainers/mcp.md`
- MCP startup tests

**Implementation steps:**

1. Define supported launch commands, for example:
   - `pnpm exec wk mcp`
   - `pnpm exec workflow-cannon-mcp`
2. Define stdio vs other transport decision. Start with stdio unless there is a strong reason not to.
3. Define workspace root detection and override.
4. Support multiple repos/workspaces safely.
5. Add startup verification output/tool showing workspace root, package version, read-only mode, and available tools.
6. Define logging location and debug mode.

**Acceptance criteria:**

- Users and agents can start the MCP server reliably.
- Server proves which workspace it is bound to.
- Multiple workspace behavior is documented.
- Setup docs can include concrete commands.

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

## 12. Dependency map

```text
Phase 134:
P134-T001
  -> P134-T002
      -> P134-T016
          -> P134-T006
      -> P134-T003
          -> P134-T010
          -> P134-T011
          -> P134-T013
          -> P134-T014
      -> P134-T004
          -> P134-T012
      -> P134-T005
          -> P134-T013
          -> P134-T008
      -> P134-T009
          -> P134-T006
          -> P134-T015

P134-T003 + P134-T004 + P134-T006 + P134-T007 + P134-T009 + P134-T011 + P134-T013 + P134-T015
  -> Agent adoption complete

Phase 135:
P135-T001
  -> P135-T002
      -> P135-T003
          -> P135-T004
              -> P135-T005
```

## 13. Planner creation guidance

Use this file as the brainstorm/source artifact for the planner.

Recommended PlanArtifacts:

### Phase 134 PlanArtifact

- phase key: `134`
- title: `Workflow Cannon MCP Server and Agent Adoption Layer`
- objective: add read-only MCP access to Workflow Cannon packets, CAE guidance, memory recall, resources, prompts, audit/security controls, and agent-usable MCP adoption rules;
- WBS rows: P134-T001 through P134-T016;
- non-goal: replacing CLI or exposing mutation tools by default.

### Phase 135 PlanArtifact

- phase key: `135`
- title: `Shared Command Runtime for CLI and MCP`
- objective: refactor CLI and MCP onto one canonical command runtime and add adapter parity tests;
- WBS rows: P135-T001 through P135-T005;
- non-goal: removing CLI.

Recommended planner prompts:

```text
Create a PlanArtifact for Phase 134 using MCP_PLAN.md. Preserve the read-only-first MCP strategy, the MCP vs CLI policy, the agent adoption layer, and the WBS tasks P134-T001 through P134-T016. The output should be ready for review-plan-artifact, accept-plan-artifact, and finalize-plan-to-phase.
```

```text
Create a PlanArtifact for Phase 135 using MCP_PLAN.md. Preserve the shared command runtime objective and WBS tasks P135-T001 through P135-T005. The output should be ready for review-plan-artifact, accept-plan-artifact, and finalize-plan-to-phase.
```

## 14. Done criteria

Phase 134 is done when:

- MCP architecture and security policy are documented;
- read-only MCP server starts locally;
- server launch and workspace binding are reliable;
- packet commands are exposed as bounded MCP tools;
- CAE guidance and memory recall are exposed through governed MCP surfaces;
- audit log and allowlist controls exist;
- MCP tool descriptions are compact and agent-usable;
- `agent_start` / `capabilities` tools exist;
- freshness/cache/version metadata exists;
- agent platform setup docs exist;
- dashboard prompts include MCP-first read/context guidance with CLI fallback;
- user simulation can run MCP-mode and MCP-fallback scenarios;
- mutation tools remain disabled by default.

Phase 135 is done when:

- CLI and MCP use a shared command runtime;
- adapter formatting is separate from command execution;
- policy enforcement sits below adapters;
- CLI compatibility is preserved;
- MCP parity tests prove equivalent core outputs;
- selected mutation tools can be safely enabled behind policy controls.
