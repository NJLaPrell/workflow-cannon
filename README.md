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
| 1 | `wk --help` | Orientation: top-level commands, first-run path, doc pointers |
| 2 | `wk doctor` | Confirms kit contract files and config resolve |
| 3 | `wk run` | **Command menu** — every runnable `workspace-kit run <cmd>` |
| 4 | `wk run get-next-actions '{}'` | Read-only suggestion for what to do next |

**In this clone**, if `wk` is not on your shell **`PATH`**, run the same invocations as **`pnpm exec wk …`** (for example **`pnpm exec wk doctor`**).

**How to run `wk` here:** after `pnpm install`, the package is linked into **`node_modules/.bin`** (via a root **`devDependency`** on **`workspace-kit@workspace:^`**). Use **`pnpm exec wk …`** so you do not need a global install. If your shell already puts **`node_modules/.bin`** on **`PATH`**, you can type **`wk`** directly (same as in a consumer project).

**Developing:** after edits, `pnpm run build` then `pnpm test` (or `pnpm run pre-merge-gates` / legacy `pnpm run phase5-gates` before larger changes). The long bin name **`workspace-kit`** is the same binary as **`wk`**. Fallbacks: **`pnpm run wk …`** (npm script → **`node dist/cli.js`**) or **`node dist/cli.js`**. For module commands via the script, use **`pnpm run wk run <cmd> '<json>'`** (no extra `--` before `run` — pnpm would forward a literal `--` to the CLI).

| Situation | Example |
| --- | --- |
| This repo, after `pnpm install` + `pnpm run build` | `pnpm exec wk --help`, or `wk --help` when `.bin` is on `PATH` |
| Global / linked install of the package | `wk --help` or `workspace-kit --help` |
| Another project with the package installed | `npx wk --help` or `npx workspace-kit --help` |

**`workspace-kit run` with no subcommand is the full module command list** — that is the usual “what can I run?” answer.

Try **read-only** task-engine queries:

```bash
pnpm exec wk run list-tasks '{}'
pnpm exec wk run get-next-actions '{}'
```

## Quick start (use the package in another project)

```bash
npm install @workflow-cannon/workspace-kit
npx workspace-kit --help
npx workspace-kit run
```

**Read-only first lap (no default config writes):** `npx workspace-kit doctor`, `npx workspace-kit run` (command menu), `npx workspace-kit run get-next-actions '{}'` — same discovery path as in-repo **`pnpm exec wk …`** / **`wk …`**.

`--help` prints the top-level guide; `run` with no subcommand lists every module command. In a repo that already contains maintainer docs, paths like `docs/maintainers/AGENT-CLI-MAP.md` match this repository; in a consumer project, use the copy shipped under `node_modules/@workflow-cannon/workspace-kit/` or your own docs link.

Or with pnpm: `pnpm add @workflow-cannon/workspace-kit` then `pnpm exec wk --help` and `pnpm exec wk run` (or `pnpm exec workspace-kit …`).

## What this repo contains

| Area | What |
| --- | --- |
| **CLI** | `workspace-kit` — `doctor`, `config`, `run <module-command>` (see `workspace-kit run` with no args for the list). |
| **Task engine** | Canonical queue in SQLite by default (`.workspace-kit/tasks/workspace-kit.db`); set `tasks.persistenceBackend: json` to use `.workspace-kit/tasks/state.json` instead. Lifecycle via `run-transition`. **Which task id to create** (`T###` execution vs wishlist intake vs `imp-*`): one-page table in [`docs/maintainers/runbooks/wishlist-workflow.md`](docs/maintainers/runbooks/wishlist-workflow.md). **Persistence map:** [`docs/maintainers/runbooks/task-persistence-operator.md`](docs/maintainers/runbooks/task-persistence-operator.md). |
| **Docs** | Maintainer process, roadmap, and changelog under `docs/maintainers/`. |
| **Cursor extension** (optional) | Thin UI in `extensions/cursor-workflow-cannon/` — pnpm workspace member; build with `pnpm run ui:prepare` after root `pnpm install` (see **`CONTRIBUTING.md`**). |

There is **no** built-in IDE slash command like `/qt` from this package; editor integrations are **your** config (e.g. `.cursor/commands/`), while **`workspace-kit`** is the supported CLI.

## New contributors — safe task transition (≤5 hops)

1. **README** (this page) — install, `wk doctor`, `wk run` menu.  
2. [`docs/maintainers/AGENTS.md`](docs/maintainers/AGENTS.md) — source-of-truth order, tiers, **`/qt`** limits.  
3. [`docs/maintainers/AGENT-CLI-MAP.md`](docs/maintainers/AGENT-CLI-MAP.md) — Tier **A** **`run-transition`** copy-paste JSON.  
4. [`docs/maintainers/POLICY-APPROVAL.md`](docs/maintainers/POLICY-APPROVAL.md) — when JSON **`policyApproval`** is required vs env approval.  
5. Run in a shell, e.g. `pnpm exec wk run run-transition '{"taskId":"T###","action":"start","policyApproval":{"confirmed":true,"rationale":"your reason"}}'` (replace **`T###`**).

## Policy and approvals (read this before mutating state)

Sensitive `workspace-kit run` commands require JSON **`policyApproval`** in the third CLI argument. Chat approval is not enough. Env-based approval applies to `init` / `upgrade` / `config`, not the `run` path.

- **Human guide:** [`docs/maintainers/POLICY-APPROVAL.md`](docs/maintainers/POLICY-APPROVAL.md)
- **Copy-paste table:** [`docs/maintainers/AGENT-CLI-MAP.md`](docs/maintainers/AGENT-CLI-MAP.md)

## Project status and roadmap

Release cadence, phase history, and strategic decisions: [`docs/maintainers/ROADMAP.md`](docs/maintainers/ROADMAP.md). **Live execution queue:** the configured task store (default SQLite at `.workspace-kit/tasks/workspace-kit.db`; JSON at `.workspace-kit/tasks/state.json` when opted in). **`status` and `id` are authoritative** — not this README’s milestone bullets.

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
