AI agents: read **`./.ai/`** first for machine-oriented contracts (module build rules, principles). For **conflicts between** `.ai/`, `docs/maintainers/`, `.cursor/rules/`, and code, use the ordered **Source-of-truth** list in [`docs/maintainers/AGENTS.md`](docs/maintainers/AGENTS.md) and the precedence note in [`docs/maintainers/ARCHITECTURE.md`](docs/maintainers/ARCHITECTURE.md) — do not rely on this README alone for governance precedence.

<div align="center">
  <img src="title_image.png" alt="Workflow Cannon" width="720" />
</div>

# Workflow Cannon

**[`@workflow-cannon/workspace-kit`](https://www.npmjs.com/package/@workflow-cannon/workspace-kit)** — CLI, task engine, and workflow contracts for repos that want deterministic, policy-governed automation with clear evidence.

## Quick start (clone this repo)

**Needs:** Node.js **22+** (see CI), **pnpm 10** (see `packageManager` in `package.json`).

```bash
git clone https://github.com/NJLaPrell/workflow-cannon.git
cd workflow-cannon
pnpm install
pnpm run build
```

Verify the kit sees your workspace:

```bash
node dist/cli.js doctor
node dist/cli.js --help
```

Try **read-only** task-engine queries:

```bash
node dist/cli.js run list-tasks '{}'
node dist/cli.js run get-next-actions '{}'
```

**Developing:** after edits, `pnpm run build` then `pnpm test` (or `pnpm run phase5-gates` before larger changes). If `workspace-kit` is not on your `PATH`, use `node dist/cli.js …` from the repo root (same as above).

## Quick start (use the package in another project)

```bash
npm install @workflow-cannon/workspace-kit
npx workspace-kit --help
```

Or with pnpm: `pnpm add @workflow-cannon/workspace-kit` then `pnpm exec workspace-kit --help`.

## What this repo contains

| Area | What |
| --- | --- |
| **CLI** | `workspace-kit` — `doctor`, `config`, `run <module-command>` (see `workspace-kit run` with no args for the list). |
| **Task engine** | Canonical queue in `.workspace-kit/tasks/state.json`; lifecycle via `run-transition`. Wishlist ideation uses ids `W###` (see [`docs/maintainers/runbooks/wishlist-workflow.md`](docs/maintainers/runbooks/wishlist-workflow.md)). |
| **Docs** | Maintainer process, roadmap, and changelog under `docs/maintainers/`. |
| **Cursor extension** (optional) | Thin UI in `extensions/cursor-workflow-cannon/` — build with `pnpm run ui:prepare`. |

There is **no** built-in IDE slash command like `/qt` from this package; editor integrations are **your** config (e.g. `.cursor/commands/`), while **`workspace-kit`** is the supported CLI.

## Policy and approvals (read this before mutating state)

Sensitive `workspace-kit run` commands require JSON **`policyApproval`** in the third CLI argument. Chat approval is not enough. Env-based approval applies to `init` / `upgrade` / `config`, not the `run` path.

- **Human guide:** [`docs/maintainers/POLICY-APPROVAL.md`](docs/maintainers/POLICY-APPROVAL.md)
- **Copy-paste table:** [`docs/maintainers/AGENT-CLI-MAP.md`](docs/maintainers/AGENT-CLI-MAP.md)

## Project status and roadmap

Release cadence, phase history, and strategic decisions: [`docs/maintainers/ROADMAP.md`](docs/maintainers/ROADMAP.md). **Live execution queue:** `.workspace-kit/tasks/state.json` (`status` and `id` are authoritative — not this README’s milestone bullets).

Snapshot: [`docs/maintainers/data/workspace-kit-status.yaml`](docs/maintainers/data/workspace-kit-status.yaml).

## Where to go next

| Goal | Start here |
| --- | --- |
| Goals, trade-offs, gates | [`.ai/PRINCIPLES.md`](.ai/PRINCIPLES.md) |
| Roadmap & versions | [`docs/maintainers/ROADMAP.md`](docs/maintainers/ROADMAP.md) |
| Changelog | [`docs/maintainers/CHANGELOG.md`](docs/maintainers/CHANGELOG.md) |
| Release process | [`docs/maintainers/RELEASING.md`](docs/maintainers/RELEASING.md) |
| Glossary | [`docs/maintainers/TERMS.md`](docs/maintainers/TERMS.md) |
| Architecture | [`docs/maintainers/ARCHITECTURE.md`](docs/maintainers/ARCHITECTURE.md) |
| Agent/CLI execution | [`docs/maintainers/AGENTS.md`](docs/maintainers/AGENTS.md) |
| CLI visual map (diagrams) | [`docs/maintainers/CLI-VISUAL-GUIDE.md`](docs/maintainers/CLI-VISUAL-GUIDE.md) |

## License

MIT. See [`LICENSE`](LICENSE).
