# Schema source-of-truth and generation pipeline

**Phase:** 134  
**Task:** T100729  
**Status:** Accepted

## Problem

Workflow Cannon exposes behavior through multiple adapter surfaces — CLI, MCP, Dashboard, and potentially future HTTP surfaces. Each surface needs its own input-validation shapes (JSON Schema, TypeScript contracts, CLI arg contracts, MCP `inputSchema`). Without a single source of truth and a generation/check pipeline, these shapes diverge silently over time.

## Source-of-truth hierarchy

| Artifact | Source of truth | Derived from |
| --- | --- | --- |
| TypeScript contracts (`src/contracts/*.ts`) | TypeScript source | Authored by hand; single canonical definition |
| CLI command arg contracts (`schemas/task-engine-run-contracts.schema.json`) | JSON Schema (checked into repo) | Maintained alongside TypeScript; validated by CI |
| Agent CLI snippets (`.ai/agent-cli-snippets/by-command/*.json`) | Generated | `pnpm run build && node scripts/generate-agent-cli-snippets.mjs` |
| Pilot run-args snapshot (`schemas/pilot-run-args.snapshot.json`) | Generated | `node scripts/refresh-pilot-run-args-snapshot.mjs` |
| MCP tool inputSchema snapshot (`schemas/mcp-tool-schema-snapshot.json`) | Generated | `pnpm run build && node scripts/generate-mcp-tool-schema-snapshot.mjs` |

**TypeScript is the upstream source.** JSON schemas and generated snapshots are downstream artifacts — they must be regenerated when TypeScript contracts change.

## MCP inputSchema pipeline

MCP tool input schemas live in `src/mcp/server.ts` as TypeScript code (using `objectSchema()` / `passthroughObjectSchema()` helpers). They are not hand-maintained JSON files — the TypeScript definition is the source of truth.

```
src/mcp/server.ts (ReadOnlyMcpToolDefinition.inputSchema)
  → pnpm run build → dist/mcp/index.js
    → node scripts/generate-mcp-tool-schema-snapshot.mjs
      → schemas/mcp-tool-schema-snapshot.json
        ← node scripts/check-mcp-tool-schema-snapshot.mjs (CI drift gate)
```

The committed `schemas/mcp-tool-schema-snapshot.json` is the agreed-upon shape. CI fails if the live server emits different tool names or inputSchemas than the snapshot, or if any MCP tool's inferred CLI command is absent from `builtin-run-command-manifest.json`.

## CLI / MCP / Dashboard adapter agreement

`check-mcp-tool-schema-snapshot.mjs` enforces that every MCP tool's CLI fallback command name (parsed from the description) is registered in `src/contracts/builtin-run-command-manifest.json`. This ensures CLI and MCP adapters agree on which commands exist.

Separately, `check-agent-cli-snippets.mjs` ensures each command in the manifest has a matching schema-only snippet under `.ai/agent-cli-snippets/`, and `check-task-engine-run-contracts.mjs` ensures the task-engine command arg contracts are consistent.

Together, these gates close the loop:

```
builtin-run-command-manifest.json
  ← check-builtin-command-manifest.mjs (command handlers)
  ← check-task-engine-run-contracts.mjs (CLI arg contracts)
  ← check-agent-cli-snippets.mjs (agent CLI snippet freshness)
  ← check-mcp-tool-schema-snapshot.mjs (MCP tool command cross-check + inputSchema drift)
```

## Regeneration commands

After changing MCP tool definitions or adding new tools:

```bash
pnpm run build && node scripts/generate-mcp-tool-schema-snapshot.mjs
```

After changing CLI command arg contracts:

```bash
node scripts/refresh-pilot-run-args-snapshot.mjs
pnpm run build && node scripts/generate-agent-cli-snippets.mjs
```

After any of the above, re-run `pnpm run check` to verify all gates pass.

## Drift gate IDs in `pnpm run check`

| Stage id | Script | Guards |
| --- | --- | --- |
| `command-manifest` | `check-builtin-command-manifest.mjs` | Handler registration |
| `task-engine-contracts` | `check-task-engine-run-contracts.mjs` | CLI arg contracts vs schema |
| `pilot-run-args-snapshot` | `check-pilot-run-args-snapshot.mjs` | Pilot snapshot freshness |
| `agent-cli-snippets` | `check-agent-cli-snippets.mjs` | Agent CLI snippet freshness |
| `mcp-tool-schema-snapshot` | `check-mcp-tool-schema-snapshot.mjs` | MCP inputSchema + CLI command cross-check |

## Related ADRs and policies

- `.ai/adrs/ADR-mcp-adapter-boundary-v1.md` — MCP adapter boundary, read-only-first, mutation policy
- `.ai/adrs/ADR-command-contract-registry-v1.md` — command contract registry
- `src/contracts/builtin-run-command-manifest.json` — canonical list of wired commands
- `schemas/task-engine-run-contracts.schema.json` — task-engine CLI arg contracts
