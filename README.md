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

### Where to start after build

| Step | Command | What you get |
| --- | --- | --- |
| 1 | `node dist/cli.js --help` | Orientation: top-level commands, first-run path, doc pointers |
| 2 | `node dist/cli.js doctor` | Confirms kit contract files and config resolve |
| 3 | `node dist/cli.js run` | **Command menu** — every runnable `workspace-kit run <cmd>` |
| 4 | `node dist/cli.js run get-next-actions '{}'` | Read-only suggestion for what to do next |

**Developing:** after edits, `pnpm run build` then `pnpm test` (or `pnpm run phase5-gates` before larger changes). **`workspace-kit` is not on your PATH by default** — invoke it in one of these ways:

| Situation | Example |
| --- | --- |
| This repo, after `pnpm run build` | `node dist/cli.js --help` (same subcommands as `workspace-kit`) |
| This repo, dev dependency on PATH via pnpm | `pnpm exec workspace-kit --help` |
| Another project with the package installed | `npx workspace-kit --help` or `pnpm exec workspace-kit --help` |

**`workspace-kit run` with no subcommand is the full module command list** — that is the usual “what can I run?” answer.

Try **read-only** task-engine queries:

```bash
node dist/cli.js run list-tasks '{}'
node dist/cli.js run get-next-actions '{}'
```

## Quick start (use the package in another project)

```bash
npm install @workflow-cannon/workspace-kit
npx workspace-kit --help
npx workspace-kit run
```

`--help` prints the top-level guide; `run` with no subcommand lists every module command. In a repo that already contains maintainer docs, paths like `docs/maintainers/AGENT-CLI-MAP.md` match this repository; in a consumer project, use the copy shipped under `node_modules/@workflow-cannon/workspace-kit/` or your own docs link.

Or with pnpm: `pnpm add @workflow-cannon/workspace-kit` then `pnpm exec workspace-kit --help` and `pnpm exec workspace-kit run`.

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
