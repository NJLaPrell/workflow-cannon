# Planning lens: anti-patterns

**Activate when:** drafting or reviewing; use as guardrail pass before accept.

## Forbidden shortcuts

- Treating chat transcript or this markdown render as canonical plan storage.
- Hand-editing `.workspace-kit/tasks/workspace-kit.db` for plan status.
- Skipping `review-plan-artifact` then forcing accept.
- Empty `technicalScope` or `acceptanceCriteria` on WBS rows "to be filled later".
- Duplicating full WBS in top-level `taskGenerationPayloads` without `wbs[].generatedTaskPayload`.
- Implementing review rubric only in extension UI strings (must be deterministic in kit).
- Removing `build-plan` in v1 without **A-COMPAT** approval.

## Smell list

| Smell | Fix |
| --- | --- |
| Goals are task titles | Rewrite as outcomes |
| One giant WBS row | Split by merge boundary or layer |
| No `planRef` on finalize | Set envelope `planRef` early |
| Phase mismatch | Align `phaseRecommendations` and finalize `targetPhaseKey` |

## Reference

- `whatNotToDo[]` in plan should echo top risks for implementers.
