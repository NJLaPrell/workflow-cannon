<!--
  Human output path: docs/maintainers/README.md (image uses ../title_image.png from that location).
  Root README.md: mirror this body but use title_image.png and keep the agent notice line at the very top.
  Audience: developers cloning the repo or adding @workflow-cannon/workspace-kit to a project who want to run something useful in minutes.
-->

<div align="center">
  <img src="../title_image.png" alt="Workflow Cannon" width="720" />
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

Verify the kit sees your workspace (short bin: **`wk`**, same as **`workspace-kit`**):

```bash
pnpm exec wk doctor
pnpm exec wk --help
```

If **`node_modules/.bin`** is on your **`PATH`**, you can run **`wk doctor`** / **`wk --help`** directly.

Try **read-only** task-engine queries:

```bash
pnpm exec wk run list-tasks '{}'
pnpm exec wk run get-next-actions '{}'
```

**Developing:** after edits, `pnpm run build` then `pnpm test` (or `pnpm run phase5-gates` before larger changes). The root package lists **`@workflow-cannon/workspace-kit@workspace:^`** as a **`devDependency`** so **`pnpm install`** links **`wk`** into **`node_modules/.bin`**. Use **`pnpm exec wk …`** or **`pnpm run wk …`** / **`node dist/cli.js`**. Module commands via the npm script: **`pnpm run wk run <cmd> '<json>'`** (no extra `--` before `run`). After **`npm install @workflow-cannon/workspace-kit`** elsewhere, **`wk`** / **`workspace-kit`** are on `PATH` via `node_modules/.bin`.

## Quick start (use the package in another project)

```bash
npm install @workflow-cannon/workspace-kit
npx wk --help
```

Or with pnpm: `pnpm add @workflow-cannon/workspace-kit` then `pnpm exec wk --help` (or `pnpm exec workspace-kit --help`).

## What this repo contains

| Area | What |
| --- | --- |
| **CLI** | `workspace-kit` — `doctor`, `config`, `run <module-command>` (see `workspace-kit run` with no args for the list). |
| **Task engine** | Canonical queue in `.workspace-kit/tasks/state.json`; lifecycle via `run-transition`. Wishlist ideation uses ids `W###` (see maintainer runbooks). |
| **Docs** | Maintainer process, roadmap, and changelog under `docs/maintainers/`. |
| **Cursor extension** (optional) | Thin UI in `extensions/cursor-workflow-cannon/` — pnpm workspace; build with `pnpm run ui:prepare` (see root **`CONTRIBUTING.md`**). |

There is **no** built-in IDE slash command like `/qt` from this package; editor integrations are **your** config (e.g. `.cursor/commands/`), while **`workspace-kit`** is the supported CLI.

## Policy and approvals (read this before mutating state)

Sensitive `workspace-kit run` commands require JSON **`policyApproval`** in the third CLI argument. Chat approval is not enough. Env-based approval applies to `init` / `upgrade` / `config`, not the `run` path.

- **Human guide:** [`docs/maintainers/POLICY-APPROVAL.md`](POLICY-APPROVAL.md)
- **Copy-paste table:** [`docs/maintainers/AGENT-CLI-MAP.md`](AGENT-CLI-MAP.md)

## Project status and roadmap

Release cadence, phase history, and strategic decisions: [`docs/maintainers/ROADMAP.md`](ROADMAP.md). **Live execution queue:** `.workspace-kit/tasks/state.json` (`status` and `id` are authoritative — not this README’s milestone bullets).

Snapshot: [`docs/maintainers/data/workspace-kit-status.yaml`](data/workspace-kit-status.yaml).

## Where to go next

| Goal | Start here |
| --- | --- |
| Goals, trade-offs, gates | [`.ai/PRINCIPLES.md`](../.ai/PRINCIPLES.md) |
| Roadmap & versions | [`ROADMAP.md`](ROADMAP.md) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Release process | [`RELEASING.md`](RELEASING.md) |
| Glossary | [`TERMS.md`](TERMS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Agent/CLI execution | [`AGENTS.md`](AGENTS.md) |

## License

MIT. See [`LICENSE`](../LICENSE) at the repository root.

