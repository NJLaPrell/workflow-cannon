# Workspace kit session snapshot (agents)

**Audience:** automated agents. **Do not** treat `docs/maintainers/ROADMAP.md` or `docs/maintainers/data/workspace-kit-status.yaml` as required reading for routine work.

## Refresh execution context

1. Run `pnpm run wk doctor` (or `node dist/cli.js doctor`) from the repo root.
2. Run `pnpm run wk -- run get-next-actions '{}'` and, when filtering, `pnpm run wk -- run list-tasks '<json-filter>'`.
3. Treat the configured task store (default SQLite `.workspace-kit/tasks/workspace-kit.db`; JSON opt-out `.workspace-kit/tasks/state.json`) as authoritative for `status`, `id`, and queue ordering.

## Humans vs agents

- **Maintainers** edit long-form strategy in `docs/maintainers/ROADMAP.md`, `docs/maintainers/CHANGELOG.md`, and the status YAML snapshot under `docs/maintainers/data/`.
- **Agents** use this file, `.ai/AGENTS.md`, `.ai/machine-cli-policy.md`, `.ai/MACHINE-PLAYBOOKS.md`, `src/modules/*/instructions/*.md`, and CLI JSON output—not `docs/maintainers/*` prose—for operating procedures.
