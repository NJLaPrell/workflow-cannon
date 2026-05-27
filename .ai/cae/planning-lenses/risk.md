# Planning lens: risk

**Activate when:** reviewing for accept; any plan touching production paths, task store, or dual UX (`build-plan` + PlanArtifact).

## Intent

Make risks explicit with severity and mitigation before phase commit.

## Agent checklist

- `riskAssessment[]` entries have `id`, `severity`, and actionable `mitigation` when severity ≥ medium.
- Dual-planning-UX risk documented when dashboard + CLI both exposed (**A-COMPAT**).
- Task-store / `wk doctor` corruption called out if baseline unhealthy (do not hide behind plan prose).
- Policy-sensitive commands note `policyApproval` in Tier B paths.

## Prompts

- What fails safe if the operator skips review?
- What is the rollback story if finalize creates wrong tasks?
- Which risks are accepted vs mitigated in v1?
