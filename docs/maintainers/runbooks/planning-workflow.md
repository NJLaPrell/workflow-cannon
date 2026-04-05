<!-- GENERATED FROM .ai/runbooks/planning-workflow.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Planning workflow runbook

Operational guide for the Phase 17 planning module.

## Intent

Use the planning module to run guided interviews and produce a wishlist artifact (`W###`) for future decomposition. This release intentionally does **not** auto-create execution tasks from planning outputs.

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
```

## Response semantics

- `planning-questions`: additional critical answers required; use `data.nextQuestions`.
- `planning-ready`: interview is complete; artifact returned but not persisted if `createWishlist:false`.
- `planning-artifact-created`: wishlist artifact persisted successfully.
- `planning-critical-unknowns`: finalize denied because unresolved critical unknowns remain.
- `planning-ready-with-warnings`: finalize allowed only when `planning.hardBlockCriticalUnknowns=false`.

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
