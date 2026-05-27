# PlanArtifact lifecycle in Dashboard
| Field | Value |
| --- | --- |
| planRef | `plan-artifact:7c9e6679-7425-40de-944b-e07fc1f90ae7` |
| planId | `7c9e6679-7425-40de-944b-e07fc1f90ae7` |
| version | 3 |
| status | reviewed |
| planningType | new-feature |
**Tags:** `planner`, `dashboard`
## Goals

- Operators complete draft→accept→finalize in Dashboard

## Non-goals

- Replace build-plan in v1

## User stories

### US-1 (must)

As a maintainer, I want see WBS preview so that I can accept with confidence.

## Value assessment

**Impact:** High — closes PLANNER Gap 7

**Confidence:** medium

**Rationale:** Depends on kit commands

## Risks

- **R1** (medium): Dual UX with build-plan wizard. Mitigation: A-COMPAT copy

## Technical impact

**Systems touched:** extensions/cursor-workflow-cannon, task-engine/dashboard-summary

**Compatibility:** planningSession remains for interview resume

## Architecture

Dashboard calls wk run; plan summary on dashboard-summary

**Decisions:**
- **D1:** No extension-side SQLite — _PLANNER_ARCHITECTURE §6_

## UI / UX direction

Plan panel per A-UX mockups

**Mockups:** PLANNER_UX.md

## Testing strategy

**Layers:** unit, extension
**Critical paths:**
- accept disabled until review pass

## Implementation guidance

- Extend dashboard-summary before webview panels

## What not to do

- Do not embed review rubric in TypeScript strings only

## Assumptions

- A-UX approved before T-7.1

## Open questions

- Use strict accept on warnings?

## Work breakdown (WBS)

### WBS-1 (1): Kit contract

**Suggested task:** dashboard-summary planArtifact contract

Extend projection

**Scope:** dashboard-summary-projection.ts

**Acceptance:**
- Schema validates

**Verification:** kit unit tests

**Done means:** T-7.1 complete · **Sizing:** medium

### WBS-2 (2): Plan draft panel

**Suggested task:** Dashboard plan draft panel

Read-only render

**Scope:** render-dashboard.ts

**Acceptance:**
- Fixture render test

**Verification:** extension tests

**Done means:** T-7.2 complete · **Sizing:** medium · deps: WBS-1

## Phase recommendations

- **Phase 110** (`110`) **(primary)**: Planner tranche

---
_Rendered from PlanArtifact v1 · updated 2026-05-27T06:30:00.000Z · source draft-plan-artifact_
