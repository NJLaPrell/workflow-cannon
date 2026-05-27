# Planning lens: release and rollback

**Activate when:** `phaseRecommendations` populated; before `finalize-plan-to-phase`; phase closeout work.

## Intent

Ensure plans target the correct phase integration branch and operators know rollback limits.

## Agent checklist

- `phaseRecommendations` includes rationale tied to workspace phase snapshot.
- Finalize `targetPhaseKey` matches operator intent (not stale phase).
- Generated tasks land as `ready` or `proposed` consistently with argv.
- Rollback story: cancel tasks via task-engine; do not delete artifact versions silently.
- Closeout gates (`phase-closeout-readiness`) acknowledged if tasks still `ready` in phase.

## Prompts

- Is this plan for current phase integration branch or next?
- What happens to tasks if plan is superseded?
- Are parallel-orchestration tasks in scope for this finalize?

## Reference

- Maintainer delivery: phase branch + `run-transition` evidence, not finalize alone.
