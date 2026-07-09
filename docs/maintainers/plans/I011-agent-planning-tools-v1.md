<!--
  Maintainer plan document rendered from unified IdeaPlan artifacts.
  Regenerate: pnpm exec wk run generate-plan-document '{"planId":"<uuid>"}'
  Source view: src/modules/documentation/views/plan-document.view.yaml
-->

# Agent Planning Tools v1

| Field | Value |
| --- | --- |
| Status | `accepted` |
| Idea ID | `I011` |
| Plan ID | `d0283a5e-a782-4700-83c0-7a5824d6dd3c` |
| Version | 3 |
| planRef | `plan-artifact:d0283a5e-a782-4700-83c0-7a5824d6dd3c` |
| Planning type | new-feature |

v1: CLI planner reads and authoring (flow-status, template, append/patch WBS) ship before MCP read wrappers (planner-packet, list-ideas, get-plan-artifact, plan-review-packet, finalize-preview-packet) plus agent_start routing. MCP stays read-only per ADR. Legacy build-plan interview deprecated and removed; primary planner-chat remains separate (no unification).

## Goals and non-goals

### Goals

- Agents complete Idea→Plan→Tasks without hand-editing files or slurping schemas/playbooks
- CLI planner commands ship before MCP wrappers for every v1 read surface
- Full P0 MCP read set in v1: planner-packet, list-ideas, get-plan-artifact, plan-review-packet, finalize-preview-packet
- Incremental plan authoring via append-wbs-row and patch-plan-artifact in v1
- Deprecate and remove legacy build-plan interview path; keep separate from primary planner-chat (no build-plan-for-idea)

### Non-goals

- MCP mutation tools — read-only MCP per ADR-mcp-adapter-boundary-v1; CLI owns all writes
- build-plan-for-idea unification with planner-chat
- Full WBS payload in planner-packet (truncated preview only)
- Generic wk run MCP passthrough

## WBS summary

| WBS ID | Title | Sizing | Depends on |
| --- | --- | --- | --- |
| `WBS-1` | get-planner-flow-status CLI | high | — |
| `WBS-2` | get-plan-artifact-template CLI | high | — |
| `WBS-3` | append-wbs-row CLI | medium | WBS-2 |
| `WBS-4` | patch-plan-artifact CLI | medium | WBS-2 |
| `WBS-5` | Register planner MCP output budgets | high | WBS-1, WBS-2 |
| `WBS-6` | workflow-cannon.planner-packet MCP read tool | medium | WBS-1, WBS-2, WBS-5 |
| `WBS-7` | workflow-cannon.list-ideas MCP read tool | high | WBS-5 |
| `WBS-8` | workflow-cannon.get-plan-artifact MCP read tool | high | WBS-5 |
| `WBS-9` | workflow-cannon.plan-review-packet MCP read tool | medium | WBS-5 |
| `WBS-10` | workflow-cannon.finalize-preview-packet MCP read tool | medium | WBS-5 |
| `WBS-11` | agent_start lightweight planner routing branch | high | WBS-6 |
| `WBS-12` | MCP/CLI parity tests for all planner read tools | high | WBS-6, WBS-7, WBS-8, WBS-9, WBS-10 |
| `WBS-13` | Deprecate and remove build-plan legacy path | medium | WBS-6 |
| `WBS-14` | wc-planner-chat skill pack and golden-path test | medium | WBS-11, WBS-12 |
| `WBS-15` | Dogfood I011 through accept and finalize preview | medium | WBS-3, WBS-4, WBS-12, WBS-14 |

## Risk register

- **R1** (medium): MCP output budget overflow. Mitigation: 20KB planner-packet; 16KB satellite read tools; truncation ladder in D3
- **R2** (low): agent_start bloat. Mitigation: Routing branch only; deep reads via planner-packet
- **R3** (medium): Legacy build-plan removal breaks existing consumers. Mitigation: Deprecation window; dashboard/build-plan session migration notes; keep paths separate not merged

## Assumptions

- Ideas module enabled in target workspaces
- Existing review-plan-artifact and finalize-plan-to-phase handlers remain canonical

## Acceptance

| Field | Value |
| --- | --- |
| Accepted at | 2026-07-09T07:14:53.965Z |
| Accepted by | phase-144-dogfood |
| Accepted version | 2 |

---

_Rendered from unified IdeaPlan v1 · status accepted · version 3 · updated 2026-07-09T07:14:54.035Z · source draft-plan-artifact_
