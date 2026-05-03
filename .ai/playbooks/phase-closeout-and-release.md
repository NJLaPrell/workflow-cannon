# Playbook: phase closeout and release

**Playbook id:** `phase-closeout-and-release`  
**Use when:** Closing a numbered phase and cutting a GitHub + npm release for `@workflow-cannon/workspace-kit`.

This file is an **ordered checklist**. Canonical prose lives in the linked docs — do not treat this as a fork of [`RELEASING.md`](../RELEASING.md).

**Agent sessions:** Attach this playbook (`@` the path) when closing a phase so steps stay in context. After publish and evidence (**§6**), end with **§7** using the copy-paste template — placeholders only; do not paste long governance asides into the template body.

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
2. Run `workspace-kit run phase-delivery-preflight '{"phaseKey":"<N>","includeInProgress":false}'` and resolve every violation with PR/merge/check evidence or an explicit maintainer waiver before closeout.
3. Run `workspace-kit run release-evidence-manifest '<json>'` with human approval, release-note evidence, validation records, known risks, publish artifact placeholders/proof, and follow-up scan data. Resolve structured failures before tag/npm/GitHub release actions.
4. Run full validation on that tip (`pnpm run build`, `pnpm run check`, `pnpm run test`, `pnpm run parity`, and **`pre-merge-gates`** / maintainer gates as in [`RELEASING.md`](../RELEASING.md)).
5. **Fix failures on the phase branch** — small follow-up PRs or commits targeting **`release/phase-<N>`** until checks are green and there are no known release blockers.

## 4) Human gate — stop before publish

**Do not** run publish automation or tag-driven release actions until a human explicitly approves, per [`RELEASING.md`](../RELEASING.md) (“Present for approval”).

Summarize scope, risk, validation evidence, and migration notes; obtain **explicit** confirmation to proceed with publish.

Slash tokens such as **`approve-release`** (e.g. on **`/complete-phase`**) and chat copy are **operator intent only**; they do **not** satisfy Tier A/B **`workspace-kit run`** approval or waive the publish gate — see **`.ai/POLICY-APPROVAL.md`** → **Operator slash / chat vs Tier A/B `wk run`**.

## 5) Release procedure (execute per RELEASING)

1. **Merge `release/phase-<N>` into `main`** via PR (or equivalent reviewed merge) using the repo’s preferred strategy, consistent with **maintainer-delivery-loop**. **`main`** should be the tip you tag unless policy says otherwise.
2. Run the full **Release procedure** in [`RELEASING.md`](../RELEASING.md): define scope, prepare artifacts (changelog + `package.json` version), run validation commands (`build`, `check`, `test`, `parity`, `check-release-metadata`, `pre-merge-gates`, doc consistency sweep), **then** publish after approval, then record evidence (tag, workflow run URL, npm).

Tier **B** `workspace-kit run` commands (non-transition) also require JSON `policyApproval` — see [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) and [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).

## 6) After publish

- Capture and cite `workspace-kit run release-evidence-manifest` output per [`RELEASING.md`](../RELEASING.md) → **Required release evidence**.
- Update maintainer snapshots (for example [`docs/maintainers/ROADMAP.md`](../ROADMAP.md), [`docs/maintainers/data/workspace-kit-status.yaml`](../data/workspace-kit-status.yaml)) when the phase closeout task requires it.
- Bump **`current_kit_phase`** / **`next_kit_phase`** via **`workspace-kit run set-current-phase`** so SQLite stays canonical while config hints and the non-authoritative export stay aligned; use **`phase-status`** to verify drift before and after — see [`WORKSPACE-KIT-SESSION.md`](../WORKSPACE-KIT-SESSION.md) → **Workspace phase snapshot**.

## 7) Phase delivery summary (agent wrap-up)

This section is the **session summary format** for operators and agents (what to paste or say when the phase is shipped). Separately, **`workspace-kit run`** applies the builtin **`phase_ship`** response template automatically on phase-shipping commands such as **`run-transition`** **`complete`**, **`set-current-phase`** (non-dry-run), compatibility **`update-workspace-phase-snapshot`** (non-dry-run), and **`generate-document`** for **`ROADMAP.md`** / **`FEATURE-TAXONOMY.md`** (non-dry-run), so JSON includes **`data.presentation.matchedSections`** for closeout fields unless you override with **`responseTemplateId`**. See [`response-template-contract.md`](../response-template-contract.md) and [`runbooks/response-templates.md`](../runbooks/response-templates.md).

### Evidence rules (do not invent counts)

Use **`workspace-kit run release-evidence-manifest`** and **`workspace-kit run list-tasks`** (and [`ROADMAP.md`](../ROADMAP.md) for phase scope), not chat memory.

- **`{phaseNumber}`:** Phase label you are closing (e.g. **`64`** or **`Phase 64`** — pick one style and stay consistent).
- **`{completedExecutionTaskCount}`:** Integer count of execution tasks for this phase that reached **`completed`** in the configured task store (filter by **`phaseKey`** and/or ids listed for that phase in [`ROADMAP.md`](../ROADMAP.md)).
- **`{followOnExecutionTaskCountOrNone}`:** Integer or the word **`none`** from `release-evidence-manifest` `followUpSummary.count`. Use **`0`** or **`none`** only when the manifest includes a recorded follow-up scan/rationale.
- **`{featureMarkdownBullets}`:** One or more lines, **each** starting with **`- `**, each a short summary of shipped work backed by evidence (release line in [`CHANGELOG.md`](../CHANGELOG.md), phase row in [`ROADMAP.md`](../ROADMAP.md), or an ADR filename under **`docs/maintainers/`**). Add or remove lines; do not emit duplicate empty bullets. Put URLs or long citations outside this block if needed.
- **`{optionalNotesBlockOrEmpty}`:** Leave **blank** if there is nothing to report. Otherwise, after the feature bullets, add a **Notes** block: a **`Notes:`** line, then optional list lines shaped like **`- **Risks / issues:** *label: brief*`** and **`- **Opinions / additional tasking:** *label: brief*`** (omit any line you cannot fill from evidence).

### Copy-paste template

Substitute **only** the braced tokens below using the evidence rules. **Never** paste this block with placeholder tokens left unfilled (there are no **`{feature}`** / **`{label}`** slots anymore — expand **`{featureMarkdownBullets}`** into real **`- `** lines).

```markdown
Phase {phaseNumber} has been delivered!
{completedExecutionTaskCount} tasks complete
{followOnExecutionTaskCountOrNone} follow-on tasks

Features delivered:
{featureMarkdownBullets}

{optionalNotesBlockOrEmpty}
```
