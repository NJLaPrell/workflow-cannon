# Planning lens: sizing

**Activate when:** authoring WBS rows; `review-plan-artifact` sizing findings.

## Intent

Capture session-fit confidence without false precision (no calendar estimates in v1).

## Agent checklist

- Every WBS row sets `sizingConfidence`: `high` | `medium` | `low`.
- `low` rows include `riskNotes` explaining uncertainty.
- Rows with vague `acceptanceCriteria` should be `low` or blocked by rubric.
- `suggestedTaskTitle` is PR-sized where possible.
- Oversized rows (whole subsystem in one task) flagged for split.

## Prompts

- What is unknown that drives medium/low confidence?
- Is verification effort proportional (extension tests vs doc-only)?
- Does row scope match one reviewer-able PR?

## Maps to rubric

- `RUBRIC-SIZE-*` codes in `PLANNER_REVIEW_RUBRIC.md`.
