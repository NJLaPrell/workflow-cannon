# Task engine cutover checklist (maintainer-local)

Use before treating **task JSON** under `.workspace-kit/tasks/` as the source of truth for this repo.  
Full context: `docs/maintainers/task-engine-cutover.md`.

## Preflight

- [ ] Branch off `main` (or your release branch).
- [ ] Copy or note current `docs/maintainers/TASKS.md` (backup path recorded).
- [ ] Note whether `.workspace-kit/tasks/` already exists; back up `state.json` if present.
- [ ] Confirm you can run `workspace-kit run` from this repo (package installed / `pnpm` workflow).

## Policy / approvals

- [ ] For mutating commands (`import-tasks`, `generate-tasks-md`, `run-transition`), plan JSON args including  
  `policyApproval: { "confirmed": true, "rationale": "<why user approved>" }`.
- [ ] For `workspace-kit init` / `upgrade` in automation, set  
  `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"..."}'` when required.

## Import

- [ ] Run `import-tasks` with approval and correct paths (see task-engine instruction).
- [ ] Inspect `.workspace-kit/tasks/state.json` for expected task IDs and statuses.

## Regenerate human view

- [ ] Run `generate-tasks-md` with approval.
- [ ] Diff `docs/maintainers/TASKS.md` against expectations (sections, markers, ordering).

## Git / PR

- [ ] Commit task state + regenerated `TASKS.md` together or document intentional split.
- [ ] PR description states cutover is **voluntary** and **local** to this repo.

## Rollback

- [ ] Restore backed-up `TASKS.md` and remove or revert `.workspace-kit/tasks/state.json`.
- [ ] Re-run `generate-tasks-md` only if you are returning to engine-owned state—otherwise stop at restored markdown.

## Revision

| Date | Note |
| --- | --- |
| 2026-03-25 | Initial checklist for Phase 2 / `v0.4.0`. |
