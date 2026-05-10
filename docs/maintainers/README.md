<!--
  Human output path: docs/maintainers/README.md (image uses ../title_image.png from that location).
  Root README.md: generated from this body via documentation module transforms (agent notice + link rewrites).
  Audience: maintainers and developers cloning the repo.
-->

<div align="center">
  <p>
    <a href="https://www.npmjs.com/package/@workflow-cannon/workspace-kit"><img alt="npm" src="https://img.shields.io/badge/npm-workspace--kit-cb3837" /></a>
    <img alt="Node 22+" src="https://img.shields.io/badge/node-22%2B-339933" />
    <img alt="pnpm 10" src="https://img.shields.io/badge/pnpm-10-f69220" />
    <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-1f6feb" />
  </p>
  <p>
    <strong>AI workflow infrastructure for serious repositories.</strong>
  </p>
  <p>
    <strong>Deterministic agent workflows for teams that want receipts, not rituals.</strong>
  </p>
  <p>
    Workflow Cannon gives your repository a real operating system for AI-assisted work: agent-guided chat flows, a dashboard plugin for visibility and action, durable task state, policy-gated execution, and the infrastructure that keeps the whole system disciplined and inspectable.
  </p>
  <p>
    If your team wants AI to operate like part of engineering instead of orbiting around it, this is the layer that makes chat, dashboards, and automation all pull in the same direction.
  </p>
</div>

[**Install the package**](https://www.npmjs.com/package/@workflow-cannon/workspace-kit) · [npm package](https://www.npmjs.com/package/@workflow-cannon/workspace-kit) · [maintainer docs](AGENTS.md) · [agent entrypoint](../../AGENTS.md)

# Workflow Cannon

> **At a glance**
>
> Workflow Cannon is the missing operating layer between a coding agent and a production repository. Teams interact through chat and the dashboard plugin; Workflow Cannon supplies the explicit state, policy enforcement, and evidence that make those surfaces trustworthy.

> **In one line**
>
> Workflow Cannon helps engineering teams run AI-assisted development through chat and dashboard workflows with the discipline of infrastructure instead of the fragility of chat memory.

### Names (repo vs package vs commands)

| What | Meaning |
| --- | --- |
| **Workflow Cannon** | This GitHub repository and product umbrella (`workflow-cannon`). |
| **`@workflow-cannon/workspace-kit`** | The npm package name you install in other projects. |
| **`workspace-kit`** / **`wk`** | The infrastructure CLI behind the chat and dashboard experience. |

The npm package is **not** named “Workflow Cannon”; use the table above when searching docs, issues, or registry metadata.

## Quick start

Install Workflow Cannon in a real project, then **attach it with `init` before `doctor`** so validation runs against baselines, generated context, and SQLite task persistence.

```bash
npm install @workflow-cannon/workspace-kit
npx workspace-kit init
npx workspace-kit doctor
npx workspace-kit start
```

In **non-interactive** environments (CI, scripts), use `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"..."}'` or `npx workspace-kit init --yes --approval-rationale "…"` instead of the interactive confirmation prompt.

Using pnpm instead:

```bash
pnpm add @workflow-cannon/workspace-kit
pnpm exec wk init
pnpm exec wk doctor
pnpm exec wk start
```

Use `npx workspace-kit --help` / `pnpm exec wk --help` when exploring the full command surface.

What you get immediately:

- the dashboard plugin gets a trustworthy backend for status, next actions, and task views
- your chat agent gets explicit repo guidance, durable state, and governed workflows instead of pure prompt memory
- the underlying commands remain available for validation, debugging, and automation when needed

What the team experience looks like:

- open the dashboard to see status, queue shape, suggested actions, and workflow context
- work with the agent in chat using playbook-shaped flows instead of free-form prompt gymnastics
- rely on the underlying command layer when you need validation, inspection, or automation

Try a safe first lap behind the scenes:

```bash
npx workspace-kit run get-next-actions '{}'
npx workspace-kit run list-tasks '{}'
```

## Most important features

| Feature | Why it matters |
| --- | --- |
| Agent-first workflow experience | The primary experience lives in chat and the dashboard plugin, not in memorizing terminal commands |
| Deterministic infrastructure layer | The system beneath chat and dashboard surfaces stays repeatable and machine-readable |
| Durable task engine | Work state lives in persistence rather than fading inside a model context window |
| Policy-gated mutations | Sensitive operations require explicit approval where it actually counts |
| Dashboard visibility | Teams get operational visibility, next actions, and workflow status in a UI built for ongoing use |
| Evidence surfaces | Transitions, diagnostics, and audit-friendly outputs make handoffs and reviews much less fuzzy |
| Governed docs generation | Maintainer-facing and agent-facing documentation stay aligned instead of drifting apart |
| Playbook-shaped chat workflows | Onboarding, delivery, triage, intake, and recovery become repeatable instead of improvised |
| Clear operating contracts | Repo guidance, package names, and command surfaces are explicit enough for real teams and real automation |

## Why Workflow Cannon exists

Most AI coding workflows break the same way:

- the agent loses the plot halfway through a long session
- task state drifts from reality
- approvals live in chat instead of in the system that should enforce them
- "done" means "I think so"

Workflow Cannon fixes that.

It turns ad hoc agent collaboration into a governed workflow with explicit state, reliable dashboard surfaces, deterministic infrastructure, and evidence you can inspect later without reconstructing what happened from chat fragments. You still get speed. You simply stop paying the hidden tax of drift, ambiguity, and soft approvals.

## Why it hits different

### Grounded by design

Agent work should not depend on tone, momentum, or model improvisation. Workflow Cannon gives chat and dashboard workflows a repeatable command layer and a task engine that keeps execution grounded as sessions grow longer and more complex.

### Policy with teeth

Approvals are enforced where they matter. Sensitive actions require explicit policy approval in command input, not an informal acknowledgment buried somewhere in chat.

### Evidence, not folklore

If work changed state, the system can show you how, when, and why. That matters for handoffs, audits, releases, and the broader question of operational trust.

### Built for real repos

This is not a prompt collection with a thin layer of process on top. Workflow Cannon ships agent-facing guidance, dashboard surfaces, workflow contracts, task persistence, documentation generation, and the infrastructure required to make those pieces work in real engineering environments.

## The pitch in one sentence

Workflow Cannon helps engineering teams run AI-assisted development through chat and dashboard experiences that are backed by a disciplined system instead of held together by chat context alone.

## Without vs with Workflow Cannon

| Without it | With it |
| --- | --- |
| Agent behavior depends on prompt memory and chat momentum | Agent behavior is anchored to repo guidance, durable task state, and governed operating flows |
| Approvals live in conversation fragments | Approvals are enforced through structured command inputs |
| Task status drifts as sessions get longer | Task state persists outside the context window |
| Visibility comes from digging through terminals and logs | The dashboard plugin exposes workflow state in a persistent operational surface |
| Docs for humans and agents quietly fork | Generated surfaces stay aligned to governed source material |
| Handoffs rely on interpretation | Handoffs have evidence, transitions, and inspectable outputs |

## What makes Workflow Cannon shine

### It gives agents a real operating surface

Instead of relying on a long list of remembered rules, agents get concrete files, task state, command contracts, approval lanes, and generated documentation surfaces. The result is less interpretation and more infrastructure.

### It keeps chat useful without trusting chat too much

The conversation stays fast and flexible. The source of truth stays in the repository, the task engine, and deterministic CLI output. Chat remains the interface, not the entire system.

### It gives the team a dashboard instead of a scavenger hunt

Workflow Cannon pairs chat with a dashboard plugin that keeps status, next actions, and workflow context visible. That means less hunting across terminals, files, and half-remembered thread history.

### It scales past the demo phase

Workflow Cannon is strongest when a team has moved beyond one-off experiments and needs repeatability: onboarding, handoffs, release flow, improvement intake, policy-gated changes, and long-running agent sessions.

### It makes good process feel lighter, not heavier

The goal is not process for its own sake. The goal is less re-explaining, less drift, fewer ambiguous transitions, and much better odds that an agent session produces work you can trust in everyday engineering practice.

## What you can do with it

### Give agent work a real system underneath it

Track execution work in a persisted queue, move tasks through explicit transitions, and keep the current state outside the model's context window.

### Operate through chat and the dashboard plugin

Let the agent drive playbooks in chat while the dashboard shows queue state, suggested actions, status, and workflow context in a surface people can actually live in.

### Gate sensitive changes with policy approval

Require structured approval for operations that should not proceed on confidence alone.

### Keep maintainer and agent documentation in sync

Keep machine-facing and human-facing documentation aligned instead of letting them quietly diverge.

### Drive playbook-shaped workflows in chat

Use repeatable patterns for onboarding, task delivery, backlog triage, improvement intake, and long-session recovery.

### Keep a clean mental model of repo state

Workflow Cannon separates strategic docs, execution state, approval policy, and generated guidance so each layer has a clear role and boundary.

## A better way to think about it

Workflow Cannon sits in the gap between a coding agent and a normal repository.

Without it, the agent mostly has:

- a prompt
- a codebase
- a lot of optimism

With it, the agent also has:

- explicit operating guidance
- dashboard surfaces for status and action
- a task engine with durable state
- command contracts with machine-readable output
- policy enforcement for risky actions
- generated docs that stay synchronized with source guidance

That difference is the whole game. The model may be the same; the operating environment is not.

## How it works

### 1. Chat and dashboard surface

People work through the agent in chat and the dashboard plugin in the editor. Those are the product surfaces that keep workflows visible, guided, and usable day to day.

### 2. Task and policy layer

Workflow Cannon keeps execution state in a real persistence layer and applies policy approvals to the operations that need them. That reduces ambiguity around transitions and expectations.

### 3. Command and documentation layer

Underneath those experiences, Workflow Cannon provides deterministic commands, generated documentation, and explicit operating contracts so the agent and dashboard are backed by something stronger than convention.

## Explore this repository

**Needs:** Node.js **22+** (see CI), **pnpm 10** (see `packageManager` in `package.json`).

```bash
git clone https://github.com/NJLaPrell/workflow-cannon.git
cd workflow-cannon
pnpm install
pnpm run build
```

Then open the editor workflow surface:

- open the Workflow Cannon dashboard in the activity bar
- use the agent entrypoint and playbooks to drive chat-based workflows
- drop to the CLI when you need diagnostics, validation, or low-level inspection

## What this repo contains

| Area | What |
| --- | --- |
| **Chat + dashboard experience** | The primary operating surface for agents and humans working through Workflow Cannon. |
| **CLI infrastructure** | `workspace-kit` / `wk` provide the deterministic command layer beneath the chat and dashboard experience. |
| **Task engine** | Queue lives in SQLite (`.workspace-kit/tasks/workspace-kit.db`); **`tasks.persistenceBackend: json`** is rejected (**v0.40+**). Import legacy JSON via **`migrate-task-persistence`**. Lifecycle via `run-transition`. **Which task id to create** (`T###` execution vs wishlist intake vs `type: "improvement"` — same `T###` shape; legacy `imp-*` may exist in older stores): [`docs/maintainers/runbooks/wishlist-workflow.md`](runbooks/wishlist-workflow.md). **Persistence map:** **`workspace-kit run get-kit-persistence-map`** and [`docs/maintainers/runbooks/task-persistence-operator.md`](runbooks/task-persistence-operator.md). |
| **Docs** | Maintainer process, roadmap, and changelog under `docs/maintainers/`. |
| **Cursor extension** | Dashboard and editor workflow surface in `extensions/cursor-workflow-cannon/` — pnpm workspace member; build with `pnpm run ui:prepare` after root `pnpm install` (see **`CONTRIBUTING.md`**). |

Optional maintainer prompt templates may live under **`tasks/*.md`** in a repo (prompt-only; they do **not** run **`workspace-kit`**). Editor integrations are **your** config; **`workspace-kit`** is the supported CLI for kit-owned state.

## Chat-first workflows (Cursor and agents)

These are **chat-shaped** recipes: what to say, what to attach, and what you should expect back. They intentionally **do not** embed shell one-liners; when kit-owned state must change, the agent still follows [`AGENTS.md`](../../AGENTS.md) and [`AGENT-CLI-MAP.md`](../../.ai/AGENT-CLI-MAP.md) for real invocations. **Bodies** come from `chat_feature|` records in [`../../.ai/README.md`](../../.ai/README.md); regenerate **this file** and the repo-root **README.md** with the documentation module after editing them.

### Bootstrap a focused agent session

**What it is:** Start a session with real workspace state so the agent is anchored to the repo instead of running on thread momentum.

**How to drive it in chat:**

1. Open a thread at the repository root
2. Say you want a cold-start pass that reconciles dashboard and task-engine signals
3. Ask for a short summary of the next sensible work item and any blockers

### Deliver one maintainer task through the phase branch

**What it is:** Run a real delivery workflow through chat while the task store, approvals, and branch flow keep the work honest.

**How to drive it in chat:**

1. Name the T### you own
2. Attach `.ai/playbooks/task-to-phase-branch.md` with `@` or enable `.cursor/rules/playbook-task-to-phase-branch.mdc`
3. Tell the agent to follow the playbook order for branch hygiene, PR targets into `release/phase-N`, and tier-A transitions with JSON policy approval per `.ai/AGENT-CLI-MAP.md`

### Research friction and log improvement work

**What it is:** Turn rough workflow pain into bounded improvement tasks instead of letting good observations die in chat.

**How to drive it in chat:**

1. Describe where friction showed up such as sessions, docs, dashboard UX, policy, or release ops
2. Attach `.ai/playbooks/improvement-task-discovery.md` or `.cursor/rules/playbook-improvement-task-discovery.mdc`
3. Ask the agent to follow the playbook checkpoints and persist only through the tier-B commands it names when work should land in the queue

### Triage improvement backlog into ready work

**What it is:** Promote only the strongest improvement work by forcing explicit tradeoffs, evidence, and a bounded shortlist.

**How to drive it in chat:**

1. Ask for a list of improvement-task candidates that are still proposed
2. Attach `.ai/playbooks/improvement-triage-top-three.md` or `.cursor/rules/playbook-improvement-triage-top-three.mdc`
3. Have the agent document rationale for each pick and use accept-style transitions only after the rubric is satisfied

### Move wishlist ideas toward execution tasks

**What it is:** Turn loose ideas into execution-ready work without losing the planning context that made them worth keeping.

**How to drive it in chat:**

1. Paste or describe ranked wishlist items and constraints
2. Attach `.ai/playbooks/wishlist-intake-to-execution.md` or `.cursor/rules/playbook-wishlist-intake-to-execution.mdc`
3. Tell the agent to follow intake questions then conversion steps the playbook specifies

### Run structured onboarding in chat

**What it is:** Set collaboration defaults once so future sessions start with less drift and less repeated setup.

**How to drive it in chat:**

1. Open Cursor chat where rules can attach
2. Attach `.ai/playbooks/workspace-kit-chat-onboarding.md` or `.cursor/rules/playbook-workspace-kit-chat-onboarding.mdc`
3. Work through each numbered step and save answers when the playbook says to stop and persist

### Run the behavior interview

**What it is:** Make collaboration style explicit so the agent can work with your team instead of guessing at tone and depth.

**How to drive it in chat:**

1. Attach `.ai/playbooks/workspace-kit-chat-behavior-interview.md` or `.cursor/rules/playbook-workspace-kit-chat-behavior-interview.mdc`
2. Answer each question in order and save per-step outputs
3. Ask the agent to summarize effective profile hints without overriding policy or approval gates

### Refresh generated maintainer documentation

**What it is:** Rebuild the human-facing docs after source changes so the polished surfaces stay aligned with the governed records underneath.

**How to drive it in chat:**

1. Point the agent at `src/modules/documentation/RULES.md` for precedence
2. Say which document types you touched and that you want the documentation module batch or single-document generation
3. Have the agent report paths written and validation or evidence lines from the module output

### Recover from a long or compacted chat

**What it is:** Reset the session from repo truth when the thread gets long, compacted, or just a little too confident.

**How to drive it in chat:**

1. Attach `.cursor/rules/cursor-long-session-hygiene.mdc` if you want a short checklist
2. Ask the agent to re-walk `.ai/agent-source-of-truth-order.md`
3. Direct it to restate task status from the configured task store only after fresh read-only inspection

## New contributors — safe task transition (≤5 hops)

1. **README** (this page) — install, **`wk init`**, **`wk doctor`**, **`wk start`**, then `wk run` / dashboard.  
2. [`AGENTS.md`](../../AGENTS.md) + [`.ai/agent-source-of-truth-order.md`](../../.ai/agent-source-of-truth-order.md) — agent precedence; **`tasks/*.md`** templates are prompt-only.  
3. [`.ai/AGENT-CLI-MAP.md`](../../.ai/AGENT-CLI-MAP.md) — Tier **A** **`run-transition`** copy-paste JSON.  
4. [`.ai/POLICY-APPROVAL.md`](../../.ai/POLICY-APPROVAL.md) — when JSON **`policyApproval`** is required vs env approval.  
5. Run in a shell, e.g. `pnpm exec wk run run-transition '{"taskId":"T###","action":"start","policyApproval":{"confirmed":true,"rationale":"your reason"}}'` (replace **`T###`**).

## Policy and approvals (read this before mutating state)

Sensitive `workspace-kit run` commands require JSON **`policyApproval`** in the third CLI argument. Chat approval is not enough. Env-based approval applies to `init` / `upgrade` / `config`, not the `run` path.

- **Agents:** [`.ai/POLICY-APPROVAL.md`](../../.ai/POLICY-APPROVAL.md) and [`.ai/AGENT-CLI-MAP.md`](../../.ai/AGENT-CLI-MAP.md)
- **Maintainer prose (human):** [`docs/maintainers/POLICY-APPROVAL.md`](POLICY-APPROVAL.md), [`docs/maintainers/AGENT-CLI-MAP.md`](AGENT-CLI-MAP.md)

## Project status and roadmap

Release cadence, phase history, and strategic decisions: [`docs/maintainers/ROADMAP.md`](ROADMAP.md). **Live execution queue:** the configured task store (default SQLite at `.workspace-kit/tasks/workspace-kit.db`; JSON at `.workspace-kit/tasks/state.json` when opted in). **`status` and `id` are authoritative** — not this README’s milestone bullets.

Snapshot: [`docs/maintainers/data/workspace-kit-status.yaml`](data/workspace-kit-status.yaml).

## Where to go next

| Goal | Start here |
| --- | --- |
| Goals, trade-offs, gates | [`.ai/PRINCIPLES.md`](../../.ai/PRINCIPLES.md) |
| Roadmap & versions | [`docs/maintainers/ROADMAP.md`](ROADMAP.md) |
| Changelog | [`docs/maintainers/CHANGELOG.md`](CHANGELOG.md) |
| Release process | [`docs/maintainers/RELEASING.md`](RELEASING.md) |
| Glossary | [`.ai/TERMS.md`](../../.ai/TERMS.md) (agents); [`docs/maintainers/TERMS.md`](TERMS.md) (maintainers) |
| Architecture | [`.ai/ARCHITECTURE.md`](../../.ai/ARCHITECTURE.md) (agents); [`docs/maintainers/ARCHITECTURE.md`](ARCHITECTURE.md) (maintainers) |
| Agent/CLI execution | [`AGENTS.md`](../../AGENTS.md), [`.ai/AGENT-CLI-MAP.md`](../../.ai/AGENT-CLI-MAP.md); maintainer index [`docs/maintainers/AGENTS.md`](AGENTS.md) |
| CLI visual map (diagrams) | [`.ai/CLI-VISUAL-GUIDE.md`](../../.ai/CLI-VISUAL-GUIDE.md) |

## License

MIT. See [`LICENSE`](../LICENSE).
