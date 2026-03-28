# build-plan

Create or continue a guided planning interview for a selected planning type.

## Usage

```bash
workspace-kit run build-plan '{"planningType":"new-feature"}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"Deliver dashboard planning flow","placement":"CLI command","technology":"TypeScript"}}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"...","technology":"...","targetAudience":"..."},"finalize":true}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators"},"finalize":true,"createWishlist":true}'
workspace-kit run build-plan '{"planningType":"new-feature","outputMode":"response","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators"},"finalize":true}'
```

## Arguments

- `planningType` (required): one of `task-breakdown`, `sprint-phase`, `task-ordering`, `new-feature`, `change`.
- `outputMode` (optional): one of `wishlist` (default), `tasks`, `response`.
- `answers` (optional): object of question-id -> answer values.
- `finalize` (optional boolean): when `true`, hard-blocks completion if critical unknowns remain.
- `createWishlist` (optional boolean, default `true`): when `finalize:true`, persist the artifact as a new `W###` wishlist item.

## Returns

- `planning-questions`: unresolved critical questions (with adaptive follow-ups) to answer next.
- `planning-wishlist-ready`: critical unknowns resolved; plan is ready for wishlist artifact generation.
- `planning-artifact-created`: final artifact persisted to wishlist namespace (`W###`) and returned in response data.
- `planning-response-ready`: critical unknowns resolved; response-only artifact returned (no persistence).
- `planning-task-output-deferred`: `outputMode:"tasks"` selected; contract branch active while task materialization is delivered separately.
- `planning-critical-unknowns`: returned when `finalize:true` but critical answers are missing.

All success/error payloads include `data.cliGuidance` with critical-question completion progress and a suggested next `workspace-kit run build-plan` command.
