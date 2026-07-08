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
| Version | 23 |
| planRef | `plan-artifact:d0283a5e-a782-4700-83c0-7a5824d6dd3c` |
| Planning type | new-feature |

v1: CLI planner reads and authoring (flow-status, template, append/patch WBS) ship before MCP read wrappers (planner-packet, list-ideas, get-plan-artifact, plan-review-packet, finalize-preview-packet) plus agent_start routing. MCP stays read-only per ADR. Legacy build-plan interview deprecated and removed; primary planner-chat remains separate (no unification).

## Brainstorm synthesis

| Dimension | Score | Band |
| --- | ---: | --- |
| Value | 7.97 | **green** |
| Risk | 3.09 | **green** |
| Effort | 6.2 | **amber** |
| Confidence | 8.3 | **green** |
| Priority | — | — |

## Brainstorm session history

| # | Session ID | Started | State | Value | Priority |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `bsess-cffc3fb0-a703-4966-9716-718c69355999` | 2026-07-08 15:55:24 | completed | 7.85 | 66 |
| 2 | `bsess-1bec0a93-377c-4f8d-ad19-7d760422a3c6` | 2026-07-08 16:13:55 | completed | 8.05 | 77 |

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
| `WBS-12` | MCP/CLI parity test — workflow-cannon.planner-packet | high | WBS-6 |
| `WBS-26` | MCP/CLI parity test — workflow-cannon.list-ideas | high | WBS-7 |
| `WBS-27` | MCP/CLI parity test — workflow-cannon.get-plan-artifact | high | WBS-8 |
| `WBS-28` | MCP/CLI parity test — workflow-cannon.plan-review-packet | high | WBS-9 |
| `WBS-29` | MCP/CLI parity test — workflow-cannon.finalize-preview-packet | high | WBS-10 |
| `WBS-30` | Planner MCP parity CI gate wiring | high | WBS-12, WBS-26, WBS-27, WBS-28, WBS-29 |
| `WBS-13` | Deprecate build-plan legacy path (warnings only) | medium | T100821, WBS-31 |
| `WBS-14` | wc-planner-chat skill pack (adoption docs only) | medium | T100826 |
| `WBS-15` | Dogfood I011 through accept and finalize preview | medium | T100818, T100819, WBS-25, WBS-14 |
| `WBS-16` | MCP truncation stress fixtures + overflow tests | medium | WBS-5, WBS-6 |
| `WBS-18` | Legacy build-plan consumer inventory (audit doc only) | medium | T100821 |
| `WBS-20` | Planner flow contract tests (three state machines) | medium | WBS-1 |
| `WBS-22` | append/patch conflict + idempotency test matrix | medium | WBS-3, WBS-4 |
| `WBS-24` | Remove build-plan after golden-path + dogfood gate | medium | WBS-13, WBS-25, WBS-15 |
| `WBS-25` | Planner golden-path agent integration test | medium | T100832, WBS-14 |
| `WBS-31` | build-plan deprecation shim (warnings + dashboard copy) | medium | WBS-18 |

## Risk register

- **R1** (low): MCP planner-packet or satellite read tools exceed registered output budgets on large IdeaPlans. Mitigation: D3 budgets (20KB planner-packet, 16KB satellites) plus WBS-16 truncation stress fixtures and CI overflow gate prove deterministic ladder before release
- **R2** (low): agent_start planner routing branch duplicates packet payload and exceeds bootstrap budget. Mitigation: D2 routing-only branch per WBS-11; deep context via planner-packet; acceptance criteria enforce six kilobyte routing metadata budget
- **R3** (medium): build-plan legacy removal breaks dashboard or extension consumers before replacement tools are proven. Mitigation: WBS-18 consumer inventory and deprecation shim before WBS-13 warnings; WBS-24 deletion gated on WBS-14 golden-path test and WBS-15 I011 dogfood
- **R4** (low): IdeaPlan document status, planning chat session, and Ideas row status drift without operator visibility. Mitigation: WBS-20 three state-machine contract tests plus WBS-1 get-planner-flow-status mismatch reporting in continuous integration
- **R5** (medium): append-wbs-row or patch-plan-artifact corrupts draft or loses updates under version or generation conflicts. Mitigation: WBS-22 conflict and idempotency test matrix covers plan-artifact-version-conflict, planning-generation-mismatch, and clientMutationId replay
- **R6** (low): MCP planner read tools drift from CLI handler JSON envelopes after merge. Mitigation: Per-tool parity rows WBS-12 and WBS-26–29 plus WBS-30 CI gate; each row sized for cheap_fast subagent (composer-2.5)
- **R7** (medium): Agents mutate with stale planningGeneration after MCP read-only session without refreshing flow-status. Mitigation: planner-packet and get-planner-flow-status surface planningGeneration and recommendedNextCommand; Tier B commands reject mismatch with explicit error code
- **R8** (medium): Twenty-six-row WBS scope slips or overloads subagents without model-tier discipline. Mitigation: Phase 143 ships core stack in parallel waves (CLI reads → authoring → MCP wrappers → per-tool parity); Phase 144 owns legacy and dogfood; each WBS carries recommend-model dispatch hints

## Assumptions

- Ideas module and unified IdeaPlan documents are enabled in target workspaces
- Existing review-plan-artifact, accept-plan-artifact, and finalize-plan-to-phase handlers remain canonical mutation paths
- MCP stays read-only for planner commands in v1 per ADR-mcp-adapter-boundary-v1 and operator decision D8
- CLI handlers are built and tested (`pnpm run build`) before MCP wrapper registration ships
- planningGeneration policy remains require on Tier B planner mutations; agents refresh token after long MCP read sessions
- Workflow Cannon MCP server is available in Cursor for dogfood of read tools; CLI fallback suffices when MCP is disabled
- No SQLite task-store schema changes are required for planner read packets or incremental authoring commands
- build-plan interview callers can tolerate deprecation warnings for at least one phase slice before WBS-24 removal
- Orchestrator agents call recommend-model before Cursor Task subagent spawn using scope signals from each WBS riskNotes
- Default subagent model is composer-2.5 (cheap_fast) per .ai/cursor-model-selection-map.v1.json; balanced tier (gpt-5.3-codex) only for Tier B authoring, golden-path harness, and legacy shim rows
- Each WBS row is scoped for one subagent session (typically one test file or one CLI command module) unless explicitly marked as orchestrator-only
- Phase 143 parallel waves complete before Phase 144 dogfood; WBS-24 removal never starts in 143

## Review

| Field | Value |
| --- | --- |
| Passed | yes |
| Blockers | 0 |
| Warnings | 0 |
| Open questions | 0 |
| Reviewed at | 2026-07-08T17:30:36.176Z |

## Acceptance

| Field | Value |
| --- | --- |
| Accepted at | 2026-07-08T17:30:42.774Z |
| Accepted by | operator |
| Accepted version | 17 |

## Delivery references

| Field | Value |
| --- | --- |
| Delivered at | — |
| Phase key | 144 |
| Task count | 7 |

**Task refs:**
- `T100836`
- `T100837`
- `T100838`
- `T100839`
- `T100840`
- `T100841`
- `T100842`

---

_Rendered from unified IdeaPlan v1 · status accepted · version 23 · updated 2026-07-08T16:58:17.812Z · source draft-plan-artifact_
