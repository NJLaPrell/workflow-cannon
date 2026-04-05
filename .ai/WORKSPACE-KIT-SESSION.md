# Workspace kit session snapshot (agents)

**Audience:** automated agents. **Do not** treat `docs/maintainers/ROADMAP.md` or `docs/maintainers/data/workspace-kit-status.yaml` as required reading for routine work.

## Refresh execution context

1. Run `pnpm run wk doctor` (or `node dist/cli.js doctor`) from the repo root. For the **machine-readable instruction catalog** (executable vs documentation-only commands, remediation codes), run `pnpm exec wk doctor --agent-instruction-surface` and keep the JSON output handy before relying on a bare `wk run` text menu.
2. Prefer **`pnpm run wk run agent-session-snapshot '{}'`** for a **single read-only bundle** (planning generation, suggested next, queue-health summary, phase/doctor mismatch hints, open team assignments). Otherwise run `pnpm run wk run get-next-actions '{}'` and, when filtering, `pnpm run wk run list-tasks '<json-filter>'` (do not insert `pnpm`’s `--` between `wk` and `run` — it breaks the CLI).
3. For **Tier A / Tier B** mutating `wk run` commands, use **`pnpm exec wk run <cmd> --schema-only`** first, edit the emitted **`sampleArgs`**, then add JSON **`policyApproval`** when required — see `.ai/machine-cli-policy.md` tier table.
4. Treat the configured task store (SQLite `.workspace-kit/tasks/workspace-kit.db`; legacy `.workspace-kit/tasks/state.json` is **import/migrate only**, not a live runtime backend) as authoritative for `status`, `id`, and queue ordering.

**Maintainer phase snapshot fields** (`current_kit_phase` / `next_kit_phase` in `docs/maintainers/data/workspace-kit-status.yaml`): prefer `workspace-kit run update-workspace-phase-snapshot` over hand-editing those two lines; keep `kit.currentPhaseNumber` in config aligned with `current_kit_phase` or `doctor` will fail (see `docs/maintainers/AGENTS.md`). Per-task `phaseKey` in the task store is separate from this snapshot.

## Humans vs agents

- **Maintainers** edit long-form strategy in `docs/maintainers/ROADMAP.md`, `docs/maintainers/CHANGELOG.md`, and the status YAML snapshot under `docs/maintainers/data/`.
- **Agents** use this file, `.ai/AGENTS.md`, `.ai/machine-cli-policy.md`, `.ai/MACHINE-PLAYBOOKS.md`, `src/modules/*/instructions/*.md`, and CLI JSON output—not `docs/maintainers/*` prose—for operating procedures.
