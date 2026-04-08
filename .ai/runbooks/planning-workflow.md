# Planning workflow runbook

Operational guide for the Phase 17 planning module.

## Intent

Use the planning module to run guided interviews and produce a wishlist artifact (`W###`) for future decomposition, **or** (with `outputMode:"tasks"`) preview / persist **execution** task rows. Multi-task materialization uses **`build-plan`** `executionTaskDrafts` + **`persist-planning-execution-drafts`** (see **`.ai/AGENT-CLI-MAP.md`** ladder); single-task artifact synthesis can still use `persistTasks:true` on **`build-plan`** when drafts are omitted. Wishlist-driven decomposition remains in [`.ai/runbooks/wishlist-workflow.md`](./wishlist-workflow.md) (**`convert-wishlist`**).

## Quickstart

```bash
# Discover available planning workflow types.
workspace-kit run list-planning-types '{}'

# Start/continue interview (returns critical questions + guidance).
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript"}}'

# Review effective defaults/rules for one planning type.
workspace-kit run explain-planning-rules '{"planningType":"new-feature"}'

# Finalize and create a wishlist artifact record.
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators","problemStatement":"...","expectedOutcome":"...","impact":"...","constraints":"...","successSignals":"..."},"finalize":true,"createWishlist":true}'

# Multi-task execution path (preview then bulk persist; copy tasks from response data.taskOutputs; pass expectedPlanningGeneration when tasks.planningGenerationPolicy is require).
workspace-kit run build-plan '{"planningType":"new-feature","outputMode":"tasks","finalize":true,"answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators"},"executionTaskDrafts":[{"title":"...","phase":"Phase 68","approach":"...","technicalScope":["..."],"acceptanceCriteria":["..."]}]}'
workspace-kit run persist-planning-execution-drafts '{"tasks":[...],"expectedPlanningGeneration":<n>,"planRef":"...","planningType":"new-feature"}'
```

## Response semantics

- `planning-questions`: additional critical answers required; use `data.nextQuestions`.
- `planning-ready`: interview is complete; artifact returned but not persisted if `createWishlist:false`.
- `planning-artifact-created`: wishlist artifact persisted successfully.
- `planning-multi-task-decomposition-preview`: `finalize:true`, `outputMode:"tasks"`, non-empty `executionTaskDrafts` — preview only; persist via **`persist-planning-execution-drafts`**.
- `planning-execution-drafts-persisted` / `planning-execution-drafts-idempotent-replay`: task-engine bulk writer outcomes (see `src/modules/task-engine/instructions/persist-planning-execution-drafts.md`).
- `planning-critical-unknowns`: finalize denied because unresolved critical unknowns remain while `planning.hardBlockCriticalUnknowns=true`.
- `planning-ready-with-warnings`: finalize allowed with unresolved critical unknowns only when `planning.hardBlockCriticalUnknowns=false`; response includes `data.unresolvedCritical` and `data.finalizeWarnings` (`kind: unresolved-critical-soft-finalize`).

Each response includes `data.cliGuidance` with:

- critical-question completion count and percentage
- a suggested follow-up `workspace-kit run build-plan` invocation

## Config knobs

- `planning.defaultQuestionDepth`: `minimal` | `guided` | `adaptive`
- `planning.hardBlockCriticalUnknowns`: hard gate on finalize
- `planning.rulePacks`: optional per-workflow `baseQuestions`/`adaptiveQuestions` overrides

Use:

```bash
workspace-kit run explain-config '{}'
workspace-kit run resolve-config '{}'
```

to inspect active effective values.

## Implementation estimate pack (post-`convert-wishlist`, human-owned)

**Banner:** Effort / risk / sizing in task metadata is **human judgment**, not computed by the kit. Agents must not treat these fields as commitments or schedules.

After **`convert-wishlist`** (or **`create-task`**) creates execution tasks, maintainers may attach an **optional** stub under **`metadata.implementationEstimatePack`** so planning handoff stays in one JSON place until refined:

```json
{
  "metadata": {
    "implementationEstimatePack": {
      "schemaVersion": 1,
      "engineeringDaysRange": [2, 5],
      "riskNotes": "Touches task-engine transitions; add integration test.",
      "confidence": "low",
      "lastReviewedBy": "human",
      "assumptionBanner": "Estimates are non-binding; validate in triage."
    }
  }
}
```

Apply with **`workspace-kit run update-task`** (JSON **`policyApproval`** when required). The shape is **not** validated by strict task schema in v1 — keep keys stable and document changes here. See [`ADR-task-queue-namespace.md`](../adrs/ADR-task-queue-namespace.md) for **`metadata.queueNamespace`** (separate concern).

**Pilot:** pick one converted task and add the stub; confirm **`pnpm run check`** / task strict mode still pass.
