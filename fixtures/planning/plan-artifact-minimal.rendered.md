# Add plan artifact JSON schema file
| Field | Value |
| --- | --- |
| planRef | `plan-artifact:550e8400-e29b-41d4-a716-446655440000` |
| planId | `550e8400-e29b-41d4-a716-446655440000` |
| version | 1 |
| status | draft |
| planningType | change |
Introduce schemas/planning/plan-artifact.v1.schema.json
## Goals

- PlanArtifact v1 validates in CI

## Non-goals

- Dashboard UI

## Value assessment

**Impact:** Unblocks command implementation

**Confidence:** high

## Risks

_None listed._

## Technical impact

**Systems touched:** src/core/planning, schemas/planning

## Testing strategy

**Layers:** unit
**Critical paths:**
- schema validates minimal fixture

## Implementation guidance

- Mirror fields in PLANNER_SCHEMA.md

## What not to do

- Do not hand-edit task store for plan status

## Assumptions

- A-SCHEMA approved before WP-1 coding

## Open questions

_None._

## Work breakdown (WBS)

### WBS-1: Add JSON Schema

**Suggested task:** Add plan-artifact.v1.schema.json

Author schema from PLANNER_SCHEMA.md

**Scope:** schemas/planning/plan-artifact.v1.schema.json

**Acceptance:**
- Minimal fixture passes validation

**Verification:** test/plan-artifact-schema.test.mjs

**Done means:** Schema file committed and referenced in WP-1.2 · **Sizing:** medium

## Phase recommendations

- **Phase 110** (`110`) **(primary)**: Current planner phase

---
_Rendered from PlanArtifact v1 · updated 2026-05-27T06:00:00.000Z · source draft-plan-artifact_
