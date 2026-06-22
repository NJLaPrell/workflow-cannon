# Workflow Cannon MCP setup (agent platforms)

Machine-oriented setup for the read-only Workflow Cannon MCP server (`wk-mcp`). For adapter boundaries and tool policy, see **`.ai/adrs/ADR-mcp-adapter-boundary-v1.md`**. For when to prefer MCP vs CLI, see **`.cursor/rules/workspace-kit-mcp-first-context.mdc`**.

## MCP vs CLI

| Use MCP | Use CLI (`pnpm exec wk run …`) |
| --- | --- |
| Read-only packets: phase orchestration, execution packets, CAE guidance, memory list/precedence | Task lifecycle (`run-transition`), assignments, release/publish, git mutations |
| Bounded context discovery (`workflow-cannon.capabilities`) | Policy-gated commands requiring JSON `policyApproval` |
| Fresh structured JSON with CLI fallback in tool descriptions | Validation, build, test, and maintainer gates |

**Memory is advisory.** MCP memory tools return governed, source-cited recall — not live task-store truth. Confirm freshness metadata and fall back to CLI reads when MCP is unavailable, stale, or incomplete.

## Launch the server

Each process binds **one workspace root** at startup. Launch **one `wk-mcp` process per workspace folder**; do not share a single process across multi-root workspaces.

From a built Workflow Cannon checkout (this repo or an attached project with `wk-mcp` on PATH):

```bash
pnpm exec wk-mcp --workspace /absolute/path/to/workspace
```

Alternatives:

```bash
node dist/mcp/cli.js --workspace /absolute/path/to/workspace
WORKFLOW_CANNON_MCP_WORKSPACE=/absolute/path/to/workspace pnpm exec wk-mcp
```

Stdio transport only (JSON-RPC 2.0 over stdin/stdout). The server advertises **read-only** mode by default; mutation tools are disabled unless explicitly opted in (see [Mutation tools (opt-in)](#mutation-tools-opt-in) below).

### Healthy startup (verification)

Call `initialize` and confirm:

- `result.startup.healthy` is `true`
- `result.startup.mode` is `read-only`
- `result.startup.workspaceBinding.workspaceRoot` matches your workspace path
- `result.startup.workspaceBinding.multiWorkspaceBehavior.mode` is `single-workspace-per-process`

Quick local check (source checkout, after `pnpm run build`):

```bash
node --test test/mcp-server.test.mjs
```

## First MCP calls

1. **`workflow-cannon.agent_start`** — cold-start bootstrap: read-only mode, available tools, workflow-specific next steps (including Complete and Release → `phase-release-orchestration-state`).
2. **`workflow-cannon.capabilities`** — full read-only tool surface and descriptor contract.
3. **`workflow-cannon.phase-release-orchestration-state`** — phase release path classification (orchestrators).
4. **`workflow-cannon.agent-execution-packet`** — locked assignment / draft execution packets (workers).

Every tool description includes a **CLI fallback** (`pnpm exec wk run <command> '…'`) and **common mistakes**. Prefer MCP when fresh; use the embedded fallback when not.

Example packet read (CLI equivalent):

```bash
pnpm exec wk run phase-release-orchestration-state '{"phaseKey":"134"}'
```

## Platform-specific setup

### Cursor

Add a user or project MCP server entry pointing at `wk-mcp` with an explicit workspace root:

```json
{
  "mcpServers": {
    "workflow-cannon": {
      "command": "pnpm",
      "args": ["exec", "wk-mcp", "--workspace", "/absolute/path/to/your/project"],
      "cwd": "/absolute/path/to/your/project"
    }
  }
}
```

For this source checkout, `cwd` must be the repo root where `node_modules` resolves `wk-mcp`. In an **attached** consumer project, prefer `./.workspace-kit/bin/wk` paths from **`agent-bootstrap`** when the packaged layout differs.

**Verify:** open MCP tool list in Cursor; confirm `workflow-cannon.capabilities` and packet tools appear. Run a read-only tool and compare output to the CLI fallback in the tool description.

### Claude Code / Claude Desktop

Use the host’s MCP config file with the same `command` / `args` shape as Cursor. Set `cwd` to the workspace root and pass `--workspace` explicitly — do not rely on an ambiguous default `cwd` in multi-folder setups.

**Verify:** invoke `workflow-cannon.capabilities` from the host’s MCP panel; confirm `startup.workspaceBinding.workspaceRoot` in an `initialize` response matches the intended project.

### VS Code / other stdio MCP hosts

Any host that supports custom stdio MCP servers can use:

```json
{
  "command": "pnpm",
  "args": ["exec", "wk-mcp", "--workspace", "/absolute/path/to/workspace"],
  "cwd": "/absolute/path/to/workspace"
}
```

**Verify:** `tools/list` returns only `workflow-cannon.*` read tools (no `run-transition`, `update-task`, or memory mutation tools).

## Mutation tools (opt-in)

Mutation tools are **disabled by default** and hidden from `tools/list` unless explicitly enabled. CLI remains the canonical mutation surface.

### Enable

Set the environment variable before starting the MCP server:

```bash
WORKFLOW_CANNON_MCP_MUTATION_TOOLS=1 pnpm exec wk-mcp --workspace /path/to/workspace
```

Or for Cursor platform config, add `env` to your MCP server entry:

```json
{
  "mcpServers": {
    "workflow-cannon": {
      "command": "pnpm",
      "args": ["exec", "wk-mcp", "--workspace", "/absolute/path/to/your/project"],
      "cwd": "/absolute/path/to/your/project",
      "env": { "WORKFLOW_CANNON_MCP_MUTATION_TOOLS": "1" }
    }
  }
}
```

### Available mutation tools

When enabled, `tools/list` includes:

| Tool | Command | Required args | Notes |
| --- | --- | --- | --- |
| `workflow-cannon.run-transition` | `run-transition` | `taskId`, `action`, `policyApproval` | Task lifecycle transitions. Same runtime as CLI. |
| `workflow-cannon.write-memory` | `write-memory` | `category`, `body`, `policyApproval` | Creates draft memory records only. Use `approve-memory` via CLI to promote. |

### policyApproval requirement

Every mutation tool call **requires** a `policyApproval` object in the tool arguments:

```json
{
  "taskId": "T100737",
  "action": "start",
  "policyApproval": {
    "approvedBy": "agent",
    "reason": "starting T100737 delivery",
    "timestamp": "2026-06-22T09:42:00Z"
  }
}
```

Calls without `policyApproval` are rejected before the runtime is invoked. The `policyApproval` value is **redacted** from audit logs by the privacy-safe audit-redaction layer.

### Audit behavior

Mutation tool calls are audit-logged with:
- `toolName`, `command`, `resultClassification`
- `policyApprovalPresent: true/false` (presence only — value is redacted)
- `args` with all sensitive/prompt/file fields redacted

### ADR guardrail

See **`.ai/adrs/ADR-mcp-adapter-boundary-v1.md`** — Mutation Policy section. CLI remains required for release, publish, git, task reconciliation, and all policy-gated work outside this curated opt-in set.

## Fallback when MCP is unavailable

1. State the fallback in handoff/evidence.
2. Use **`pnpm exec wk run <command> '<json>'`** per tool descriptions or **`.ai/AGENT-CLI-MAP.md`**.
3. For session bootstrap: **`pnpm exec wk run agent-bootstrap '{}'`** or **`pnpm exec wk doctor --json`**.
4. Do not treat cached MCP resources or memory as authoritative task-store state.

## Related machine refs

- **`.ai/adrs/ADR-mcp-adapter-boundary-v1.md`** — adapter boundary
- **`.ai/AGENT-CLI-MAP.md`** — CLI tiers and copy-paste JSON
- **`.ai/POLICY-APPROVAL.md`** — mutation approval (CLI only for gated work)
- **`src/modules/task-engine/instructions/phase-release-orchestration-state.md`** — orchestration packet command
