<!--
  Maintainer plan document rendered from unified IdeaPlan artifacts.
  Regenerate: pnpm exec wk run generate-plan-document '{"planId":"<uuid>"}'
  Source view: src/modules/documentation/views/plan-document.view.yaml
-->

# User Editable CAE Artifact Library

| Field | Value |
| --- | --- |
| Status | `accepted` |
| Idea ID | `I013` |
| Plan ID | `fc42031e-d3e6-44f7-9989-4676c366ad6c` |
| Version | 19 |
| planRef | `plan-artifact:fc42031e-d3e6-44f7-9989-4676c366ad6c` |
| Planning type | change |

Reshape the Dashboard CAE Artifacts surface into a Dual-surface Library for all six CAE types: list defaults + workspace copies, Open/Reveal/Copy/Create file-first under .ai/cae/artifacts/, no webview body editor, soft empty-state hints, no auto-activation or hide/override stubs in v1. Single host: Dashboard CAE tab (no standalone Guidance panel).

## Brainstorm synthesis

| Dimension | Score | Band |
| --- | ---: | --- |
| Value | 7.1 | **green** |
| Risk | 2.02 | **green** |
| Effort | 3.4 | **green** |
| Confidence | 8.63 | **green** |
| Priority | — | — |

## Brainstorm session history

| # | Session ID | Started | State | Value | Priority |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `bsess-e9d5907c-8ea5-414d-a245-973be057e159` | 2026-07-13 17:31:07 | completed | 7.1 | 74 |
| 2 | `bsess-37f1fd04-65cf-4e45-927b-ae01a0936bb7` | 2026-07-13 21:33:50 | completed | 7.1 | 77 |
| 3 | `bsess-f7bcc859-8a99-4161-bfed-0b7a46e3a2e6` | 2026-07-13 23:06:07 | completed | 7.1 | 78 |

## Goals and non-goals

### Goals

- Operators can discover cae.* and workspace.* artifacts for all six CAE types from one Library surface
- Operators open and edit workspace artifact bodies in the real editor, not a webview markdown textarea
- Operators can Copy default→workspace or Create workspace artifacts with identity-only input, then land in the editor
- Empty-state and Reveal teach the shared .ai/cae/artifacts/ tree without hard-gating browse

### Non-goals

- Migrate shipped cae.* default body paths into .ai/cae/artifacts/
- In-webview markdown body editor for artifact content
- New standalone Library module
- Standalone Guidance Authoring panel / dual-host Library
- Auto-create or draft-activate on Create/Duplicate
- Hide-default / remove-override mutators in v1
- Separate lighter Dashboard card besides the reshaped CAE tab
- Guidance-pack import / activation rebind after duplicate (post-v1)

## WBS summary

| WBS ID | Title | Sizing | Depends on |
| --- | --- | --- | --- |
| `WBS-1` | Library list reshape — framing, strip editor, remove stubs | high | — |
| `WBS-2` | Create/Duplicate identity drawer + auto-open file | high | WBS-1 |
| `WBS-3` | Reveal dual targets + soft empty-state/bootstrap hints | high | WBS-1 |
| `WBS-4` | Library regression coverage + in-product notes | high | WBS-2, WBS-3 |

## Risk register

- **R1** (medium): Scope creep into activation rebind or hide/override mutators. Mitigation: Parked as post-v1; v1 acceptance explicitly excludes them
- **R2** (medium): Dashboard CAE Library reshape regresses embedded authoring mutations or list filters while stripping the webview editor. Mitigation: Keep shared guidance render modules but ship only via Dashboard CAE tab; regression tests for Open/Create/Duplicate/list filters; no second host surface

## Assumptions

- kit.cae.enabled + sqlite registry are already the supported authoring posture
- Backend create/duplicate/open paths are sufficient for v1 Library mutations
- Dashboard CAE tab is the only Library host for v1
- Phase 150 is the confirmed finalize target

## Review

| Field | Value |
| --- | --- |
| Passed | yes |
| Blockers | 0 |
| Warnings | 0 |
| Open questions | 0 |
| Reviewed at | 2026-07-13T23:16:46.595Z |

## Acceptance

| Field | Value |
| --- | --- |
| Accepted at | 2026-07-13T23:17:50.093Z |
| Accepted by | operator |
| Accepted version | 18 |

---

_Rendered from unified IdeaPlan v1 · status accepted · version 19 · updated 2026-07-13T23:14:14.234Z · source draft-plan-artifact_
