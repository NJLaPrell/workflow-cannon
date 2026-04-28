# Workspace kit session snapshot (agents)

**Audience:** automated agents. **Do not** treat `docs/maintainers/ROADMAP.md` or `docs/maintainers/data/workspace-kit-status.yaml` as required reading for routine work.

## Refresh execution context

1. Run `pnpm exec wk doctor` (or `node dist/cli.js doctor`) from the repo root. For the **machine-readable instruction catalog** (executable vs documentation-only commands, remediation codes), run `pnpm exec wk doctor --agent-instruction-surface` and keep the JSON output handy before relying on a bare `wk run` text menu.
2. For a **single argv cold start** (doctor-equivalent contract checks **plus** the composed session bundle), run **`pnpm exec wk run agent-bootstrap '{}'`** (read-only; includes `planningGeneration`, `suggestedNext`, queue health, phase hints). Otherwise use **`pnpm exec wk run agent-session-snapshot '{}'`** alone when doctor was already run separately, or `pnpm exec wk run get-next-actions '{}'` plus `pnpm exec wk run list-tasks '<json-filter>'` for granular reads (do not insert `pnpm`’s `--` between `wk` and `run` — it breaks the CLI).
3. For **Tier A / Tier B** mutating `wk run` commands, use **`pnpm exec wk run <cmd> --schema-only`** first, edit the emitted **`sampleArgs`**, then add JSON **`policyApproval`** when required — see `.ai/machine-cli-policy.md` tier table.
4. Treat the configured task store (SQLite `.workspace-kit/tasks/workspace-kit.db`; legacy `.workspace-kit/tasks/state.json` is **import/migrate only**, not a live runtime backend) as authoritative for `status`, `id`, and queue ordering.

**Workspace phase snapshot:** canonical **`current_kit_phase` / `next_kit_phase`** for kit readers live in **`kit_workspace_status`** (planning SQLite, **`user_version` ≥ 10**). Use **`workspace-kit run phase-status '{}'`** to read phase, drift, export freshness, and optional task counts. Use **`workspace-kit run set-current-phase ...`** for the SQLite-first happy-path phase mutation; **`update-workspace-phase-snapshot`** and **`update-workspace-status`** are compatibility / low-level surfaces. **`kit.currentPhaseNumber`** is a **bootstrap / UX hint** only — it does **not** override the DB row; **`doctor`** may note drift but does not fail on config vs DB mismatch (see **`.ai/runbooks/workspace-status-sqlite.md`**). Per-task **`phaseKey`** in the task store is separate from this snapshot.

## Humans vs agents

- **Maintainers** edit long-form strategy in `docs/maintainers/ROADMAP.md`, `docs/maintainers/CHANGELOG.md`, and the status YAML snapshot under `docs/maintainers/data/`.
- **Agents** use this file, `.ai/AGENTS.md`, `.ai/machine-cli-policy.md`, `.ai/MACHINE-PLAYBOOKS.md`, `src/modules/*/instructions/*.md`, and CLI JSON output—not `docs/maintainers/*` prose—for operating procedures.
