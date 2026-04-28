# Agent-facing task DB contract

**Contract version:** `1`  
**Package type surface:** `@workflow-cannon/workspace-kit/contracts/agent-task-read-contract`  
**JSON Schema:** `schemas/agent-task-read-contract.v1.json`

This is the stable read contract agents should use for normal task workflows. It deliberately sits above the task-engine persistence layout: current storage may use relational SQLite rows, compatibility blob mirrors, or both, but agents should not parse raw SQLite tables, `workspace_planning_state` blobs, `metadata_json`, `depends_on_json`, `unblocks_json`, `transition_log_json`, or `mutation_log_json` for routine work.

## Read Surfaces

| Agent need | Current command | Contract model |
| --- | --- | --- |
| Pick the next task | `pnpm exec wk run get-next-actions '{}'` | `AgentTaskNextActions` |
| List/filter tasks | `pnpm exec wk run list-tasks '<filters>'` | `AgentTaskListItem[]` plus `AgentTaskReadEnvelope` |
| Inspect one task | `pnpm exec wk run get-task '{"taskId":"T991"}'` | `AgentTaskDetail` |
| Audit ready queue health | `pnpm exec wk run queue-health '{}'` or `list-tasks` with `includeQueueHints` | `AgentTaskQueueHint` and `AgentTaskPhaseRef` |
| Inspect dependency graph | `pnpm exec wk run get-dependency-graph '{}'` | `AgentTaskDependencyEdge[]` |
| Inspect evidence/history | `get-task-history`, `get-recent-task-activity`, `phase-delivery-preflight` | `AgentTaskEvidencePointer[]` |
| Render dashboard/UI summaries | `pnpm exec wk run dashboard-summary '{}'` | `AgentTaskListItem` projections embedded in UI-specific rollups |

These commands may keep their existing response shape during the compatibility window. New fields should be additive. When a command cannot yet return the exact model, it should expose an explicit compatibility projection or document the gap in this runbook before a follow-on task depends on it.

## Required Model Fields

`AgentTaskListItem` is the common row shape. It includes:

- identity: `id`, `title`, `status`, `type`, `priority`, `archived`, timestamps
- phase: `phaseKey`, human `phase`, and `phaseAligned`
- routing: `ownership`, `queueNamespace`, feature slugs, source, and a boolean marker for module metadata
- dependencies: `dependsOn`, `unblocks`, and normalized dependency `edges`
- queue hints: dependency-blocked state, unmet dependencies, and an explicit blocked reason
- evidence pointers: delivery evidence, latest transition, and latest mutation

`AgentTaskDetail` extends the row with implementation guidance: `summary`, `description`, `approach`, `risk`, `technicalScope`, `acceptanceCriteria`, and recent evidence.

`AgentTaskNextActions` wraps the ready queue, `suggestedNext`, counts, and blocking analysis in the same row model.

`AgentTaskReadEnvelope<T>` records `ok`, `code`, `data`, `planningGeneration`, and `planningGenerationPolicy` so agents know whether a later mutation needs optimistic-lock input.

## Empty And First-Run Behavior

Agent-facing reads should succeed for empty or first-run workspaces:

- task arrays return `[]`
- optional single task projections return `null`
- `planningGeneration` returns the current integer when the planning store exists, else `null` only for commands that can run before store initialization
- `planningGenerationPolicy` returns `"off"`, `"warn"`, `"require"`, or `null` only before policy resolution
- missing delivery evidence is `null`, not an error
- missing dependency targets are represented as dependency edges with `dependencyStatus: "missing"` when the edge is otherwise known

Do not convert “no ready work”, “no evidence yet”, or “new DB” into stack traces or ambiguous command failures. Save the failure path for unreadable storage, invalid filters, or corrupt state that the caller must fix.

## Compatibility Rules

- Existing `get-next-actions`, `list-tasks`, and `get-task` consumers remain compatible. Contract adoption must be additive unless a migration task explicitly documents a breaking plan.
- Raw `metadata` is not part of `AgentTaskListItem`; common routing fields should be promoted into `routing` or another named projection.
- `dependsOn` remains the semantic source relationship. `unblocks` is a reverse/compatibility projection and must not become a competing source of truth.
- Relational SQLite stores normalize dependency edges in `task_engine_dependencies`. CLI reads still expose additive `dependsOn`, `unblocks`, and `dependencyEdges` projections so agents do not need to inspect the table directly.
- Evidence pointers identify where details can be fetched without embedding every transition or mutation row in list responses.
- SQLite views are allowed for performance, but CLI JSON remains the default agent interface because it carries policy, planning generation, and remediation context.

## Follow-On Task Expectations

Phase 75 schema tasks should cite this contract when changing storage internals:

- dependency normalization must preserve `AgentTaskDependencyEdge`
- evidence table migration must preserve `AgentTaskEvidencePointer`
- promoted metadata work must feed `AgentTaskRoutingMetadata`
- constraint tightening must keep empty/first-run envelopes stable
- blob hot-path retirement must not remove fields from the v1 read models

If a future phase needs a breaking change, publish a v2 schema/type surface and keep v1 available for at least one compatibility window.
