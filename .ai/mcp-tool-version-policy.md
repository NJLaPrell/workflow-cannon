# MCP Tool Version and Schema Policy

**Owned paths:** `src/mcp/`, `.ai/`
**Authority:** machine canon — agents and maintainers follow this document for MCP contract changes.

## Overview

Every Workflow Cannon MCP tool output envelope carries two version fields:

| Field | Constant | Meaning |
|---|---|---|
| `schemaVersion` | `MCP_ENVELOPE_SCHEMA_VERSION` | Version of the envelope wrapper shape itself. |
| `toolVersion` | Per-tool `toolSchemaVersion` (defaults to `MCP_DEFAULT_TOOL_SCHEMA_VERSION`) | Version of the individual tool's result contract. |

Both constants are exported from `src/mcp/index.ts` so test harnesses can import and assert them directly without hardcoding magic numbers.

## Versioning rules

### Envelope schema version (`schemaVersion`)

- Defined by `MCP_ENVELOPE_SCHEMA_VERSION` in `src/mcp/server.ts`.
- **Increment** when the top-level envelope shape changes in a way that existing consumers cannot handle transparently (e.g. renaming `result` to `payload`, removing `mode`, changing `tool` key semantics).
- **Do not increment** for additive fields (new top-level keys are backward-compatible as long as existing keys remain).
- All envelope paths (`formatToolResult`, `buildAgentStartPayload`, capabilities payload) must use the constant — never hardcode `1`.

### Tool schema version (`toolVersion`)

- Each `ReadOnlyMcpToolDefinition` may declare an explicit `toolSchemaVersion`. Omitting it defaults to `MCP_DEFAULT_TOOL_SCHEMA_VERSION` (currently `1`).
- **Increment** the per-tool version when the `result.data` shape for that tool changes in a breaking way (e.g. renamed key, removed field, changed type).
- **Do not increment** for additive `result.data` fields — consumers that ignore unknown keys remain compatible.
- When incrementing, update `toolSchemaVersion` in the definition and bump the version in this policy under the Changelog section below.

## Deprecation strategy

1. **Announce deprecation** — add a `deprecated` key to the tool definition's `governance.note` and update this policy. The tool remains functional.
2. **Parallel operation period** — deprecated tools stay in `packetReadTools` for at least one full phase (sprint) after announcement so consumers can migrate.
3. **Removal** — remove the tool from `packetReadTools` after the parallel period. The tool name is tombstoned: do not reuse it. Record the removal in the Changelog below.
4. **Renamed tools** — if a tool is renamed (breaking rename), treat the old name as deprecated per step 1–3 and add the new name simultaneously.

## Migration strategy

When `schemaVersion` or `toolVersion` increments:

1. **Code** — update `MCP_ENVELOPE_SCHEMA_VERSION` or the per-tool `toolSchemaVersion` in `src/mcp/server.ts`.
2. **Tests** — update version assertions in `test/mcp-server.test.mjs` to the new value.
3. **Consumers** — any agent or external harness pinned to the old version must be updated before the old version is removed. Search for `MCP_ENVELOPE_SCHEMA_VERSION` and `MCP_DEFAULT_TOOL_SCHEMA_VERSION` to find all assertion points.
4. **Changelog** — record the version bump in this document.

## Harness assertion pattern

Test files should import the version constants and assert them rather than hardcoding numbers:

```js
import {
  handleMcpRequest,
  MCP_ENVELOPE_SCHEMA_VERSION,
  MCP_DEFAULT_TOOL_SCHEMA_VERSION
} from "../dist/mcp/index.js";

// In a test:
assert.equal(envelope.schemaVersion, MCP_ENVELOPE_SCHEMA_VERSION);
assert.equal(envelope.toolVersion, MCP_DEFAULT_TOOL_SCHEMA_VERSION);
```

This ensures that a version bump in the source fails tests immediately, prompting the developer to update consumers intentionally.

## Planner MCP output budgets (architecture D3)

Planner read tools register in `MCP_TOOL_OUTPUT_BYTE_BUDGETS` (`src/mcp/output-budgets.ts`) **before** handlers ship in `src/mcp/server.ts`. Tool names are listed in `PLANNER_MCP_READ_TOOL_NAMES`.

| Tool | Byte budget | Role |
|---|---|---|
| `workflow-cannon.planner-packet` | 20 KiB (`MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET`) | Primary bootstrap packet (idea + session + directive + recommended next command) |
| `workflow-cannon.list-ideas` | 16 KiB (`MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET`) | Ideas inventory read |
| `workflow-cannon.get-plan-artifact` | 16 KiB | Bounded plan artifact read |
| `workflow-cannon.plan-review-packet` | 16 KiB | Review rubric preview (read-only) |
| `workflow-cannon.finalize-preview-packet` | 16 KiB | Finalize dry-run task draft preview |

Satellite budgets align with phase/release packet tools (16 KiB). `planner-packet` aligns with `workflow-cannon.agent-execution-packet` (20 KiB).

### Truncation ladder (overflow handling)

When a planner MCP response would exceed its registered byte budget, implementations apply this **deterministic field-drop order** (first applicable step wins; repeat until within budget or only protected fields remain):

1. **Drop ideation transcript** — remove long brainstorm ideation notes / transcript bodies from the packet.
2. **Reduce WBS preview** — shrink `wbsPreview` from max 5 rows to max 3 rows (retain `wbsId`, `title`, `dependsOn`, `sizingConfidence` on surviving rows).
3. **Drop brainstorm synthesis scores** — remove synthesized score blocks while keeping structural flow metadata.
4. **Never drop `recommendedNextCommand`** — orchestration argv and `readyRun` guidance must survive truncation.

Overflow envelopes must set `oversized: true` and include `expansionRefs` pointing at the equivalent CLI command so agents can expand out-of-band. Stress fixtures and CI overflow gates (WBS-16) prove the ladder before production registration.

## Changelog

| Date | Constant | Old | New | Reason |
|---|---|---|---|---|
| 2026-06-21 | `MCP_ENVELOPE_SCHEMA_VERSION` | (implicit 1) | 1 | Initial policy — made implicit hardcoded `1` explicit and exported. |
| 2026-06-21 | `MCP_DEFAULT_TOOL_SCHEMA_VERSION` | (none) | 1 | Initial policy — per-tool version field added to all tool output envelopes. |
