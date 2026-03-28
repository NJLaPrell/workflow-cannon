# Cursor long-session hygiene

Use this runbook when agent threads run for a long time, after context compaction, or when behavior diverges from documented kit policy.

## Re-anchor checklist

1. **Canon** — `docs/maintainers/AGENTS.md` (source-of-truth order) and `docs/maintainers/ARCHITECTURE.md` (router vs persistence).
2. **Health** — `workspace-kit doctor` from the repository root.
3. **Execution queue** — `workspace-kit run get-next-actions '{}'` or `workspace-kit run list-tasks '{}'`.
4. **Operator snapshot** — `docs/maintainers/data/workspace-kit-status.yaml` (`current_kit_phase`, `active_focus`).
5. **Extension** — Workflow Cannon dashboard uses `dashboard-summary`; when present, **Planning session** reflects an in-flight `build-plan` snapshot (local file under `.workspace-kit/planning/`, gitignored).

## Cursor rules: always-on vs requestable

- **Always-on** rules (e.g. workspace-kit CLI execution, workflow contract) should stay **short** and pointer-first; deep procedures live in `docs/maintainers/`.
- **Requestable** rules: attach via `@` when needed — for example **`.cursor/rules/cursor-long-session-hygiene.mdc`** for this checklist without loading it into every turn.

## Task state integrity

- Routine lifecycle changes use **`workspace-kit run run-transition`** with JSON `policyApproval` when required.
- Optional advisory: `pnpm run advisory:task-state-hand-edit` if you need a reminder about hand-editing `.workspace-kit/tasks/state.json`.

## Related

- `docs/maintainers/AGENT-CLI-MAP.md` — tier table and copy-paste JSON.
- `docs/maintainers/POLICY-APPROVAL.md` — approval surfaces.
- `docs/maintainers/plans/extension-dashboard-parity-plan.md` — extension vs CLI parity direction.
