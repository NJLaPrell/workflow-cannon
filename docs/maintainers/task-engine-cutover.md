# Maintainer-local task engine cutover

Historical runbook for early task-engine adoption.

Execution tracking is now canonical in `.workspace-kit/tasks/state.json`; markdown-based task tracking is removed.

## When to cut over

- Phase 2 policy/config is in place and you are ready to dogfood the engine on real work.
- You accept that task state lives in git (or is gitignored locally—team decision).

## Steps

1. Follow **`docs/maintainers/task-engine-cutover-checklist.md`** line by line.
2. Validate `.workspace-kit/tasks/state.json` directly as the canonical task state.
3. Use task-engine runtime commands (`list-tasks`, `get-task`, `run-transition`, `get-next-actions`) with policy approvals where required.
4. Open a PR and include state diffs/evidence from `.workspace-kit/tasks/state.json`.
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
