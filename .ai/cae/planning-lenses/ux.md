# Planning lens: UX

**Activate when:** `uiUxDirection.hasUiChanges` is true; dashboard/extension in `systemsTouched`; **A-UX** mockups apply.

## Intent

Keep human workflow in the Dashboard aligned with kit contracts—no shadow UI state.

## Agent checklist

- `uiUxDirection.summary` describes panels and primary actions (review, accept, finalize).
- `mockupRefs` point to repo paths (e.g. `PLANNER_UX.md`) — no binary embeds in plan JSON.
- Dashboard calls `wk run` only; `dashboard-summary.planArtifact` contract respected.
- Accept/finalize use policy drawer pattern; disabled states when review blocked.
- Accessibility: not color-only status; keyboard order documented.

## Prompts

- Where does Plan lifecycle panel live relative to legacy wizard?
- What errors surface for `plan-artifact-review-blocked`?
- What is empty-state when no `planArtifact` in summary?

## Reference

- `PLANNER_UX.md` wireframes; **A-COMPAT** for dual surfaces.
