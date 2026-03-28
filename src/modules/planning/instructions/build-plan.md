# build-plan

Create or continue a guided planning interview for a selected planning type.

## Usage

```bash
workspace-kit run build-plan '{"planningType":"new-feature"}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"Deliver dashboard planning flow","placement":"CLI command","technology":"TypeScript"}}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"...","technology":"...","targetAudience":"..."},"finalize":true}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators"},"finalize":true,"createWishlist":true}'
workspace-kit run build-plan '{"planningType":"new-feature","outputMode":"response","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators"},"finalize":true}'
workspace-kit run build-plan '{"planningType":"new-feature","outputMode":"tasks","persistTasks":true,"taskPhase":"Phase 18 - Module platform and state consolidation","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators"},"finalize":true}'
```

## Arguments

- `planningType` (required): one of `task-breakdown`, `sprint-phase`, `task-ordering`, `new-feature`, `change`.
- `outputMode` (optional): one of `wishlist` (default), `tasks`, `response`.
- `answers` (optional): object of question-id -> answer values.
- `finalize` (optional boolean): when `true`, hard-blocks completion if critical unknowns remain.
- `createWishlist` (optional boolean, default `true`): when `finalize:true`, persist the artifact as a new `W###` wishlist item.
- `persistTasks` (optional boolean, default `false`): with `outputMode:"tasks"`, writes generated task outputs to Task Engine when true.
- `taskPhase` / `taskType` / `taskPriority` (optional): task output shaping hints for `outputMode:"tasks"`.

## Returns

- `planning-questions`: unresolved critical questions (with adaptive follow-ups) to answer next.
- `planning-wishlist-ready`: critical unknowns resolved; plan is ready for wishlist artifact generation.
- `planning-artifact-created`: final artifact persisted to wishlist namespace (`W###`) and returned in response data.
- `planning-response-ready`: critical unknowns resolved; response-only artifact returned (no persistence).
- `planning-task-output-preview`: `outputMode:"tasks"` selected with preview-only task outputs (no persistence).
- `planning-task-output-created`: `outputMode:"tasks"` selected with `persistTasks:true`; created `T###` output returned with provenance.
- `planning-adaptive-unknowns`: returned when `finalize:true` and unresolved adaptive follow-ups are blocked by config.
- `planning-critical-unknowns`: returned when `finalize:true` but critical answers are missing.

All success/error payloads include `data.cliGuidance` with critical-question completion progress and a suggested next `workspace-kit run build-plan` command.

When enough context exists, payloads also include `data.scoringHints` (`effort`, `risk`, `ordering`) as deterministic sequencing hints for agent chaining.
