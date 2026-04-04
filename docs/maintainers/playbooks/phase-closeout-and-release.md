# Playbook: phase closeout and release

**Playbook id:** `phase-closeout-and-release`  
**Use when:** Closing a numbered phase and cutting a GitHub + npm release for `@workflow-cannon/workspace-kit`.

This file is an **ordered checklist**. Canonical prose lives in the linked docs — do not treat this as a fork of [`RELEASING.md`](../RELEASING.md).

## 0) Attach context

- Confirm [`docs/maintainers/TERMS.md`](../TERMS.md) vocabulary (task-engine state, approval gates, evidence).
- **Phase integration branch** for phase **`<N>`** is **`release/phase-<N>`** (see **`.cursor/rules/branching-tagging-strategy.mdc`** and [`task-to-phase-branch.md`](./task-to-phase-branch.md)).
- For **policy-sensitive** `workspace-kit run` commands, use JSON **`policyApproval`** on the **third** CLI argument; for `config` / `init` / `upgrade`, see [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).

## 1) Refresh execution state (read-only discovery)

1. `workspace-kit doctor`
2. `workspace-kit run get-next-actions '{}'`
3. Optional: `workspace-kit run list-tasks '{}'` filtered as needed.

Do **not** infer task `status` from chat memory — the configured task store (default SQLite `.workspace-kit/tasks/workspace-kit.db`) is authoritative.

## 2) Finish remaining phase work (delivery loop)

Follow the **maintainer delivery loop** for each execution task: task branch from **`release/phase-<N>`**, validate, **PR into the phase branch** (not `main`), merge, then task transitions — see [`task-to-phase-branch.md`](./task-to-phase-branch.md).

- Cursor rule mirror: `.cursor/rules/maintainer-delivery-loop.mdc`
- Human-oriented summary: [`docs/maintainers/AGENTS.md`](../AGENTS.md) (task execution + CLI-first execution)

**Task lifecycle mutations** use Tier A from [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) — **no** hand-editing lifecycle in `state.json` except documented recovery.

Copy-paste pattern (replace `T###`, rationale, and action):

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"start","policyApproval":{"confirmed":true,"rationale":"begin task work"}}'
```

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"complete","policyApproval":{"confirmed":true,"rationale":"acceptance criteria met"}}'
```

## 3) Integrate the phase branch before merging to `main`

When **all** phase tasks that belong on **`release/phase-<N>`** are **`completed`** (or explicitly handled) and you are preparing the release:

1. `git fetch origin` and `git checkout release/phase-<N>`, then `git pull origin release/phase-<N>`.
2. Run full validation on that tip (`pnpm run build`, `pnpm run check`, `pnpm run test`, `pnpm run parity`, and **`pre-merge-gates`** / maintainer gates as in [`RELEASING.md`](../RELEASING.md)).
3. **Fix failures on the phase branch** — small follow-up PRs or commits targeting **`release/phase-<N>`** until checks are green and there are no known release blockers.

## 4) Human gate — stop before publish

**Do not** run publish automation or tag-driven release actions until a human explicitly approves, per [`RELEASING.md`](../RELEASING.md) (“Present for approval”).

Summarize scope, risk, validation evidence, and migration notes; obtain **explicit** confirmation to proceed with publish.

## 5) Release procedure (execute per RELEASING)

1. **Merge `release/phase-<N>` into `main`** via PR (or equivalent reviewed merge) using the repo’s preferred strategy, consistent with **maintainer-delivery-loop**. **`main`** should be the tip you tag unless policy says otherwise.
2. Run the full **Release procedure** in [`RELEASING.md`](../RELEASING.md): define scope, prepare artifacts (changelog + `package.json` version), run validation commands (`build`, `check`, `test`, `parity`, `check-release-metadata`, `pre-merge-gates` — alias: `phase5-gates`, doc consistency sweep), **then** publish after approval, then record evidence (tag, workflow run URL, npm).

Tier **B** `workspace-kit run` commands (non-transition) also require JSON `policyApproval` — see [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) and [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).

## 6) After publish

- Capture release evidence per [`RELEASING.md`](../RELEASING.md) → **Required release evidence**.
- Update maintainer snapshots (for example [`docs/maintainers/ROADMAP.md`](../ROADMAP.md), [`docs/maintainers/data/workspace-kit-status.yaml`](../data/workspace-kit-status.yaml)) when the phase closeout task requires it.
- Bump **`current_kit_phase`** / **`next_kit_phase`** via **`workspace-kit run update-workspace-phase-snapshot`** (and align **`kit.currentPhaseNumber`** in config when used) so **`doctor`** stays green — see [`AGENTS.md`](../AGENTS.md) → **Workspace phase snapshot**.

## 7) Phase delivery summary (agent wrap-up)

This section is the **session summary format** for operators and agents (what to paste or say when the phase is shipped). It is **not** the Phase 6b JSON **`responseTemplateId`** / **`responseTemplate`** metadata on **`workspace-kit run`** — those only shape CLI JSON output; see [`response-template-contract.md`](../response-template-contract.md) and [`runbooks/response-templates.md`](../runbooks/response-templates.md).

### Evidence rules (do not invent counts)

- **`{tasksCompleted}`:** Count execution tasks for this phase that reached **`complete`** in the **configured task store** (default SQLite **`.workspace-kit/tasks/workspace-kit.db`**). Use **`workspace-kit run list-tasks`** (filter by **`phaseKey`** matching the closed phase and/or task ids listed under that phase in [`ROADMAP.md`](../ROADMAP.md)). Do **not** infer from chat memory.
- **`{followOnTasks}`:** Maintainer-defined: count **new or newly-accepted execution tasks** intended for the **next** phase (e.g. **`ready`** with **`phaseKey`** = next phase, or tasks created during this closeout cycle), again from **task-engine output** + [`ROADMAP.md`](../ROADMAP.md). If none, state **`0`** or **none** explicitly.
- **Features delivered:** Each bullet should trace to shipped scope — e.g. [`docs/maintainers/CHANGELOG.md`](../CHANGELOG.md) entry for the release, the phase row in [`ROADMAP.md`](../ROADMAP.md), and/or ADR titles under **`docs/maintainers/`**.

### Copy-paste template

Replace placeholders; omit or shorten **Notes** lines when not applicable.

```markdown
Phase {phase} has been delivered!
{tasksCompleted} tasks complete
{followOnTasks} follow-on tasks created (or accepted to ready — per task store + ROADMAP)

Features delivered:
- {feature — cite changelog / ROADMAP / ADR}

Notes:
- **Risks / issues:** {short label}: {brief entry}
- **Opinions / additional tasking:** {short label}: {brief entry}
```
