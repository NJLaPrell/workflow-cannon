# CAE planning lenses (A-CAE)

**Status:** Draft for human review (**A-CAE**).  
**Applies during:** `build-plan`, `draft-plan-artifact`, `review-plan-artifact`, planning interview sessions.  
**Canonical rubric (deterministic):** `PLANNER_REVIEW_RUBRIC.md` — lenses are **advisory**; review command enforces blockers.

| Lens | File (under `.ai/cae/planning-lenses/`) | When to activate |
| --- | --- | --- |
| Completeness | `completeness.md` | Drafting or reviewing any plan profile |
| Architecture | `architecture.md` | `new-feature`, `change`, cross-module scope |
| Risk | `risk.md` | Always before accept |
| Testing | `testing.md` | Before accept; maps to `testingStrategy` section |
| UX | `ux.md` | UI/dashboard scope or `uiUxDirection` required |
| Decomposition | `decomposition.md` | Multi-row WBS or `task-breakdown` |
| Anti-patterns | `anti-patterns.md` | Draft and review (guardrails) |
| Sizing | `sizing.md` | WBS row authoring and `review-plan-artifact` |
| Release / rollback | `release-rollback.md` | Phase recommendations and finalize |

Registry ids: `cae.reasoning.planning-*` in `.ai/cae/registry/artifacts.v1.json`.
