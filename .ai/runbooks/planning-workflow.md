# Planning workflow runbook

Operational guide for the Phase 17 planning module.

**PlanArtifact v1** (structured plan + WBS → phase tasks) uses [`.ai/runbooks/plan-artifact-workflow.md`](./plan-artifact-workflow.md) — not this legacy interview path alone.

## Intent

Use the planning module to run guided interviews and preview or persist **execution** task rows. Multi-task materialization uses **`build-plan`** `executionTaskDrafts` + **`persist-planning-execution-drafts`** (see **`.ai/AGENT-CLI-MAP.md`** ladder); single-task artifact synthesis can still use `persistTasks:true` on **`build-plan`** when drafts are omitted. For operator-facing ideation before scheduling, prefer the **Ideas** module (`create-idea`, `list-ideas`) and **`.ai/playbooks/planner-chat.md`**.

## Quickstart

```bash
# Discover available planning workflow types.
workspace-kit run list-planning-types '{}'

# Start/continue interview (returns critical questions + guidance).
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript"}}'

# Review effective defaults/rules for one planning type.
workspace-kit run explain-planning-rules '{"planningType":"new-feature"}'

# Finalize and preview execution-task output.
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators","problemStatement":"...","expectedOutcome":"...","impact":"...","constraints":"...","successSignals":"..."},"finalize":true,"outputMode":"tasks"}'

# Multi-task execution path (preview then bulk persist; copy tasks from response data.taskOutputs; pass expectedPlanningGeneration when tasks.planningGenerationPolicy is require).
workspace-kit run build-plan '{"planningType":"new-feature","outputMode":"tasks","finalize":true,"answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators"},"executionTaskDrafts":[{"title":"...","phase":"Phase 68","approach":"...","technicalScope":["..."],"acceptanceCriteria":["..."]}]}'
workspace-kit run persist-planning-execution-drafts '{"tasks":[...],"expectedPlanningGeneration":<n>,"planRef":"...","planningType":"new-feature"}'
```

## Response semantics

- `planning-questions`: additional critical answers required; use `data.nextQuestions`.
- `planning-ready`: interview is complete; artifact returned but not persisted when finalize did not write tasks.
- `planning-artifact-created`: planning interview output persisted successfully.
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

## Implementation estimate pack (post-materialization, human-owned)

**Banner:** Effort / risk / sizing in task metadata is **human judgment**, not computed by the kit. Agents must not treat these fields as commitments or schedules.

After **`create-task`** or bulk persist creates execution tasks, maintainers may attach an **optional** stub under **`metadata.implementationEstimatePack`** so planning handoff stays in one JSON place until refined:

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

Use **`update-task`** when attaching or revising the pack on existing rows.
