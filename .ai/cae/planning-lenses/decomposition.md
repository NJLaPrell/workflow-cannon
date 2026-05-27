# Planning lens: decomposition

**Activate when:** authoring `wbs[]` with more than one row; `task-breakdown` or `sprint-phase` types.

## Intent

Produce reviewable WBS rows that normalize cleanly to task drafts.

## Agent checklist

- Each row has stable `wbsId` and optional hierarchical `path`.
- `dependsOn` references other `wbsId` values (no circular deps).
- `goalMapping` ties rows to `goals[]` text or ids.
- `generatedTaskPayload` is complete for `persist-planning-execution-drafts` shape.
- Row titles are deliverable-sized (avoid "do the whole feature" single row unless truly minimal profile).

## Prompts

- Can any row be split for parallel review/PR?
- Which rows are phase-critical vs nice-to-have?
- Does finalize order respect `dependsOn`?

## Reference

- `normalizeWbsItemToTaskDraft()` stub; WP-6 full normalizer.
