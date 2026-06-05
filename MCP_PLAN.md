# MCP_PLAN — Workflow Cannon MCP Server, Agent Adoption, and Shared Runtime

**Status:** Proposed planner-ready implementation plan with unresolved decisions  
**Purpose:** Add a Model Context Protocol (MCP) access layer so agent platforms can consume Workflow Cannon packets, CAE guidance, memory, resources, and prompts through structured tools without replacing the CLI.  
**Recommended phases:** Phase 134 for read-only MCP + agent adoption + integration hardening; Phase 135 for shared command runtime; later phase for selected mutation tools.  
**Primary outcome:** Workflow Cannon gains portable, structured agent access across Cursor, Claude, OpenAI/ChatGPT-style agent hosts, VS Code agents, and future platforms while preserving CLI, policy, and deterministic core behavior.

## 1. Product thesis

MCP should **not** replace the CLI.

The desired end state is:

```text
One canonical Workflow Cannon command/runtime core
  -> CLI adapter
  -> MCP adapter
  -> Dashboard adapter
  -> future HTTP/automation adapters if needed
```

The CLI remains essential for humans, CI, scripts, local debugging, shell workflows, release automation, non-MCP agent hosts, and mutation/execution tasks.

MCP becomes the preferred agent integration surface for read-only packets, structured context, CAE guidance, memory recall, instruction refs, phase/task/assignment summaries, portable agent prompts, and user simulation harness integration.

## 2. Core rules

1. Do **not** build two implementations.
2. Use MCP for read/context by default when available.
3. Use CLI for mutation/execution by default.
4. MCP memory/resources are never current-state truth unless a live tool result explicitly says so.
5. MCP tools must return bounded, versioned, freshness-aware outputs.
6. MCP must not bypass Workflow Cannon policy approval, task lifecycle, assignment lifecycle, release gates, git/package safety, publish safeguards, workspace trust, or path boundaries.

## 3. MCP vs CLI usage policy

Prefer MCP for:

```text
agent_start / capabilities
phase-release-orchestration-state
agent-execution-packet draft/locked reads
assignment-reconciliation-preflight reads
phase-drain-delta
phase-release-state
release-closeout-result reads
CAE guidance
memory recall
persona/scenario lookup
architecture summaries
instruction refs
```

Prefer CLI for:

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

MCP can eventually expose selected mutation tools, but only when they call the same command handlers and enforce the same policyApproval/audit rules. Mutation tools remain disabled by default until shared runtime, audit, and parity tests are proven.

## 4. Staged implementation strategy

1. **Read-only MCP wrapper:** expose packet/context commands through MCP, initially wrapping existing command handlers or CLI execution where necessary.
2. **Agent adoption layer:** teach agents how to use MCP through usage rules, high-quality tool descriptions, a bootstrap/capabilities tool, dashboard prompt integration, freshness metadata, and fallback behavior.
3. **Integration hardening:** add dashboard MCP status, workspace trust/path boundaries, multi-root behavior, tool output budgets, error taxonomy, privacy controls, schema source-of-truth, prompt-injection protections, and platform instruction alignment.
4. **Shared command runtime:** refactor CLI and MCP to use the same command registry/runtime directly.
5. **Selected mutation tools:** expose carefully selected mutation tools through MCP, disabled by default until policy/audit confidence is high.
6. **Adapter parity:** ensure CLI, MCP, and Dashboard adapters are tested against the same command contracts.

## 5. Initial MCP surface

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

## 6. Security, trust, and freshness policy

Default MCP mode should be read-only.

Security requirements:

```text
small allowlisted tool set
bounded output sizes by tool
schemas generated from Workflow Cannon contracts
no secrets in resources or logs
audit log for every MCP call
policyApproval required for gated mutation tools
mutation tools disabled by default initially
external/untrusted content clearly marked
untrusted resource text wrapped as data, not instructions
memory recalls include source/confidence/freshness/non-authoritative markers
freshness metadata included on state-like results
tool versions and schema versions included in results
workspace root and trust status included in startup/capabilities
path boundary enforcement prevents access outside the trusted workspace
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

Memory tools should be read-only by default: `recall_memory` and `list_memory_proposals`. Proposal/approval mutation tools can be added later with policy controls.

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

Default agent behavior:

```text
If Workflow Cannon MCP tools are available, use MCP for read/context packet calls.
Use CLI for mutation, validation, git, npm publish, and policyApproval-gated commands.
If MCP is unavailable, fall back to CLI and report the fallback.
Never treat MCP memory or resources as current-state truth unless the tool result is explicitly live and fresh.
```

## 9. Tool description contract

Every MCP tool must include a compact, agent-usable description:

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
    "workspaceTrusted": true,
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

## 11. Tool/resource output budgets

Each MCP tool/resource must have an explicit budget. Example starting targets:

```text
agent_start: <= 6 KB
capabilities: <= 12 KB
phase_release_orchestration_state: <= 16 KB
agent_execution_packet: <= 20 KB
assignment_reconciliation_preflight: <= 16 KB
phase_drain_delta: <= 12 KB
phase_release_state: <= 18 KB
release_closeout_result: <= 18 KB
cae_guidance: <= 8 KB
recall_memory: <= 8 KB / max 5 items
project resources: <= 12 KB unless explicitly expanded
```

Oversized results should return a bounded summary with expansion refs, not dump everything.

## 12. Error taxonomy

MCP tools should return predictable error codes so agents can recover safely.

Initial error taxonomy:

```text
MCP_UNAVAILABLE
WORKSPACE_NOT_BOUND
WORKSPACE_UNTRUSTED
PHASE_KEY_REQUIRED
PHASE_MISMATCH
TOOL_DISABLED
OUTPUT_TOO_LARGE
STALE_RESULT
POLICY_REQUIRED
COMMAND_FAILED
MEMORY_BACKEND_DISABLED
RESOURCE_NOT_FOUND
SCHEMA_VERSION_UNSUPPORTED
PATH_OUTSIDE_WORKSPACE
UNTRUSTED_CONTENT_BLOCKED
```

Each error should include code, human summary, agent next action, CLI fallback if available, and whether retry is useful.

## 13. Phase 134 task breakdown — MCP server, adoption, and hardening

### P134-T001 — Define MCP architecture and adapter boundary

**Priority:** P0  
**Goal:** Define how MCP fits beside CLI and Dashboard without becoming a second implementation.

**Blocks:** P134-T002, P134-T003, P134-T004, P134-T009, P135-T001.

**Acceptance criteria:** Architecture says MCP does not replace CLI; read-only first and mutation policy are documented; agent adoption and integration-hardening layers are explicit.

### P134-T002 — Add minimal read-only MCP server scaffold

**Priority:** P0  
**Goal:** Add a working MCP server process/module with no broad tool surface yet.

**Blocked by:** P134-T001.  
**Blocks:** P134-T003, P134-T004, P134-T005, P134-T016, P134-T018.

**Acceptance criteria:** MCP server starts locally; exposes minimal safe surface; build/test remains green.

### P134-T003 — Expose packet read commands as MCP tools

**Priority:** P0  
**Goal:** Expose high-value read/context packet commands as MCP tools.

**Blocked by:** P134-T002 and Phase 131 packet command corrections.  
**Blocks:** P134-T005, P134-T006, P134-T007, P134-T010, P134-T011, P134-T013, P134-T014, P134-T020, P134-T021.

**Acceptance criteria:** MCP tools return equivalent structured results to CLI; explicit `phaseKey` required where appropriate; outputs bounded; no mutation tools exposed.

### P134-T004 — Expose CAE guidance and memory recall through MCP

**Priority:** P1  
**Goal:** Let agent hosts retrieve compact guidance and memory through MCP without broad runbooks.

**Blocked by:** P134-T002 and Memory Phase 133 if memory recall is included.  
**Blocks:** P134-T007, P134-T010, P134-T012, P134-T019.

**Acceptance criteria:** CAE guidance is bounded; memory recall is governed and source-cited; MCP does not bypass memory governance.

### P134-T005 — Add MCP audit log and security controls

**Priority:** P1  
**Goal:** Make MCP calls auditable and safe by default.

**Blocked by:** P134-T002.  
**Blocks:** P134-T006, P134-T008, P134-T013, P134-T016, P134-T018, P134-T022.

**Acceptance criteria:** MCP defaults read-only; unknown tools rejected; calls auditable; outputs bounded; logs redact secrets/full dumps by default.

### P134-T006 — Add MCP setup docs for agent platforms

**Priority:** P1  
**Goal:** Document Workflow Cannon MCP usage for supported agent hosts.

**Blocked by:** P134-T003, P134-T005, P134-T009, P134-T010, P134-T016.  
**Blocks:** P134-T007, P134-T015, P134-T017.

**Acceptance criteria:** Docs explain MCP vs CLI; include setup and example calls; warn memory is advisory; include platform-specific setup and verification.

### P134-T007 — Add user simulation scenarios for MCP mode

**Priority:** P2  
**Goal:** Extend the user simulation harness to compare CLI mode, MCP mode, and MCP fallback behavior.

**Blocked by:** Phase 132, P134-T003, P134-T004, P134-T006, P134-T011, P134-T013, P134-T015, P134-T017.

**Acceptance criteria:** Harness runs at least one Complete & Release scenario in MCP mode; CLI/MCP comparable; MCP mode avoids broad runbook context; fallback behavior tested; PM/expert personas covered.

### P134-T008 — Design mutation-tool policy, keep disabled by default

**Priority:** P2  
**Goal:** Prepare future MCP mutation tools without exposing unsafe behavior now.

**Blocked by:** P134-T005.  
**Blocks:** Phase 135 mutation work.

**Acceptance criteria:** Mutation policy documented; tools disabled by default; future guardrails clear.

### P134-T009 — Add agent MCP usage rules and fallback policy

**Priority:** P0  
**Goal:** Teach agents when to use MCP, when to use CLI, and how to fall back safely.

**Blocked by:** P134-T001.  
**Blocks:** P134-T006, P134-T015, P134-T023.

**Acceptance criteria:** Agents know MCP-first for read/context; CLI remains required for mutation/execution/policy work; fallback safe and explicit.

### P134-T010 — Define MCP tool description and discovery contract

**Priority:** P0  
**Goal:** Ensure agents can choose the correct MCP tool without extra coaching.

**Blocked by:** P134-T003, P134-T004.  
**Blocks:** P134-T006, P134-T011, P134-T020.

**Acceptance criteria:** Each MCP tool has compact, agent-usable description with CLI fallback and common mistakes.

### P134-T011 — Add MCP agent bootstrap/capabilities tool

**Priority:** P0  
**Goal:** Give agents one obvious first MCP call that explains available Workflow Cannon tools and recommended next step.

**Blocked by:** P134-T003, P134-T010.  
**Blocks:** P134-T007, P134-T015.

**Acceptance criteria:** `agent_start` and `capabilities` tools exist; Complete & Release recommends `phase_release_orchestration_state`; CLI fallback included; tool availability/read-only mode explicit.

### P134-T012 — Define MCP resource freshness and cache policy

**Priority:** P1  
**Goal:** Prevent stale MCP resources from being mistaken for live state.

**Blocked by:** P134-T004.  
**Blocks:** P134-T013.

**Acceptance criteria:** Resources disclose cache/freshness policy; state-like resources are not authoritative without freshness metadata; tool/resource boundary documented and tested.

### P134-T013 — Add MCP freshness metadata and stale-result handling

**Priority:** P1  
**Goal:** Add freshness metadata to MCP results so agents can detect stale context.

**Blocked by:** P134-T003, P134-T005, P134-T012.  
**Blocks:** P134-T007, P134-T015.

**Acceptance criteria:** State-like results include freshness; stale/missing freshness explicit.

### P134-T014 — Add MCP tool/version/schema policy

**Priority:** P1  
**Goal:** Make MCP contracts stable enough for agents and tests.

**Blocked by:** P134-T003.  
**Blocks:** P134-T010, P134-T011, P134-T021.

**Acceptance criteria:** Every MCP tool output includes schema/tool version; migration/deprecation strategy exists; harnesses can assert versions.

### P134-T015 — Update dashboard prompts for MCP-first read/context flow

**Priority:** P1  
**Goal:** Ensure dashboard-launched agents use MCP when available instead of defaulting to CLI/broad discovery.

**Blocked by:** P134-T006, P134-T009, P134-T011, P134-T013.  
**Blocks:** P134-T007.

**Acceptance criteria:** Complete & Release prompt directs MCP-first when available; includes CLI fallback; does not encourage broad runbook-first behavior.

### P134-T016 — Define MCP server launch and workspace binding

**Priority:** P0  
**Goal:** Make MCP server startup, workspace binding, and verification explicit and reliable.

**Blocked by:** P134-T002, P134-T005.  
**Blocks:** P134-T006, P134-T017, P134-T018, P134-T024.

**Acceptance criteria:** Server starts reliably; proves workspace binding; multiple workspace behavior documented; setup docs have concrete commands.

### P134-T017 — Add dashboard/extension MCP status and setup affordance

**Priority:** P1  
**Goal:** Make MCP availability visible to the operator and dashboard-launched agents.

**Blocked by:** P134-T006, P134-T016.  
**Blocks:** P134-T007.

**Acceptance criteria:** Dashboard shows MCP available/unavailable/not configured/wrong workspace; shows MCP-first/CLI fallback mode; prompt is not misleading.

### P134-T018 — Add workspace trust, path boundary, and multi-root enforcement

**Priority:** P0  
**Goal:** Prevent MCP from exposing or operating on wrong workspace or paths outside trusted repo.

**Blocked by:** P134-T002, P134-T005, P134-T016.  
**Blocks:** P134-T007.

**Acceptance criteria:** MCP cannot expose files outside trusted workspace; multi-root behavior explicit/tested; bound workspace included in capability/freshness output.

### P134-T019 — Add prompt-injection handling for MCP resources and memory

**Priority:** P1  
**Goal:** Ensure untrusted MCP resources/memory cannot be mistaken for instructions.

**Blocked by:** P134-T004.  
**Blocks:** P134-T007.

**Acceptance criteria:** Untrusted content explicitly marked; instructions separated from evidence/data; malicious resource fixtures do not alter tool guidance/lifecycle authority.

### P134-T020 — Add per-tool output budgets and expansion refs

**Priority:** P1  
**Goal:** Keep MCP from becoming a new context-bloat path.

**Blocked by:** P134-T003, P134-T010.  
**Blocks:** P134-T007.

**Acceptance criteria:** Every MCP tool/resource has explicit budget; oversized results summarized; expansion refs provided.

### P134-T021 — Define schema source-of-truth and generation pipeline

**Priority:** P1  
**Goal:** Prevent drift between TypeScript contracts, JSON schemas, CLI args, MCP tool schemas, and manifests.

**Blocked by:** P134-T003, P134-T014.  
**Blocks:** P135-T004.

**Acceptance criteria:** MCP schemas are not hand-maintained duplicates; schema drift caught by tests; CLI/MCP/dashboard adapters agree on command shape.

### P134-T022 — Add privacy-safe logging and redaction rules

**Priority:** P1  
**Goal:** Ensure MCP audit logs are useful without leaking secrets, prompts, or full file content.

**Blocked by:** P134-T005.  
**Blocks:** P134-T007.

**Acceptance criteria:** Audit logs omit secrets/full prompt/file dumps by default; debug logging explicit/bounded; redaction tested.

### P134-T023 — Align generated platform instruction projections with MCP-first policy

**Priority:** P1  
**Goal:** Ensure `.cursor/rules`, AGENTS/CLAUDE/Copilot-style files, and future platform projections do not conflict with MCP guidance.

**Blocked by:** P134-T009.  
**Blocks:** P134-T015.

**Acceptance criteria:** Platform instructions align with MCP-first read/context policy; generated instructions do not conflict with dashboard prompts; agents receive consistent guidance.

### P134-T024 — Decide remote transport/auth non-goals for Phase 134

**Priority:** P1  
**Goal:** Prevent accidental scope creep into unauthenticated remote MCP transports.

**Blocked by:** P134-T016.  
**Blocks:** P134-T006, P134-T008.

**Acceptance criteria:** Transport scope explicit; remote/network transports cannot be accidentally enabled without security design; docs match supported transports.

## 14. Phase 135 task breakdown — Shared Command Runtime Cleanup

### P135-T001 — Define shared CommandRegistry runtime

**Priority:** P0  
**Goal:** Establish one canonical command execution path used by CLI, MCP, and Dashboard adapters.

**Blocked by:** P134-T001.  
**Blocks:** P135-T002, P135-T003.

**Acceptance criteria:** Commands can be invoked through shared runtime without shelling out; CLI behavior remains compatible.

### P135-T002 — Move CLI onto shared runtime

**Priority:** P0  
**Goal:** Make CLI an adapter over the shared command runtime.

**Blocked by:** P135-T001.  
**Blocks:** P135-T003.

**Acceptance criteria:** Existing CLI command behavior remains stable; CLI and runtime outputs equivalent.

### P135-T003 — Move MCP onto shared runtime

**Priority:** P0  
**Goal:** Make MCP tools call shared runtime instead of shelling out or duplicating command logic.

**Blocked by:** P135-T001, P135-T002.  
**Blocks:** P135-T004.

**Acceptance criteria:** MCP no longer duplicates command logic; MCP and CLI produce equivalent core results.

### P135-T004 — Add adapter parity tests

**Priority:** P1  
**Goal:** Ensure CLI, MCP, and Dashboard adapters remain consistent over time.

**Blocked by:** P135-T003.  
**Blocks:** P135-T005.

**Acceptance criteria:** Parity tests catch adapter drift; packet commands behave consistently across CLI and MCP.

### P135-T005 — Expose selected MCP mutation tools behind policy controls

**Priority:** P2  
**Goal:** Add carefully selected mutation tools after shared runtime and audit controls are proven.

**Blocked by:** P134-T008, P135-T004.

**Acceptance criteria:** Mutation tools remain disabled unless explicitly enabled; policy/audit behavior matches CLI expectations.

## 15. Dependency map

```text
Phase 134:
P134-T001
  -> P134-T002
      -> P134-T016
          -> P134-T006
          -> P134-T017
          -> P134-T018
          -> P134-T024
      -> P134-T003
          -> P134-T010
          -> P134-T011
          -> P134-T013
          -> P134-T014
          -> P134-T020
          -> P134-T021
      -> P134-T004
          -> P134-T012
          -> P134-T019
      -> P134-T005
          -> P134-T013
          -> P134-T018
          -> P134-T022
          -> P134-T008
      -> P134-T009
          -> P134-T006
          -> P134-T015
          -> P134-T023

Phase 135:
P135-T001
  -> P135-T002
      -> P135-T003
          -> P135-T004
              -> P135-T005
```

## 16. Planner creation guidance

### Phase 134 PlanArtifact

- phase key: `134`
- title: `Workflow Cannon MCP Server and Agent Adoption Layer`
- objective: add read-only MCP access to Workflow Cannon packets, CAE guidance, memory recall, resources, prompts, audit/security controls, and agent-usable MCP adoption rules;
- WBS rows: P134-T001 through P134-T024;
- non-goal: replacing CLI or exposing mutation tools by default.

### Phase 135 PlanArtifact

- phase key: `135`
- title: `Shared Command Runtime for CLI and MCP`
- objective: refactor CLI and MCP onto one canonical command runtime and add adapter parity tests;
- WBS rows: P135-T001 through P135-T005;
- non-goal: removing CLI.

Recommended planner prompts:

```text
Create a PlanArtifact for Phase 134 using MCP_PLAN.md. Preserve the read-only-first MCP strategy, MCP vs CLI policy, agent adoption layer, integration hardening tasks, and WBS tasks P134-T001 through P134-T024. The output should be ready for review-plan-artifact, accept-plan-artifact, and finalize-plan-to-phase.
```

```text
Create a PlanArtifact for Phase 135 using MCP_PLAN.md. Preserve the shared command runtime objective and WBS tasks P135-T001 through P135-T005. The output should be ready for review-plan-artifact, accept-plan-artifact, and finalize-plan-to-phase.
```

## 17. Unresolved decision register

These decisions must be finalized before implementation or during P134-T001.

```text
D01 — MCP server launch and transport model
D02 — Workspace binding and multi-root strategy
D03 — VS Code/dashboard MCP affordance level
D04 — MCP tool naming/versioning strategy
D05 — Schema source of truth for MCP tool contracts
D06 — Tool/resource boundary and freshness/cache policy
D07 — Output budget and expansion-ref strategy
D08 — Error taxonomy and fallback behavior
D09 — Mutation tool roadmap and first allowed mutation
D10 — Remote/network transport scope and auth posture
D11 — Platform instruction projection strategy
D12 — MCP audit log privacy/redaction policy
```

## 18. Done criteria

Phase 134 is done when:

- MCP architecture and security policy are documented;
- read-only MCP server starts locally;
- server launch and workspace binding are reliable;
- workspace trust/path boundaries are enforced;
- packet commands are exposed as bounded MCP tools;
- CAE guidance and memory recall are exposed through governed MCP surfaces;
- audit log, allowlist, privacy/redaction, and output budget controls exist;
- MCP tool descriptions are compact and agent-usable;
- `agent_start` / `capabilities` tools exist;
- freshness/cache/version metadata exists;
- prompt-injection handling exists for resources and memory;
- agent platform setup docs exist;
- dashboard prompts include MCP-first read/context guidance with CLI fallback;
- dashboard/extension shows MCP availability or setup status;
- user simulation can run MCP-mode and MCP-fallback scenarios;
- mutation tools remain disabled by default.

Phase 135 is done when:

- CLI and MCP use a shared command runtime;
- adapter formatting is separate from command execution;
- policy enforcement sits below adapters;
- CLI compatibility is preserved;
- MCP parity tests prove equivalent core outputs;
- selected mutation tools can be safely enabled behind policy controls.
