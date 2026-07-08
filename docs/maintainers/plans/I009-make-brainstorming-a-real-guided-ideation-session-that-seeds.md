<!--
  Maintainer plan document rendered from unified IdeaPlan artifacts.
  Regenerate: pnpm exec wk run generate-plan-document '{"planId":"<uuid>"}'
  Source view: src/modules/documentation/views/plan-document.view.yaml
-->

# Make brainstorming a real guided ideation session that seeds the plan

| Field | Value |
| --- | --- |
| Status | `accepted` |
| Idea ID | `I009` |
| Plan ID | `08de149e-e528-4404-9e3a-885870fdf810` |
| Version | 19 |
| planRef | `plan-artifact:08de149e-e528-4404-9e3a-885870fdf810` |
| Planning type | new-feature |

Transform Ideas brainstorming from a scoring survey into guided ideation that seeds the plan draft, persists structured session output, and keeps dashboard plan metadata in sync.

## Brainstorm synthesis

| Dimension | Score | Band |
| --- | ---: | --- |
| Value | 7.6 | **green** |
| Risk | 3.85 | **green** |
| Effort | 6 | **amber** |
| Confidence | 7.65 | **green** |
| Priority | 68 | **green** |
| T-shirt size | M | — |

## Brainstorm session history

| # | Session ID | Started | State | Value | Priority |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `bsess-a1dc20dc-0567-4af8-b4e3-8f0dbf40d3e3` | 2026-07-07 21:28:58 | completed | 7.6 | 68 |

## Goals and non-goals

### Goals

- Operators get a guided ideation brainstorm with agent contributions and save/finish checkpoints
- Brainstorm content mechanically seeds plan.summary, goals, open questions, and planner-chat context
- New ideas auto-create a linked unified IdeaPlan document without a global migration
- Dashboard Plans show current unified plan titles and summaries after IdeaPlan writes
- Ideas rollup shows open ideas including those not yet brainstorming and not yet promoted to a plan
- Dashboard plan review actions give clear in-panel feedback (success, failure, and post-review state)

## WBS summary

| WBS ID | Title | Sizing | Depends on |
| --- | --- | --- | --- |
| `WBS-1` | Ideation schema and session persistence | medium | — |
| `WBS-2` | Brainstorm directive reframe | medium | WBS-1 |
| `WBS-3` | Plan seeding and planner prompt digest | medium | WBS-1, WBS-7 |
| `WBS-4` | create-idea unified document auto-init | low | — |
| `WBS-5` | Dashboard plan projection sync | low | — |
| `WBS-6` | Plan accept, dogfood replay, and WBS execution handoff | medium | WBS-1, WBS-2, WBS-3, WBS-4, WBS-5, WBS-7, WBS-8 |
| `WBS-7` | Qualitative ideation synthesis and dashboard rollup | medium | WBS-1, WBS-5 |
| `WBS-8` | Dashboard plan review feedback loop | low | WBS-5 |

## Risk register

- **R-1** (medium): Schema changes could break legacy brainstorm sessions. Mitigation: Additive ideation fields and ideation-rich validation fallback; keep existing scoring path.

## Assumptions

- Transcript capture is implicit opt-in only; curated ideation arrays are the default planning seed source.
- featureIdeas and decisions use plain string[]; perspectives/expectations/openThreads use {text} objects.
- Brainstorm promotion accepts ideation-complete (operator-confirmed ideationComplete flag) OR scoring-complete sessions.
- Multi-session ideation uses deterministic synthesizeBrainstormIdeation before plan seeding.
- Ideas rollup includes open ideas not yet in brainstorming and not yet promoted to a plan.
- Plan is an execution blueprint (PQ-12-A); task materialization and phase roster assignment wait for finalize/execute.
- finalize-plan-to-phase (or equivalent) resolves target phases per WBS row at materialization time, creating new phase catalog entries when needed.

## Review

| Field | Value |
| --- | --- |
| Passed | yes |
| Blockers | 0 |
| Warnings | 0 |
| Open questions | 0 |
| Reviewed at | 2026-07-08T00:21:28.177Z |

## Acceptance

| Field | Value |
| --- | --- |
| Accepted at | 2026-07-08T00:24:09.000Z |
| Accepted by | operator |
| Accepted version | 15 |

## Delivery references

| Field | Value |
| --- | --- |
| Delivered at | — |
| Phase key | 142 |
| Task count | 8 |

**Task refs:**
- `T100808`
- `T100809`
- `T100810`
- `T100811`
- `T100812`
- `T100813`
- `T100814`
- `T100815`

---

_Rendered from unified IdeaPlan v1 · status accepted · version 19 · updated 2026-07-08T00:27:23.235Z · source draft-plan-artifact_
