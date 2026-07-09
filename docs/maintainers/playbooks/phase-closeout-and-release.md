<!-- GENERATED FROM .ai/playbooks/phase-closeout-and-release.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Playbook: phase closeout and release

**Playbook id:** `phase-closeout-and-release`  
**Use when:** Closing a numbered phase and cutting a GitHub + npm release for `@workflow-cannon/workspace-kit`.

This file is an **ordered checklist**. Canonical prose lives in the linked docs — do not treat this as a fork of [`RELEASING.md`](../RELEASING.md).

**Agent sessions:** Attach this playbook (`@` the path) when closing a phase so steps stay in context. After publish and evidence (**§6**), **unset the workspace current phase** (**§6b**), then end with **§7** using the copy-paste template — placeholders only; do not paste long governance asides into the template body.

## 0) Attach context

- Confirm [`docs/maintainers/TERMS.md`](../TERMS.md) vocabulary (task-engine state, approval gates, evidence). Canonical **Sprint** ↔ machine phase synonyms: [`.ai/TERMS.md`](../TERMS.md) `term|name=sprint|…`.
- **Phase integration branch** for phase **`<N>`** is **`release/phase-<N>`** (see **`.cursor/rules/branching-tagging-strategy.mdc`** and [`task-to-phase-branch.md`](./task-to-phase-branch.md)).
- For **policy-sensitive** `workspace-kit run` commands, use JSON **`policyApproval`** on the **third** CLI argument; for `config` / `init` / `upgrade`, see [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).

## 1) Refresh execution state (read-only discovery)

1. `workspace-kit doctor`
2. `workspace-kit run get-next-actions '{}'`
3. Optional: `workspace-kit run list-tasks '{}'` filtered as needed.

Do **not** infer task `status` from chat memory — use **`workspace-kit run`** against the configured task store. When **`tasks.canonicalAuthority`** is **`git-event-log`**, canonical history is on branch **`workflow-cannon/task-state`**; local **`.workspace-kit/tasks/workspace-kit.db`** is a projection (hydrate after pull — § **3a**).

## 2) Finish remaining phase work (delivery loop)

Follow the **maintainer delivery loop** for each execution task: task branch from **`release/phase-<N>`**, validate, **PR into the phase branch** when the resolved delivery profile expects GitHub-style review (default), merge, then task transitions — see [`task-to-phase-branch.md`](./task-to-phase-branch.md). Use **`workspace-kit run resolve-maintainer-delivery-policy`** when profile, branch patterns, or evidence mode are not obvious from task metadata alone.

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

0. **Phase journal review** — list notes for the closing phase; convert actionable **`task-suggestion`** / **`follow-up`** rows before release prep:

```bash
workspace-kit run list-phase-notes '{"phaseKey":"<N>"}'
workspace-kit run convert-phase-note-to-task '{"noteId":"<uuid>","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"closeout follow-up from phase journal"}}'
```

(Skip conversion when the note is informational only.)

0b. **Subagent session hygiene** — Check for any open subagent sessions in the workspace using `list-subagent-sessions`. If any are still open, close them:

```bash
pnpm exec wk run close-subagent-session '{"sessionId":"<uuid>","policyApproval":{"confirmed":true,"rationale":"close lingering subagent session during closeout"}}'
```

1. `git fetch origin` and `git checkout release/phase-<N>`, then `git pull origin release/phase-<N>`.

2. Run `workspace-kit run phase-closeout-readiness '{"phaseKey":"<N>"}'` and stop unless it reports `passed: true` with `remainingCount: 0`, or there is an explicit maintainer waiver covering the remaining closeout finding(s).
3. Run `workspace-kit run phase-delivery-preflight '{"phaseKey":"<N>","includeInProgress":false,"baseRef":"origin/release/phase-<N>"}'` and resolve every evidence, readiness, stranded-work, and **service sync** finding with evidence matching each task’s **resolved** delivery profile (from **`resolve-maintainer-delivery-policy`** / preflight policy context) or an explicit maintainer waiver before closeout.

   **Service sync gate** (embedded in preflight as `data.serviceSync` when **`tasks.canonicalAuthority`** is **`git-event-log`** and **`dashboard.dataSource`** is **`service`** or **`auto`**):

   - **`service` mode:** dashboard service must be running and healthy (`dashboard-service-status`).
   - **Outbox drained:** no pending/publishing rows in the canonical event outbox (`service-sync-outbox-not-drained`).
   - **Fresh projection:** `task-sync-status` local projection is `fresh` (`service-sync-projection-not-fresh`).
   - **No conflicts:** zero failed/conflict outbox rows and no conflict sync posture (`service-sync-conflict-rows`).

   When `dashboard.dataSource` is **`auto`** and the service is not running, preflight may warn and continue on CLI **`task-sync-*`** fallback; operators should still clear outbox/projection findings before closeout. Stranded-work findings mean completed task implementation files differ from the selected integration/base ref; merge/rebase that work, or move the task out of `completed` before release prep continues. This check is distinct from task-store branch synchronization.
4. Run `workspace-kit run release-evidence-manifest '<json>'` with human approval, release-note evidence, validation records, known risks, publish artifact placeholders/proof, and follow-up scan data. Resolve structured failures before tag/npm/GitHub release actions.
5. Run full validation on that tip (`pnpm run build`, `pnpm run check`, `pnpm run test`, `pnpm run parity`, and **`pre-merge-gates`** / maintainer gates as in [`RELEASING.md`](../RELEASING.md)).
6. Run **`workspace-kit run propose-release-version '{"phaseKey":"<N>"}'`** and align `package.json` / changelog version with the recommended bump before tagging (see **`.ai/RELEASING.md`** rule **R200-semver**).
6b. Run **`workspace-kit run generate-release-notes '{"phaseKey":"<N>"}'`** to generate user-friendly release notes for GitHub Releases and user documentation. Use `format: "github"` for emoji-enhanced GitHub output. Per-task **`metadata.releaseNoteSummary`** should already be set during the delivery loop (**[`task-to-phase-branch.md`](./task-to-phase-branch.md)** § **7**); this step aggregates them — it is not a substitute for writing adopters-facing copy at task merge time.
7. **Fix failures on the phase branch** — small follow-up PRs or commits targeting **`release/phase-<N>`** until checks are green and there are no known release blockers.

**PR review integrity:** Prefer **follow-up commits** on task branches over amend + force-push after review. `pre-merge-gates` includes `check-pr-history-rewritten` (`pr-history-rewritten` when the PR head diverges from the latest approving review commit).

**CI wait (agents):** Use the headless recipes in [`task-to-phase-branch.md`](./task-to-phase-branch.md) § **5a** — not `gh pr checks --watch`. For phase→`main` PRs, the same poll/`gh run watch` patterns apply before merge.

## 3a) Canonical task state (`git-event-log`) — do not commit SQLite blobs on closeout

When **`tasks.canonicalAuthority`** is **`git-event-log`** (Workflow Cannon maintainer workspace default in **`.workspace-kit/config.json`**), phase closeout **must not** treat **`.workspace-kit/tasks/workspace-kit.db`** or **`.workspace-kit/tasks/task-state-events.jsonl`** as VCS deliverables on **`main`** or **`release/phase-<N>`**.

**Before** opening the phase→`main` PR (on **`release/phase-<N>`** tip):

1. Confirm closeout outbox posture first: no pending canonical event outbox backlog, or an explicit maintainer waiver is recorded for release closeout.
2. Publish outstanding task-engine mutations to canonical git (normal `wk run` paths with **`git-event-log`** publish events on success, or explicit publish when repairing):

   ```bash
   pnpm exec wk run task-sync-status '{"fetch":true}'
   ```

   Resolve **`behind`** / **`conflict`** with **`task-sync-hydrate`** and/or **`task-sync-publish`** per [`.ai/runbooks/task-state-git-operator.md`](../runbooks/task-state-git-operator.md).

3. Verify remote layout:

   ```bash
   pnpm exec wk run task-sync-verify '{"source":"git","branch":"workflow-cannon/task-state"}'
   ```

4. Push **`workflow-cannon/task-state`** so **`origin/workflow-cannon/task-state`** matches what operators will hydrate.

**On the phase→`main` PR:**

- **Do not** add or refresh commits that change **`.workspace-kit/tasks/workspace-kit.db`** or **`task-state-events.jsonl`** as “queue export” or closeout evidence.
- **Do** keep maintainer exports that remain policy-backed (for example **`docs/maintainers/data/workspace-kit-status.yaml`** via **`set-current-phase`** / **`update-workspace-status`** when your closeout task requires them) — those are not the task queue.

**After** merge to **`main`**, every operator and agent:

```bash
git pull origin main
git checkout -- .workspace-kit/tasks/workspace-kit.db .workspace-kit/tasks/task-state-events.jsonl 2>/dev/null || true
pnpm exec wk run task-sync-hydrate '{"fetch":true,"policyApproval":{"confirmed":true,"rationale":"reconcile after phase merge to main"}}'
```

**Recovery-only exception:** committing a SQLite blob requires **`.workspace-kit/policy/task-store-sqlite-commit-approval.json`** and **`check-task-store-commit`** — see [`.ai/runbooks/task-state-git-operator.md`](../runbooks/task-state-git-operator.md) § Recovery-only.

## 4) Human gate — stop before publish

**Do not** run publish automation or tag-driven release actions until a human explicitly approves, per [`RELEASING.md`](../RELEASING.md) (“Present for approval”).

Summarize scope, risk, validation evidence, and migration notes; obtain **explicit** confirmation to proceed with publish.

Chat copy and dashboard prompts are **operator intent only**; they do **not** satisfy Tier A/B **`workspace-kit run`** approval or waive the publish gate — see **`.ai/POLICY-APPROVAL.md`** → **Operator slash / chat vs Tier A/B `wk run`**.

## 5) Release procedure (execute per RELEASING)

1. **Merge `release/phase-<N>` into `main`** via PR (or equivalent reviewed merge) using the repo’s preferred strategy, consistent with **maintainer-delivery-loop**. **`main`** should be the tip you tag unless policy says otherwise.
2. Run the full **Release procedure** in [`RELEASING.md`](../RELEASING.md): define scope, prepare artifacts (changelog + `package.json` version), run validation commands (`build`, `check`, `test`, `parity`, `check-release-metadata`, `pre-merge-gates`, doc consistency sweep), obtain **publish approval** per §4, then **ship npm via CI** with **`pnpm run publish:npm`** (optional dist-tag: **`pnpm run publish:npm -- next`** or **`NPM_DIST_TAG=…`**). That dispatches **`.github/workflows/publish-npm.yml`** using **`gh workflow run`** and repo **`secrets.NPM_TOKEN`** — not local **`npm publish`**. Requires **`gh auth login`**. UI equivalent: GitHub → Actions → **Publish NPM** → Run workflow. Then record evidence (tag, workflow run URL, npm).

Tier **B** `workspace-kit run` commands (non-transition) also require JSON `policyApproval` — see [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) and [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).

## 6) After publish

- Capture and cite `workspace-kit run release-evidence-manifest` output per [`RELEASING.md`](../RELEASING.md) → **Required release evidence**.
- Update maintainer snapshots (for example [`docs/maintainers/ROADMAP.md`](../ROADMAP.md), [`docs/maintainers/data/workspace-kit-status.yaml`](../data/workspace-kit-status.yaml)) when the phase closeout task requires it.

## 6b) Unset workspace current phase (final agent mutation)

After publish and evidence are recorded, **clear the active workspace phase** so operators and agents are not still “in” the shipped phase. Use **`update-workspace-status`** with **`currentKitPhase: null`** — **not** **`set-current-phase`** (that command sets a non-empty phase only). This matches dashboard **Mark Phase Complete** and clears the config phase hint plus the non-authoritative DB export.

1. Read revision:

```bash
pnpm exec wk run phase-status '{}'
```

2. Unset **`current_kit_phase`** (replace **`<rev>`** and **`<N>`**; preserve **`next_kit_phase`** when the roster already queues the next phase — omit **`nextKitPhase`** unless you intentionally clear it):

```bash
pnpm exec wk run update-workspace-status '{"expectedWorkspaceRevision":<rev>,"currentKitPhase":null,"activeFocus":"Phase <N> complete — no active workspace phase","blockers":[],"pendingDecisions":[],"nextAgentActions":["Pick the next phase from the Phase Roster when you are ready to deliver."],"command":"phase-closeout-complete"}'
```

When **`next_kit_phase`** is set and should stay queued, use dashboard-aligned copy instead:

```bash
pnpm exec wk run update-workspace-status '{"expectedWorkspaceRevision":<rev>,"currentKitPhase":null,"activeFocus":"Phase <N> complete — use roster Start when ready for Phase <N+1>","blockers":[],"pendingDecisions":[],"nextAgentActions":["Start Phase <N+1> from the Phase Roster when you are ready to deliver"],"command":"phase-closeout-complete"}'
```

3. Verify **`canonicalPhase.canonicalPhaseKey`** is **`null`**:

```bash
pnpm exec wk run phase-status '{}'
```

Success code: **`workspace-phase-cleared`**. See [`WORKSPACE-KIT-SESSION.md`](../WORKSPACE-KIT-SESSION.md) → **Workspace phase snapshot** and [`.ai/runbooks/workspace-status-sqlite.md`](../runbooks/workspace-status-sqlite.md).

**Do not** advance **`current_kit_phase`** to the next phase here — starting the next phase belongs on the Phase Roster (**`set-current-phase`**) when delivery intentionally resumes.

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
