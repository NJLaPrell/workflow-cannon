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

## Session snapshot (local)

While an interview is **in progress** or **blocked on finalize**, the module writes a gitignored snapshot under **`.workspace-kit/planning/build-plan-session.json`** so **`dashboard-summary`** (and the Cursor extension dashboard) can show **Planning session** + a **resume CLI** line. The file is removed when the interview completes successfully (wishlist artifact, task output branch, response-only completion, or non-persisted wishlist-ready handoff).

## Arguments

- `planningType` (required): one of `task-breakdown`, `sprint-phase`, `task-ordering`, `new-feature`, `change`.
- `outputMode` (optional): one of `wishlist` (default), `tasks`, `response`.
- `answers` (optional): object of question-id -> answer values.
- `finalize` (optional boolean): when `true`, completes the interview if enough answers exist; **critical unknowns** either **block** (`planning.hardBlockCriticalUnknowns=true`, code `planning-critical-unknowns`) or **allow a soft finalize** (`planning.hardBlockCriticalUnknowns=false`, code `planning-ready-with-warnings` with `data.finalizeWarnings`).
- `createWishlist` (optional boolean, default `true`): when `finalize:true`, persist the artifact as a new `W###` wishlist item.
- `persistTasks` (optional boolean, default `false`): with `outputMode:"tasks"`, writes generated task outputs to Task Engine when true (single-task artifact path only).
- `taskPhase` / `taskType` / `taskPriority` (optional): task output shaping hints for `outputMode:"tasks"` (single-task artifact path only).
- `executionTaskDrafts` (optional array): when `finalize:true` and `outputMode:"tasks"`, a **non-empty** array of **convert-wishlist-compatible** task rows (`id` optional — missing/invalid ids are allocated as the next free `T###`; `title`, `phase`, `approach`, non-empty `technicalScope`, non-empty `acceptanceCriteria` required per row; same rules as `convert-wishlist` `tasks[]`). Produces **`planning-multi-task-decomposition-preview`** with `data.taskOutputs[]`, `data.planningDecomposition`, and provenance. **`persistTasks` must be false** (or omitted); multi-row persistence is a separate task-engine bulk command with **`expectedPlanningGeneration`**.

## Returns

- `planning-questions`: unresolved critical questions (with adaptive follow-ups) to answer next.
- `planning-ready-with-warnings`: `finalize:true` with unresolved criticals while `planning.hardBlockCriticalUnknowns=false`; includes `data.finalizeWarnings` and `data.unresolvedCritical`.
- `planning-wishlist-ready`: critical unknowns resolved; plan is ready for wishlist artifact generation.
- `planning-artifact-created`: final artifact persisted to wishlist namespace (`W###`) and returned in response data.
- `planning-response-ready`: critical unknowns resolved; response-only artifact returned (no persistence).
- `planning-task-output-preview`: `outputMode:"tasks"` selected with preview-only task outputs (no persistence), **single-task** synthesis from the planning artifact.
- `planning-task-output-created`: `outputMode:"tasks"` selected with `persistTasks:true`; created `T###` output returned with provenance (**artifact path only**).
- `planning-multi-task-decomposition-preview`: `finalize:true`, `outputMode:"tasks"`, non-empty `executionTaskDrafts` — deterministic multi-task envelope (`data.taskOutputs`, `data.planningDecomposition`); preview only.
- `planning-execution-drafts-require-finalize`: `executionTaskDrafts` set without `finalize:true`.
- `planning-multi-task-persist-delegated`: `executionTaskDrafts` set with `persistTasks:true` (not supported on `build-plan`).
- `planning-adaptive-unknowns`: returned when `finalize:true` and unresolved adaptive follow-ups are blocked by config.
- `planning-critical-unknowns`: returned when `finalize:true` but critical answers are missing.

All success/error payloads include `data.cliGuidance` with critical-question completion progress and a suggested next `workspace-kit run build-plan` command.

When enough context exists, payloads also include `data.scoringHints` (`effort`, `risk`, `ordering`) as deterministic sequencing hints for agent chaining.

All `build-plan` response payloads include `data.responseSchemaVersion` (`1`) and stable envelope keys (`planningType`, `outputMode`, and status-specific fields) for deterministic client parsing.
