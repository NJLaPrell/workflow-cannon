# Maintainer-local task engine cutover

This repository may **optionally** move execution tracking from hand-edited `docs/maintainers/TASKS.md` to the **task engine** (JSON under `.workspace-kit/tasks/`) while keeping `TASKS.md` as a **generated** read-only view.

There is **no** packaged migration runner in `@workflow-cannon/workspace-kit` for `v0.4.0`. This runbook is for **maintainers of this repo only**.

## When to cut over

- Phase 2 policy/config is in place and you are ready to dogfood the engine on real work.
- You accept that task state lives in git (or is gitignored locally—team decision).

## Steps

1. Follow **`docs/maintainers/task-engine-cutover-checklist.md`** line by line.
2. Use `workspace-kit run import-tasks` with a `policyApproval` block in JSON args (see task-engine instruction).
3. Validate `.workspace-kit/tasks/state.json`.
4. Run `workspace-kit run generate-tasks-md` with `policyApproval`; review the markdown diff.
5. Open a PR; link this runbook or checklist in the description.

## CLI approval for `init` / `upgrade`

Non-`run` write commands require environment approval:

```bash
export WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"local maintainer run"}'
workspace-kit upgrade
```

## Related docs

- `docs/maintainers/phase2-config-policy-workbook.md` — precedence, policy IDs, actor resolution.
- `docs/maintainers/config-policy-matrix.md` — config vs policy mapping.

## Revision

| Date | Note |
| --- | --- |
| 2026-03-25 | Initial runbook for Phase 2 / `v0.4.0`. |
