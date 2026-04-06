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
| **Task engine** | Default execution queue in SQLite (`.workspace-kit/tasks/workspace-kit.db`); JSON at `.workspace-kit/tasks/state.json` is opt-out / legacy import only. Lifecycle via `run-transition`. Wishlist uses ids `W###` (see maintainer runbooks). |
| **Docs** | Maintainer process, roadmap, and changelog under `docs/maintainers/`. |
| **Cursor extension** (optional) | Thin UI in `extensions/cursor-workflow-cannon/` — pnpm workspace; build with `pnpm run ui:prepare` (see root **`CONTRIBUTING.md`**). |

Optional maintainer prompt templates may live under **`tasks/*.md`** in a repo (prompt-only; they do **not** run **`workspace-kit`**). Editor integrations are **your** config; **`workspace-kit`** is the supported CLI for kit-owned state.

## Chat-first workflows (Cursor and agents)

These are **chat-shaped** recipes: what to say, what to attach, and what you should expect back. They intentionally **do not** embed shell one-liners; when kit-owned state must change, the agent still follows [`AGENTS.md`](AGENTS.md) and [`AGENT-CLI-MAP.md`](AGENT-CLI-MAP.md) for real invocations. **Bodies** come from `chat_feature|` records in [`../../.ai/README.md`](../../.ai/README.md); regenerate this file with the documentation module after editing them.

### Bootstrap a focused agent session

**What it is:** Agree on workspace health and the real task queue before implementation so nobody trusts stale chat context.

**How to drive it in chat:**

1. Open a thread at the repository root
2. Say you want a cold-start pass that reconciles doctor-style signals with task-engine evidence
3. Ask for a short summary of the next sensible work item and any blockers

### Deliver one maintainer task through the phase branch

**What it is:** Sequence branch, PR, review, merge, and task lifecycle the way maintainers expect, with chat steering and the task store as evidence.

**How to drive it in chat:**

1. Name the T### you own
2. Attach `docs/maintainers/playbooks/task-to-phase-branch.md` with `@` or enable `.cursor/rules/playbook-task-to-phase-branch.mdc`
3. Tell the agent to follow the playbook order for branch hygiene, PR targets into `release/phase-N`, and tier-A transitions with JSON policy approval where the maintainer CLI map requires it

### Research friction and log improvement work

**What it is:** Turn messy observations into bounded improvement tasks using the discovery playbook instead of free-form chat notes.

**How to drive it in chat:**

1. Describe where friction showed up such as sessions, docs, CLI UX, policy, or release ops
2. Attach `docs/maintainers/playbooks/improvement-task-discovery.md` or `.cursor/rules/playbook-improvement-task-discovery.mdc`
3. Ask the agent to follow the playbook checkpoints and persist only through the tier-B commands it names when work should land in the queue

### Triage improvement backlog into ready work

**What it is:** Pick at most three proposed improvements with explicit rubric and evidence before promoting to ready.

**How to drive it in chat:**

1. Ask for a list of improvement-task candidates that are still proposed
2. Attach `docs/maintainers/playbooks/improvement-triage-top-three.md` or `.cursor/rules/playbook-improvement-triage-top-three.mdc`
3. Have the agent document rationale for each pick and use accept-style transitions only after the rubric is satisfied

### Move wishlist ideas toward execution tasks

**What it is:** Rank ideation, narrow scope, and hand off to execution tasks without losing planning tokens.

**How to drive it in chat:**

1. Paste or describe ranked wishlist items and constraints
2. Attach `docs/maintainers/playbooks/wishlist-intake-to-execution.md` or `.cursor/rules/playbook-wishlist-intake-to-execution.mdc`
3. Tell the agent to follow intake questions then conversion steps the playbook specifies

### Run structured onboarding in chat

**What it is:** Capture role and temperament as numbered answers you can reuse across sessions.

**How to drive it in chat:**

1. Open Cursor chat where rules can attach
2. Attach `docs/maintainers/playbooks/workspace-kit-chat-onboarding.md` or `.cursor/rules/playbook-workspace-kit-chat-onboarding.mdc`
3. Work through each numbered step and save answers when the playbook says to stop and persist

### Run the behavior interview

**What it is:** Fill the scribe-style questionnaire so collaboration defaults are explicit.

**How to drive it in chat:**

1. Attach `docs/maintainers/playbooks/workspace-kit-chat-behavior-interview.md` or `.cursor/rules/playbook-workspace-kit-chat-behavior-interview.mdc`
2. Answer each question in order and save per-step outputs
3. Ask the agent to summarize effective profile hints without overriding policy or approval gates

### Refresh generated maintainer documentation

**What it is:** After changing keyed `.ai` sources or templates under the documentation module, regenerate paired human files deterministically.

**How to drive it in chat:**

1. Point the agent at `src/modules/documentation/RULES.md` for precedence
2. Say which document types you touched and that you want the documentation module batch or single-document generation
3. Have the agent report paths written and validation or evidence lines from the module output

### Recover from a long or compacted chat

**What it is:** Replay governance order and queue facts from files and kit output instead of trusting thread memory.

**How to drive it in chat:**

1. Attach `.cursor/rules/cursor-long-session-hygiene.mdc` if you want a short checklist
2. Ask the agent to re-walk the source-of-truth order in `docs/maintainers/AGENTS.md`
3. Direct it to restate task status from the configured task store only after fresh read-only inspection

## Policy and approvals (read this before mutating state)

Sensitive `workspace-kit run` commands require JSON **`policyApproval`** in the third CLI argument. Chat approval is not enough. Env-based approval applies to `init` / `upgrade` / `config`, not the `run` path.

- **Human guide:** [`docs/maintainers/POLICY-APPROVAL.md`](POLICY-APPROVAL.md)
- **Copy-paste table:** [`docs/maintainers/AGENT-CLI-MAP.md`](AGENT-CLI-MAP.md)

## Project status and roadmap

Release cadence, phase history, and strategic decisions: [`docs/maintainers/ROADMAP.md`](ROADMAP.md). **Live execution queue:** the configured task store (default SQLite `.workspace-kit/tasks/workspace-kit.db`; JSON `.workspace-kit/tasks/state.json` when opted in). **`status` and `id` are authoritative** — not this README’s milestone bullets.

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
