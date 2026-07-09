<!--
  Maintainer plan document rendered from unified IdeaPlan artifacts.
  Regenerate: pnpm exec wk run generate-plan-document '{"planId":"<uuid>"}'
  Source view: src/modules/documentation/views/plan-document.view.yaml
-->

# Improve Dashboard Loading & Sync (Phase 1 first paint)

| Field | Value |
| --- | --- |
| Status | `accepted` |
| Idea ID | `I012` |
| Plan ID | `60075304-3c0c-46c6-9c8f-468dd8ef6379` |
| Version | 16 |
| planRef | `plan-artifact:60075304-3c0c-46c6-9c8f-468dd8ef6379` |
| Planning type | change |

Stabilize dashboard first paint with a single startup controller, off-critical-path service start, CLI-primary cold bootstrap (cache opportunistic), quiet service promote for steady-state, and a ≤3s overview cold-path SLA. Defer poller fanout, mutation patches, and slice fingerprints.

## Brainstorm synthesis

| Dimension | Score | Band |
| --- | ---: | --- |
| Value | 7.95 | **green** |
| Risk | 3.24 | **green** |
| Effort | 4.52 | **amber** |
| Confidence | 8.21 | **green** |
| Priority | — | — |

## Brainstorm session history

| # | Session ID | Started | State | Value | Priority |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `bsess-731063fd-bb15-4ac5-a208-703723dcbfb3` | 2026-07-09 17:54:47 | completed | 7.55 | 63 |
| 2 | `bsess-f37aa604-d59b-4838-ae9e-6a1907720a76` | 2026-07-09 17:59:35 | completed | 8.05 | 77 |
| 3 | `bsess-cc349d7e-4caf-420d-9ade-7d3f9d082d0c` | 2026-07-09 18:06:56 | completed | 8.05 | 78 |

## Goals and non-goals

### Goals

- Dashboard overview becomes usable within 3 seconds of shell paint when the service is cold or unavailable
- Exactly one startup owner coordinates shell paint, bootstrap, retries, and webview boot/ready/timeout/refresh
- Cold first paint uses CLI bootstrap as the guaranteed path; last-good cache only if already reusable
- When the service is already healthy or becomes healthy after first paint, prefer service reads without regressing the painted overview

### Non-goals

- Command-level poller fanout across slices
- Authoritative mutation changedSlices contracts
- Replacing store equality with per-slice fingerprints
- Full rewrite to a single read owner that removes CLI dual-path entirely
- Building new last-good cache infrastructure unless an existing reusable cache can be wired cheaply

## WBS summary

| WBS ID | Title | Sizing | Depends on |
| --- | --- | --- | --- |
| `WBS-1` | Add DashboardStartupController and route startup messages through it | high | — |
| `WBS-2` | Cold-path bootstrap: CLI-primary with opportunistic cache and thin adapter | medium | WBS-1 |
| `WBS-3` | Background service start and quiet promote to service-primary steady-state | medium | WBS-1, WBS-2 |
| `WBS-4` | Prove ≤3s cold-path first-paint SLA with deterministic tests | high | WBS-1, WBS-2, WBS-3 |

## Risk register

- **R-1** (high): Existing startup call sites may still trigger parallel full renders if not fully routed through the controller.. Mitigation: Inventory webview boot/ready/timeout/refresh and extension startup entrypoints; make them request retry through the controller only.
- **R-2** (medium): CLI bootstrap latency could approach or exceed the 3s budget on a cold machine.. Mitigation: Keep bootstrap payload overview-minimal; measure in stubbed tests; use opportunistic cache only if already cheap.
- **R-3** (medium): Service promote after first paint could flash or regress overview if it forces a full restart render.. Mitigation: Promote must patch/hydrate quietly; never restart the startup pipeline after overview is usable.

## Assumptions

- A lightweight CLI/bootstrap snapshot path already exists and can supply overview fields
- No active kit phase is currently set; finalize target phase will be chosen at task materialization time
- 3s SLA is wall-clock from shell paint to usable overview under stubbed cold-service conditions in tests, and a practical target in normal local use
- Resolved: usable overview for the 3s SLA is phase/status line, queue counts (ready/in-progress/blocked), and no stuck loading shell; Ideas/detail may hydrate later. Exact field names follow the current overview slice shape during implementation without expanding the acceptance bar.
- Resolved: day-one cold path is CLI-primary; last-good cache is opportunistic only if already reusable. Phase 1 does not build new cache infrastructure; CLI-only cold path is acceptable.

## Review

| Field | Value |
| --- | --- |
| Passed | yes |
| Blockers | 0 |
| Warnings | 0 |
| Open questions | 0 |
| Reviewed at | 2026-07-09T18:19:12.299Z |

## Acceptance

| Field | Value |
| --- | --- |
| Accepted at | 2026-07-09T18:19:16.000Z |
| Accepted by | operator |
| Accepted version | 15 |

---

_Rendered from unified IdeaPlan v1 · status accepted · version 16 · updated 2026-07-09T18:17:17.055Z · source draft-plan-artifact_
