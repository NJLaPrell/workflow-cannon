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
