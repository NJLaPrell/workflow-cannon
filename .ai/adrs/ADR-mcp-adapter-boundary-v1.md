# ADR: MCP adapter boundary v1

**Status:** Accepted for Phase 134 implementation guidance  
**Date:** 2026-06-06  
**Task:** T100709  
**Phase:** 134  

## Context

Workflow Cannon currently relies on the CLI as the canonical agent and maintainer execution surface for task lifecycle, release orchestration, validation, policy approval, and package/git operations. The Dashboard provides an operator-facing adapter that presents status, launches workflows, and shapes prompts around that same underlying system.

Phase 134 adds a Model Context Protocol (MCP) access layer for agent hosts. MCP is valuable because agents can retrieve structured packets, context, CAE guidance, memory recall, resources, and prompts without broad file discovery or brittle command parsing. That value does not make MCP a replacement for the CLI. Workflow Cannon still needs the CLI for humans, CI, shell workflows, mutation commands, release automation, local debugging, non-MCP hosts, and policy-gated execution.

The architecture must avoid creating a second implementation of Workflow Cannon behavior. CLI, MCP, Dashboard, and any future HTTP or automation surfaces must be adapters over one canonical command/runtime core.

## Decision

Workflow Cannon MCP is an adapter beside CLI and Dashboard, not a CLI replacement.

The target architecture is:

```text
One canonical Workflow Cannon command/runtime core
  -> CLI adapter
  -> MCP adapter
  -> Dashboard adapter
  -> future HTTP/automation adapters when needed
```

The CLI remains the default surface for mutation, execution, validation, release, git/package, and policyApproval-gated work. MCP starts as a read-only-first agent integration surface for bounded context and guidance. Dashboard remains an operator adapter that may surface MCP status and generate MCP-first read/context prompts, while still relying on canonical Workflow Cannon policy and runtime behavior.

## Adapter Boundaries

### Canonical Runtime

The command/runtime core owns Workflow Cannon semantics:

- task and assignment lifecycle rules
- packet and reconciliation contracts
- policyApproval enforcement
- audit behavior
- path and workspace trust boundaries
- schema and version contracts
- validation and release gate semantics

Adapters may expose those capabilities, but they must not redefine them. Any behavior visible through MCP must either call the same command handlers as CLI/Dashboard or be an intentionally bounded read wrapper until shared runtime parity exists.

### CLI Adapter

The CLI remains required for:

- `register-assignment`
- `run-transition`
- `submit-assignment-handoff`
- task reconciliation and completion commands
- validation commands such as check, test, parity, and pre-merge gates
- git and package operations
- commands requiring policyApproval
- local debugging and script/CI usage

Agents should continue to use CLI for mutation and execution by default, even when MCP is available.

### MCP Adapter

MCP is the preferred agent-facing adapter for read/context operations when available. Initial MCP scope includes structured reads such as:

- agent startup and capabilities
- phase release orchestration state
- locked agent execution packets
- assignment reconciliation preflight packets
- phase drain delta and release state
- release closeout result reads
- CAE guidance
- governed memory recall
- architecture summaries and instruction/resource references

MCP tool and resource results must be bounded, versioned, and freshness-aware. Memory and resource outputs are advisory unless a live tool result explicitly marks them current and fresh.

### Dashboard Adapter

The Dashboard remains an operator-facing adapter over the canonical runtime. It may:

- show MCP configured/available/unavailable/wrong-workspace status
- launch agents with MCP-first read/context guidance
- display whether the current workflow is MCP-first or CLI fallback
- preserve visible policyApproval expectations for elevated actions

Dashboard prompt language must align with the same adapter policy: use MCP for reads when available, use CLI for mutation and validation, and report fallback explicitly.

## Read-Only-First Scope

Default MCP mode is read-only. MCP should expose packet, context, memory, CAE, and state summary reads before any mutation tool exists.

Read-only MCP tools must:

- require explicit identifiers such as `phaseKey`, `taskId`, or `assignmentId` where applicable
- return compact, schema-versioned outputs
- include tool version and freshness metadata for state-like results
- include cache policy for resource-like outputs
- enforce trusted workspace and path boundaries
- mark untrusted external content as data, not instructions
- avoid secrets, prompt dumps, full file dumps, and unbounded logs
- provide CLI fallback guidance in tool descriptions

If freshness cannot be proven, the result must say so. Stale or cached resources must not be treated as current task, assignment, release, or memory truth.

## Mutation Policy

MCP mutation tools remain disabled by default for Phase 134.

Mutation stays CLI/default until all of the following are proven:

- CLI and MCP call the same shared command/runtime handlers
- policyApproval enforcement is identical across adapters
- every mutation call is audit logged with privacy-safe redaction
- workspace trust, path boundaries, and multi-root behavior are enforced
- schemas are generated or checked from one source of truth
- CLI/MCP/Dashboard adapter parity gates cover command shape and behavior
- failure and recovery behavior is predictable through a shared error taxonomy

When MCP mutations are later considered, they must be selected narrowly, opt-in, and policy-gated. MCP must not bypass task lifecycle, assignment lifecycle, release gates, package safety, git safety, publish safeguards, workspace trust, or path boundaries.

## Agent Adoption Layer

MCP support is not complete when tools merely exist. Agents need explicit adoption guidance so they can choose the right adapter without re-reading large runbooks.

Phase 134 must provide:

- agent-facing MCP usage rules
- high-quality tool descriptions
- an `agent_start` or capabilities bootstrap path
- CLI fallback commands for each relevant tool
- freshness and staleness language in tool outputs
- dashboard prompt language that prefers MCP for read/context
- platform setup examples for supported agent hosts
- MCP unavailable and fallback behavior in user simulation harnesses

Default agent behavior is:

```text
If Workflow Cannon MCP tools are available, use MCP for read/context packet calls.
Use CLI for mutation, validation, git, package, publish, and policyApproval-gated commands.
If MCP is unavailable, fall back to CLI and report the fallback.
Never treat MCP memory or resources as current-state truth unless the result is explicitly live and fresh.
```

## Integration Hardening Layer

MCP also requires integration hardening before it can be trusted as a routine agent surface. Phase 134 hardening includes:

- dashboard MCP status and setup affordances
- workspace binding verification
- workspace trust and path boundary enforcement
- explicit multi-root behavior
- bounded output budgets and expansion references
- predictable error taxonomy and retry guidance
- privacy-safe audit logs and redaction rules
- schema source-of-truth and generation/parity checks
- prompt-injection handling for resources and memory
- platform instruction alignment across generated agent instructions

These concerns are part of the adapter boundary, not optional documentation. Without them, MCP risks becoming a parallel context-bloat path or an unsafe bypass around the CLI's established policy and lifecycle controls.

## Consequences

- MCP implementation work must start with read-only packet/context tools and security controls.
- CLI remains the canonical fallback and default mutation surface.
- Dashboard and generated prompts must not imply that MCP replaces CLI.
- Future shared runtime work should reduce duplication between adapters, not shift authority to MCP.
- Mutation-tool design can proceed only as a later, gated layer after shared runtime, audit, policyApproval, and parity evidence exist.

## Non-Goals

- Replacing the CLI with MCP.
- Exposing broad filesystem access through MCP resources.
- Treating MCP memory recall as authoritative current state.
- Adding default-enabled MCP mutation tools in Phase 134.
- Maintaining separate CLI and MCP implementations of command semantics.

## Acceptance Mapping

| Acceptance criterion | ADR coverage |
| --- | --- |
| Architecture states MCP does not replace CLI. | Decision, Adapter Boundaries, Consequences, Non-Goals |
| Read-only-first and mutation policy are documented. | Read-Only-First Scope, Mutation Policy |
| Agent adoption and integration-hardening layers are explicit. | Agent Adoption Layer, Integration Hardening Layer |
