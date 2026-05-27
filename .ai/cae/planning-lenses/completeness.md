# Planning lens: completeness

**Activate when:** drafting or reviewing any PlanArtifact; especially before `accept-plan-artifact`.

## Intent

Ensure the plan answers "what", "why", and "how we know we're done" before execution tasks are generated.

## Agent checklist

- `goals` are non-empty and outcome-oriented (not implementation steps).
- `nonGoals` explicitly bounds scope creep.
- `openQuestions` is empty OR each item is listed in `approvalRecord.openQuestionsAccepted` at accept.
- `implementationGuidance` and `whatNotToDo` are both present (can be short).
- `phaseRecommendations` has exactly one `isPrimary: true` when multiple phases listed.
- WBS `doneMeans` on every row states plain-language completion.

## Prompts to ask the operator

- What measurable signal proves this plan succeeded?
- What are we explicitly **not** doing in this phase?
- Which open questions block accept vs can defer?

## Maps to rubric

- `RUBRIC-GOALS-*`, `RUBRIC-OQ-*`, profile-specific section requirements in `PLANNER_SCHEMA.md` §3.
