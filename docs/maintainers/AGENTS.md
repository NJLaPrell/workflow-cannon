# AGENTS

Basic operating guidance for AI agents working in this repository.

**Agent vs maintainer docs:** For routine **`workspace-kit`** execution, CLI tiers, and policy approval, prefer **`.ai/AGENTS.md`**, **`.ai/machine-cli-policy.md`**, **`.ai/WORKSPACE-KIT-SESSION.md`**, and module **`instructions/`** — not long-form `docs/maintainers/` prose. This file remains the **human-oriented** source-of-truth list and maintainer playbooks index.

## Source-of-truth order

1. `.ai/PRINCIPLES.md` — goals, trade-off order, approval gates
2. `.ai/module-build.md` — module development contracts and enforcement
3. `docs/maintainers/ROADMAP.md` — phase strategy and release cadence
4. canonical task-engine state (default: SQLite `.workspace-kit/tasks/workspace-kit.db`; JSON opt-out: `.workspace-kit/tasks/state.json`) — execution queue and dependency ordering (**`status` and `id` are authoritative**; do not infer “current phase” only from chat history or static README bullet lists)
5. `docs/maintainers/data/workspace-kit-status.yaml` — `current_kit_phase` and maintainer focus snapshot
6. `docs/maintainers/RELEASING.md` — release gates and evidence requirements
7. `docs/maintainers/POLICY-APPROVAL.md` — when `workspace-kit run` needs JSON `policyApproval` vs env approval for `config`/`init`/`upgrade`
8. `docs/maintainers/AGENT-CLI-MAP.md` — tier table (task transitions vs other sensitive `run` commands) and copy-paste JSON; visual companion [`CLI-VISUAL-GUIDE.md`](./CLI-VISUAL-GUIDE.md) (ASCII + Mermaid topology, decision flow, approval lanes, module router)
9. `docs/maintainers/TERMS.md` — canonical terminology
10. `docs/maintainers/module-build-guide.md` — human-readable module development companion

**Documentation precedence (conflict resolution):** If two sources disagree, walk the numbered list above — higher entries win for **governance and process**. For a short narrative map (router vs doctor catalog, policy surfaces, layering exceptions), see **`docs/maintainers/ARCHITECTURE.md` → Documentation precedence**.

## Documentation tiers (progressive disclosure)

- **T0 (~bootstrap)** — From the top of this file through **CLI-first execution**: enough to pick the next doc and avoid unsafe shortcuts.
- **T1 (depth)** — Playbooks, runbooks, **`ARCHITECTURE`**, **`AGENT-CLI-MAP`**, **`CLI-VISUAL-GUIDE`**, module guides, and **`.ai/`** machine contracts.

## Canonical, generated, and mirrored docs

| Kind | Where | Notes |
| --- | --- | --- |
| Canonical maintainer prose | `docs/maintainers/*.md` | Primary edits for process and strategy. |
| Machine / generated | `.ai/*.md` | Some outputs are **generated** by the documentation module; **`.ai/PRINCIPLES.md`** and **`.ai/module-build.md`** are **hand-maintained** machine dialect — see **`docs/maintainers/RELEASING.md`** when changing **`rule|id=R###`**. |
| Cursor enforcement mirrors | `.cursor/rules/*.mdc` | Pointer-first; see **`docs/maintainers/module-build-guide.md`** → **Cursor rules**. |

## `/qt` quick-task templates (`tasks/*.md`)

**`/qt`** only materializes **`tasks/*.md`** in the editor. It **does not** run **`workspace-kit`** and **cannot** satisfy **`policyApproval`** (or env approval). If a template step changes task-engine or other kit-owned state, run the **exact** line from **`docs/maintainers/AGENT-CLI-MAP.md`** in a real shell (Tier **A** **`run-transition`**, Tier **B** sensitive **`run`**, etc.).

## Maintainer playbooks (direction sets)

**Playbooks** are ordered maintainer checklists under [`docs/maintainers/playbooks/`](./playbooks/) that **link** canonical docs instead of copying them. Authoring rules and stable ids: [`playbooks/README.md`](./playbooks/README.md). Terminology: [`TERMS.md`](./TERMS.md) → **Direction set (maintainer playbook)**.

| Playbook id | Path | Use when |
| --- | --- | --- |
| `phase-closeout-and-release` | [`playbooks/phase-closeout-and-release.md`](./playbooks/phase-closeout-and-release.md) | Closing a phase and cutting a release (queue, delivery loop, human publish gate, RELEASING evidence) |
| `task-to-main` | [`playbooks/task-to-main.md`](./playbooks/task-to-main.md) | Single task: pull `main`, feature branch, PR, review/fix loop, merge, `run-transition` complete |
| `improvement-task-discovery` | [`playbooks/improvement-task-discovery.md`](./playbooks/improvement-task-discovery.md) | Research and log improvements: transcripts, docs drift, architecture, policy/CLI UX, release friction |
| `improvement-triage-top-three` | [`playbooks/improvement-triage-top-three.md`](./playbooks/improvement-triage-top-three.md) | Triage **`improvement`** tasks: rubric, pick ≤3, **`accept`** to **`ready`**, verify queue |

How to attach playbooks in an editor session and limits of auto-loading: [`runbooks/agent-playbooks.md`](./runbooks/agent-playbooks.md).

Optional requestable Cursor rules:

- Phase closeout + release: `.cursor/rules/playbook-phase-closeout.mdc`
- Single **`T###`** to **`main`** (branch, PR, review loop, merge, transitions): `.cursor/rules/playbook-task-to-main.mdc`
- **Improvement** research and logging (transcripts, docs, architecture, ops): `.cursor/rules/playbook-improvement-task-discovery.mdc`
- **Improvement** triage (≤3 **`proposed`** → **`ready`**): `.cursor/rules/playbook-improvement-triage-top-three.mdc`

## Long threads and context reload

When a session is long, was compacted, or you are unsure stale chat context matches the repo:

1. Re-walk the **Source-of-truth order** (above) if governance or policy steps feel ambiguous.
2. Run **`workspace-kit doctor`**, then **`workspace-kit run get-next-actions '{}'`** (or use the Workflow Cannon extension dashboard, which calls **`dashboard-summary`**).
3. Re-read **`docs/maintainers/data/workspace-kit-status.yaml`** and the authoritative task list via **`workspace-kit run list-tasks`** / **`get-next-actions`** (or the configured task store file if using JSON) — do not rely on chat memory for task `status` or phase alone.
4. Optional: attach **`.cursor/rules/cursor-long-session-hygiene.mdc`** in Cursor for a short reload checklist; prefer **requestable** rules over bloating always-on rules. See **`docs/maintainers/runbooks/cursor-long-session.md`**.
5. Task queue / Git / extension mental model: **`docs/maintainers/runbooks/agent-task-engine-ergonomics.md`** (merge ≠ task **`complete`**, **`suggestedNext`** vs **`get-task`**, read-only kit inspection).
6. **`/qt`** templates: any step that persists kit state must include the matching **`workspace-kit`** invocation from **`docs/maintainers/AGENT-CLI-MAP.md`** before you treat the template as closed.

## Core expectations

- Use high autonomy when task intent is clear.
- Follow soft-gate behavior on principle conflicts: state the conflict and ask for confirmation.
- Stop when an action risks irreversible data loss or critical secret exposure without approval.
- Require explicit user confirmation before:
  - release actions
  - migration or upgrade-path changes
  - policy or approval-model changes
- Prefer small, reversible, evidence-backed changes.

## Working rules

- **`pnpm run check`** — TypeScript **`--noEmit`**, manifest/contract guards, CLI map coverage, orphan instructions, principles rule-id snapshot, and AGENTS source-of-truth path snapshot. Stages and fix hints: **`scripts/run-check-stages.mjs`**.
- Keep strategy in `docs/maintainers/ROADMAP.md`, execution detail in task-engine state (`workspace-kit run` task commands), and release process in `docs/maintainers/RELEASING.md`; treat the configured task store (default SQLite) as the persistence view.
- Treat `docs/maintainers/` governance/process docs as canonical; overlapping `.cursor/rules/` files are enforcement mirrors and should not introduce conflicting policy.
- When scope changes, update all related docs in the same change set.
- Preserve deterministic behavior and compatibility; document migration impact when changes affect consumers.

## CLI-first execution (kit-owned state)

Before changing **task-engine state**, **policy traces**, **approvals**, **transcript/improvement** stores, or **mutating doc generation**, run the matching **`workspace-kit`** command. What counts as approval for **`workspace-kit run`**: `docs/maintainers/POLICY-APPROVAL.md#canonical-what-counts-as-approval-for-workspace-kit-run`.

- Fast session bootstrap: run `workspace-kit doctor`, then `workspace-kit run` (no subcommand), then use `docs/maintainers/AGENT-CLI-MAP.md` for command/approval tiering. For diagrams (topology, when to use CLI, two approval lanes), open `docs/maintainers/CLI-VISUAL-GUIDE.md`.
- **Do not** hand-edit `.workspace-kit/tasks/state.json` for lifecycle transitions except documented recovery; use `workspace-kit run run-transition` (`docs/maintainers/AGENT-CLI-MAP.md`).
- **Cursor rule:** `.cursor/rules/workspace-kit-cli-execution.mdc` mirrors this section and links the Agent CLI map.

### Native SQLite (`better-sqlite3`) portability

Default task persistence uses **`better-sqlite3`**. **`workspace-kit doctor`** surfaces load failures with rebuild hints when **`tasks.persistenceBackend`** is **`sqlite`**. Full consumer troubleshooting (symptoms, ordered recovery, postinstall behavior): **`docs/maintainers/runbooks/native-sqlite-consumer-install.md`**. Distribution stance: **`docs/maintainers/ADR-native-sqlite-consumer-distribution.md`**.

### When the agent must run terminal commands (examples)

1. **Task transition**

   ```bash
   workspace-kit run run-transition '{"taskId":"T285","action":"start","policyApproval":{"confirmed":true,"rationale":"start work on task"}}'
   ```

2. **Sensitive `run` (policy JSON, not env approval)**

   ```bash
   workspace-kit run generate-recommendations '{"policyApproval":{"confirmed":true,"rationale":"improvement pass"}}'
   ```

3. **`config` / `init` / `upgrade` (env approval)**

   ```bash
   export WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"adjust cadence"}'
   workspace-kit config set improvement.cadence.minIntervalMinutes 30 --json
   ```

## Agent behavior profiles (advisory)

Optional **interaction posture** (how to collaborate in chat) via the **`agent-behavior`** module. Profiles are **not** permission to skip policy, approvals, or PRINCIPLES.

- Session start (optional): `workspace-kit run resolve-behavior-profile '{}'` and honor `data.effective` for tone, check-ins, and explanation depth.
- User unsure which style: `workspace-kit run interview-behavior-profile` (see `docs/maintainers/AGENT-CLI-MAP.md`) or compare builtins with `explain-behavior-profiles`.
- Requestable Cursor rule: `.cursor/rules/agent-behavior.mdc`.

## Task execution

- **Single task → `main` (maintainer delivery):** When you are implementing **one** execution task (**`T###`**) through a feature branch, pull request, review, and merge to **`main`**, **follow the ordered playbook** [`playbooks/task-to-main.md`](./playbooks/task-to-main.md) — attach it (`@`) or enable **`.cursor/rules/playbook-task-to-main.mdc`**. It sequences pull/branch, commits, PR, review/fix iterations, merge, and Tier A **`run-transition`** (`start` / `complete`) with **`policyApproval`**. Same expectations as **`.cursor/rules/maintainer-delivery-loop.mdc`**, step-by-step for one task.
- Execute tasks in dependency order from task-engine state (`workspace-kit run list-tasks` / `get-next-actions`).
- Optional session opener: run `workspace-kit run get-next-actions '{}'`, then fetch the chosen task with `workspace-kit run get-task '{"taskId":"Txxx"}'` before implementation.
- Treat each task's `Approach`, `Technical scope`, and `Acceptance criteria` as binding implementation guidance.
- If a task is too large for one change, split into supporting tasks before starting implementation.

## Improvement discovery (research → log)

When **exploring** the repo for friction to capture as **`type: "improvement"`** work (or **`generate-recommendations`** / transcript-driven intake), **follow the ordered playbook** [`playbooks/improvement-task-discovery.md`](./playbooks/improvement-task-discovery.md) — attach it (`@`) or enable **`.cursor/rules/playbook-improvement-task-discovery.mdc`**. It directs where to look (sessions/transcripts, documentation, architecture, parity/CI, config/policy UX, release ops) and how to **persist** via Tier **B** commands from [`AGENT-CLI-MAP.md`](./AGENT-CLI-MAP.md), not chat-only notes.

## Improvement triage (backlog → ready queue)

When **selecting** which **`improvement`** tasks should enter (or compete in) the **`ready`** queue, **follow** [`playbooks/improvement-triage-top-three.md`](./playbooks/improvement-triage-top-three.md) — attach (`@`) or **`.cursor/rules/playbook-improvement-triage-top-three.mdc`**. It standardizes listing **`proposed`** items, a **rubric** (principles, evidence, impact, dedupe, roadmap), picking **at most three**, documenting rationale, and Tier A **`accept`** transitions.

## Documentation generation

Use the documentation module for doc generation:

- `document-project` generates all templates in batch (AI to `.ai/`, human to `docs/maintainers/`).
- `generate-document` generates a single document by type.
- Follow `src/modules/documentation/RULES.md` for precedence and validation. Shipped templates and command inputs are documented in `src/modules/documentation/instructions/document-project.md`, `src/modules/documentation/instructions/generate-document.md`, and `src/modules/documentation/README.md`.
