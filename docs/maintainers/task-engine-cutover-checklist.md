# Task engine cutover checklist (maintainer-local)

Use before treating **task JSON** under `.workspace-kit/tasks/` as the source of truth for this repo.  
Full context: `docs/maintainers/task-engine-cutover.md`.

## Preflight

- [ ] Branch off `main` (or your release branch).
- [ ] Copy or note current `.workspace-kit/tasks/state.json` (backup path recorded).
- [ ] Note whether `.workspace-kit/tasks/` already exists; back up `state.json` if present.
- [ ] Confirm you can run `workspace-kit run` from this repo (package installed / `pnpm` workflow).

## Policy / approvals

- [ ] For mutating commands (for example `run-transition`), plan JSON args including
  `policyApproval: { "confirmed": true, "rationale": "<why user approved>" }`.
- [ ] For `workspace-kit init` / `upgrade` in automation, set  
  `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"..."}'` when required.

## Import

- [ ] Validate task-engine state directly in `.workspace-kit/tasks/state.json`.
- [ ] Inspect `.workspace-kit/tasks/state.json` for expected task IDs and statuses.

## Regenerate execution surface

- [ ] Diff `.workspace-kit/tasks/state.json` against expectations (statuses, dependencies, phase assignment, metadata).

## Git / PR

- [ ] Commit task state + re`.workspace-kit/tasks/state.json` together or document intentional split.
- [ ] PR description states cutover is **voluntary** and **local** to this repo.

## Rollback

- [ ] Restore backed-up `.workspace-kit/tasks/state.json` and remove or revert `.workspace-kit/tasks/state.json`.
- [ ] Re-run task-engine validation commands only if returning to engine-owned state.

## Revision

| Date | Note |
| --- | --- |
| 2026-03-25 | Initial checklist for Phase 2 / `v0.4.0`. |
