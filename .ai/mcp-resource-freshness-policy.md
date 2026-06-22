# MCP Resource Freshness and Cache Policy

**Status:** Active  
**Date:** 2026-06-21  
**Task:** T100720  
**Phase:** 134  

## Summary

This document defines the freshness and cache authority rules for Workflow Cannon MCP tool results
and MCP resources. It establishes the tool/resource boundary and ensures agents do not treat
cached or stale outputs as authoritative current state.

## Tool / Resource Boundary

| Surface | Freshness | Authority |
| --- | --- | --- |
| MCP **tool** result | Live — computed at call time from current workspace state | Authoritative for the instant of invocation |
| MCP **resource** (static policy/ADR doc) | Static — content changes only on repository commits | Advisory; safe to cache for a session |
| MCP **memory** recall | Advisory — governed recall from the memory store | Not authoritative for current task/release state without CLI confirmation |

**Key rule:** Never treat a tool result computed in a prior invocation, a cached resource body, or a
memory-recalled value as current state without re-invoking the relevant tool or running the CLI
fallback command.

## Freshness Authority Levels

### `live`

Applies to **tool results** (all `workflow-cannon.*` tool calls except `agent_start` and
`capabilities`). The underlying command is executed against the current workspace state at call time.

- **Result validity:** Valid at the instant of invocation only.
- **Re-invocation:** Required if state may have changed (e.g., after a `run-transition` or PR merge).
- **Agent rule:** A tool result from a previous turn must not be assumed current. Re-invoke or use
  the CLI fallback before acting on state-critical data.

### `static`

Applies to **resource documents** exposed by the MCP server (policy docs, ADRs). Content is read
directly from the workspace repository files and changes only when those files change on disk.

- **Result validity:** Valid for the duration of the current repository commit.
- **Safe to cache:** Yes, within a session (suggested `max-age`: 86400 seconds).
- **Agent rule:** Static resources are documentation artifacts only. They are never authoritative
  for current task, assignment, release, or queue state.

### `advisory`

Applies to **memory recall** tool results and outputs that are aggregated or summarized from
multiple sources. These may reflect a recent but not guaranteed-current snapshot.

- **Result validity:** Not authoritative for task/release decisions without CLI confirmation.
- **Agent rule:** Treat advisory results as supporting context, not as the source of truth.
  Use `pnpm exec wk run` equivalents to confirm before acting.

## Freshness Envelope

Every MCP tool result envelope includes a `freshnessPolicy` field:

```json
{
  "freshnessPolicy": {
    "authority": "live",
    "note": "Tool results reflect current workspace state computed at call time. Re-invoke to get updated state.",
    "cliFallbackNote": "See expansionRefs for the equivalent CLI command."
  }
}
```

Every MCP resource read response includes a `freshnessEnvelope` field alongside the resource
`contents`:

```json
{
  "freshnessEnvelope": {
    "schemaVersion": 1,
    "authority": "static",
    "fetchedAt": "<iso8601 timestamp>",
    "cachePolicy": {
      "authority": "static",
      "maxAgeSeconds": 86400,
      "note": "Static policy document. Content changes on repository commits only."
    },
    "authorityNote": "This resource is a static documentation artifact. It is not authoritative for current task, assignment, release, or queue state."
  }
}
```

## Resource Registry

The Workflow Cannon MCP server exposes the following static resources:

| URI | File | Authority |
| --- | --- | --- |
| `workflow-cannon://resources/mcp-freshness-policy` | `.ai/mcp-resource-freshness-policy.md` | static |
| `workflow-cannon://resources/mcp-adapter-boundary` | `.ai/adrs/ADR-mcp-adapter-boundary-v1.md` | static |

These resources are read-only documentation. They do not reflect dynamic workspace state.
Use tool calls or CLI commands for any state-dependent queries.

## State-Like Tools: Freshness Requirements

The following tools return state-dependent results. Their results carry `authority: "live"` in
the freshness envelope. Agents must not rely on cached versions of these results:

| Tool | Command | Why state-like |
| --- | --- | --- |
| `workflow-cannon.phase-release-orchestration-state` | `phase-release-orchestration-state` | Reflects current phase drain, release path, and task counts |
| `workflow-cannon.agent-execution-packet` | `agent-execution-packet` | Reflects current assignment lock and task state |
| `workflow-cannon.assignment-reconciliation-preflight` | `assignment-reconciliation-preflight` | Reflects current handoff readiness |
| `workflow-cannon.phase-drain-delta` | `phase-drain-delta` | Reflects current phase task completion cursor |
| `workflow-cannon.phase-release-state` | `phase-release-state` | Reflects current release gate status |
| `workflow-cannon.release-closeout-result` | `release-closeout-result` | Reflects current closeout evidence |
| `workflow-cannon.memory-list` | `list-memory` | Reflects current approved memory records |

## Mutation Tool Boundary

MCP mutation tools are disabled in the default read-only profile. No tool result, resource body,
or memory recall value can authorize or substitute for CLI `policyApproval`-gated commands.
State-like tool results are informational — they describe workspace state; they do not modify it.

## Non-Goals

- Replacing CLI reads with cached resource bodies for task or release decisions.
- Treating resource documents as current-state truth.
- Using memory recall as a substitute for `pnpm exec wk run` task-store reads.

## Related References

- **`.ai/adrs/ADR-mcp-adapter-boundary-v1.md`** — adapter boundary and mutation policy
- **`.ai/MCP-SETUP.md`** — MCP server setup and platform configuration
- **`.cursor/rules/workspace-kit-mcp-first-context.mdc`** — MCP-first context policy for agents
- **`src/mcp/server.ts`** — server implementation (freshness envelope in `formatToolResult`)
