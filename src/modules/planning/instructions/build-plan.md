# build-plan

Create or continue a guided planning interview for a selected planning type.

## Usage

```bash
workspace-kit run build-plan '{"planningType":"new-feature"}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"Deliver dashboard planning flow","placement":"CLI command","technology":"TypeScript"}}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"...","technology":"...","targetAudience":"..."},"finalize":true}'
```

## Arguments

- `planningType` (required): one of `task-breakdown`, `sprint-phase`, `task-ordering`, `new-feature`, `change`.
- `answers` (optional): object of question-id -> answer values.
- `finalize` (optional boolean): when `true`, hard-blocks completion if critical unknowns remain.

## Returns

- `planning-questions`: unresolved critical questions (with adaptive follow-ups) to answer next.
- `planning-ready`: critical unknowns resolved; plan is ready for wishlist artifact generation.
- `planning-critical-unknowns`: returned when `finalize:true` but critical answers are missing.
