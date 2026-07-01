<!-- GENERATED FROM .ai/playbooks/task-to-phase-branch.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Playbook: deliver a task to the phase integration branch

**Playbook id:** `task-to-phase-branch`  
**Use when:** Taking a single **execution task** (`T###`) from **ready** / **in_progress** through merged code on the **phase integration branch** (`release/phase-<N>`), with PR review and CI. **`main`** receives the phase only during **phase closeout** — see [`phase-closeout-and-release.md`](./phase-closeout-and-release.md).

This file is an **ordered checklist**. Branch naming lives in **`.cursor/rules/branching-tagging-strategy.mdc`**; commit and PR quality expectations align with **`.cursor/rules/maintainer-delivery-loop.mdc`** and [`.ai/AGENTS.md`](../AGENTS.md) / [`.ai/agent-source-of-truth-order.md`](../agent-source-of-truth-order.md).

**Vocabulary:** maintainer copy may say **Sprint** for a timeboxed delivery slice; machine phase ids and branch names stay **`release/phase-<N>`** — see [`.ai/TERMS.md`](../TERMS.md) `term|name=sprint|…` and [`.ai/TERMS.index.json`](../TERMS.index.json).

## Phase integration branch naming

- **Pattern:** `release/phase-<N>` (example: `release/phase-52`).
- **`<N>`** is the **workspace kit phase number** — align with **`docs/maintainers/data/workspace-kit-status.yaml`** **`current_kit_phase`**, the task’s **`phaseKey`** / phase metadata, or explicit maintainer agreement. Do **not** invent a phase number from chat alone.

## 0) Attach context

- Confirm task **`id`**, **`status`**, and **acceptance criteria** via task-engine reads (`workspace-kit run get-task '{"taskId":"T###"}'`) — do not trust chat-only summaries for lifecycle.
- **Policy (read-only, no network):** before assuming branch/review/evidence rules, run **`workspace-kit run resolve-maintainer-delivery-policy`** with `taskId` (or prospective `phaseKey` / `moduleId` context). Defaults match the historical GitHub PR + phase-branch flow; workspace or task metadata can select other profiles without editing this playbook.
- For **`workspace-kit run run-transition`**, use JSON **`policyApproval`** on the **third** CLI argument ([`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md), [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md)).
- When **`tasks.planningGenerationPolicy`** is **`require`**, copy **`planningGeneration`** from that same read (or from **`list-tasks`** / **`get-next-actions`**) into **`expectedPlanningGeneration`** on every mutating task-engine command that accepts it.

## 0b) Move the task to `in_progress` before implementation

**Do not** implement the task or create **task-implementation commits** while the row is still **`ready`**.

- If **`status`** is **`ready`**, run **`start`** as soon as you are actually taking ownership (immediately after step **0** is fine; no later than **before the first commit** in section **3**).
- If **`status`** is already **`in_progress`**, skip.
- Optional hygiene: use **`workspace-kit run update-task`** to refresh **`summary`**, **`description`**, or **`metadata`** at milestones (PR opened, CI green, scope change) — lifecycle has no separate “in review” state; **`update-task`** carries that signal.

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"start","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"begin implementation for task-to-phase-branch playbook"}}'
```

(Omit **`expectedPlanningGeneration`** when policy is not **`require`**.)

## 0c) Phase journal — capture context at start (when useful)

When you inherit non-obvious phase context (prior task outcomes, branch conventions, operator decisions), record it in the **phase journal** so closeout and the next agent do not rely on chat memory.

```bash
workspace-kit run add-phase-note '{"phaseKey":"<N>","noteType":"decision","summary":"Inherited: phase integrates on release/phase-<N>; delivery evidence enforced."}'
```

See [`add-phase-note.md`](../../src/modules/task-engine/instructions/add-phase-note.md). Do **not** paste secrets or large excerpts.

## 1) Ensure the phase integration branch exists

1. `git fetch origin`.
2. Fix **`<N>`** and branch name **`release/phase-<N>`** per the naming rules above.
3. If **`origin/release/phase-<N>`** exists: `git checkout release/phase-<N>` and `git pull origin release/phase-<N>`.
4. If it does **not** exist: `git checkout main`, `git pull origin main`, `git checkout -b release/phase-<N>`, `git push -u origin release/phase-<N>` — then continue from that branch for step 2.

## 2) Create a task branch from the phase branch

1. With **`release/phase-<N>`** up to date, create a **task branch** (not the phase branch): one coherent objective; predictable name (e.g. `feature/T###-short-slug`).
2. `git switch` / `git checkout` the task branch and do all task work there.

**Task engine:** If you have **not** yet run **`start`** from step **0b**, run it **now** — before section **3** (first implementation commit).

## 2b) Parallel task chains in one phase (ROADMAP coupling)

Some phases ship **two or more parallel `T###` chains** on the same **`release/phase-<N>`** train (historically: Phase 52–style splits). Without explicit coupling notes, reviewers assume false sequencing.

**Expectation:**

- In **`docs/maintainers/ROADMAP.md`** (or phase notes / maintainer snapshot prose), **cross-link** related task ranges when they share a release boundary, **or** state explicitly that chains are **independent** (no ordering / merge dependency).
- Prefer a **short playbook or ROADMAP paragraph** over rewriting historical task graphs.
- Before closeout, spot-check **`dependsOn`** in the task store for active rows so narrative matches **`workspace-kit run list-tasks`** / **`get-task`** reality — not chat memory.

## 3) Implement, validate, commit

1. Implement the **smallest coherent slice** that satisfies the task’s acceptance criteria.
2. **Validate** with project checks (`pnpm run build`, `pnpm run check`, `pnpm run test`, and `pnpm run parity` when the change touches packaged/consumed behavior — or the task-specific commands).
3. **Commit** with a focused, reason-oriented message; avoid unrelated changes in the same commit.

**Optional automation:** `pnpm run playbook-run-steps examples/playbooks/pilot-task-to-phase-branch.json --log artifacts/playbook-run.log.jsonl` runs explicit argv steps (doctor + bare `run` discovery) and appends per-step evidence — it does **not** replace this playbook or GitHub review.

## 4) Open a pull request to the phase integration branch

1. `git push` the task branch to `origin` (set upstream if first push).
2. Open a **PR targeting `release/phase-<N>`** (base = phase branch, compare = task branch — GitHub UI or `gh pr create --base release/phase-<N>`).
3. PR body should cover **why**, **risk**, validation / evidence, and migration or compatibility if relevant (see maintainer-delivery-loop **PR review / merge** section).
4. Optional: **`update-task`** with PR URL or a short status line in **`summary`** / **`metadata`** so the queue reflects reality between **`start`** and **`complete`**.

## 5) Review the PR

### 5a) Wait for CI (headless — no `gh pr checks --watch`)

**Do not** use `gh pr checks --watch` in agent shells, background tasks, or CI: it expects an interactive TTY and breaks automation.

Prefer one of these **copy-paste** patterns (replace `<pr>` with the PR number or URL):

**Preferred — kit command (bounded poll, structured JSON):**

```bash
pnpm exec wk run wait-for-pr-checks '{"pr":<pr>,"timeoutSec":1800,"intervalSec":20,"requiredOnly":true}'
```

See [`wait-for-pr-checks.md`](../../src/modules/task-engine/instructions/wait-for-pr-checks.md). Exits non-zero when checks fail or time out.

**Option A — workflow run (when checks map to a single workflow run):**

```bash
GH_PAGER=cat gh pr view <pr> --json statusCheckRollup,number
# When you have a run id from the PR checks page or prior gh run list:
GH_PAGER=cat gh run watch <run-id> --exit-status
```

**Option B — bounded JSON poll (safe in agents; default for delivery loops):**

```bash
PR=<pr>
DEADLINE=$(( $(date +%s) + 1800 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  RAW=$(GH_PAGER=cat gh pr checks "$PR" --json name,state,bucket 2>/dev/null || true)
  STATUS=$(printf '%s' "$RAW" | node -e "
const r=JSON.parse(require('fs').readFileSync(0,'utf8')||'[]');
if(!Array.isArray(r)||r.length===0){console.log('pending');process.exit(0)}
const pend=r.some(c=>['PENDING','IN_PROGRESS','QUEUED'].includes(c.state));
if(pend){console.log('pending');process.exit(0)}
const bad=r.filter(c=>!['SUCCESS','SKIPPED','NEUTRAL'].includes(c.state));
if(bad.length){console.log('failed');console.error(JSON.stringify(bad,null,2));process.exit(1)}
console.log('passed');
")
  case "$STATUS" in
    pending) echo "checks not ready yet; sleep 30s"; sleep 30 ;;
    passed) echo "checks green"; break ;;
    failed) exit 1 ;;
  esac
done
```

Exit code **8** from `gh pr checks` usually means **checks are not ready yet**, not that CI failed — keep polling or use Option A.

1. Wait for **CI** using **5a**; treat failures as blocking until addressed or waived per team policy.
2. Perform **code review** (self-review for solo maintainers, or peer review): correctness, scope, tests, docs, and alignment with task acceptance criteria.
3. Optionally leave a **review comment** or summary on the PR documenting the review outcome.

## 6) Iterate until merge-ready

If review or CI surfaces issues:

1. **Fix** on the same task branch; **commit** with clear messages (additional commits are fine).
2. **Push** updates; confirm CI re-runs and passes as expected.
3. **Post a PR comment** summarizing what changed since the last review (helps reviewers and future you).
4. **Review again** (step 5) until the PR is **ready to merge** (no open blockers, checks green).

Repeat until satisfied.

## 7) Merge into the phase integration branch

1. **Merge** the PR into **`release/phase-<N>`** via normal GitHub flow (`gh pr merge` or UI) using the repo’s preferred strategy (merge / squash / rebase), consistent with **maintainer-delivery-loop**.
2. Do **not** merge past known **release** or **safety** gates without explicit maintainer decision.
3. Record delivery metadata and **user-facing release note copy** on the task before completion. Use **`update-task`** to preserve existing metadata and add:

   - **`metadata.deliveryEvidence`** **or** **`metadata.deliveryWaiver`** (when the delivery-evidence guard applies)
   - **`metadata.releaseNoteSummary`** for **user-visible** shipped work — one benefit-focused sentence for adopters (not implementation detail). Omit for internal-only, chore, or non-shipping tasks unless you explicitly want the row in public release notes (`metadata.includeInReleaseNotes: true`). Authoring contract: [`release-notes-authoring.md`](../../src/modules/documentation/instructions/release-notes-authoring.md).

   Prefer a **single** `update-task` that merges the full metadata object (shallow merge replaces the whole map — include prior keys):

```json
{
  "releaseNoteSummary": "See terminal tasks directly on your dashboard.",
  "deliveryEvidence": {
    "schemaVersion": 1,
    "branchName": "feature/T###-short-slug",
    "prUrl": "https://github.com/org/repo/pull/123",
    "prNumber": 123,
    "baseBranch": "release/phase-<N>",
    "mergeSha": "<merge-sha>",
    "checks": [
      { "name": "test", "conclusion": "success" }
    ],
    "validationCommands": [
      { "command": "pnpm run test", "exitCode": 0 }
    ]
  }
}
```

   Example **`update-task`** (replace task id, merge sha, and preserve existing metadata keys from **`get-task`**):

```bash
workspace-kit run update-task '{"taskId":"T###","updates":{"metadata":{"releaseNoteSummary":"See terminal tasks directly on your dashboard.","deliveryEvidence":{"schemaVersion":1,"branchName":"feature/T###-short-slug","prUrl":"https://github.com/org/repo/pull/123","prNumber":123,"baseBranch":"release/phase-<N>","mergeSha":"<merge-sha>","checks":[{"name":"test","conclusion":"success"}],"validationCommands":[{"command":"pnpm run test","exitCode":0}]}}},"expectedPlanningGeneration":<n>}'
```

Waivers are for maintainer-approved exceptions only and require `schemaVersion`, `actor`, `rationale`, `timestamp`, and `scope`.
4. Run the read-only evidence audit:

```bash
workspace-kit run phase-delivery-preflight '{"phaseKey":"<N>","includeInProgress":true}'
```

5. **Close open subagent sessions:** Before transitioning the task, run `list-subagent-sessions` to check if any open sessions exist for this execution task. If any are open, close them using `close-subagent-session`:

```bash
workspace-kit run close-subagent-session '{"sessionId":"<uuid>","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"close subagent session after task completion"}}'
```

6. **Update task-engine state** after the work is merged (or in sync with merge): transition the task to **`completed`** when acceptance criteria are met — **not** a substitute for Git, but required kit-owned evidence.


When you observed a **finding**, **gotcha**, or **follow-up** during the task, attach **`phaseNotes`** on the same **`complete`** call (same SQLite transaction as the transition):

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"complete","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"merged to release/phase-<N>; acceptance criteria satisfied"},"phaseNotes":[{"noteType":"gotcha","summary":"Short operational note — no secrets"}]}'
```

Without journal capture needs, **`complete`** alone is fine:

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"complete","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"merged to release/phase-<N>; acceptance criteria satisfied"}}'
```

If the task should **not** complete (partial delivery, superseded scope), use the appropriate **`run-transition`** action per [`src/modules/task-engine/instructions/run-transition.md`](../../../src/modules/task-engine/instructions/run-transition.md) instead of **`complete`**.

## Related

- **Phase closeout (merge phase → `main`, release)** — [`phase-closeout-and-release.md`](./phase-closeout-and-release.md)
- **Release note authoring** — [`release-notes-authoring.md`](../../src/modules/documentation/instructions/release-notes-authoring.md)
- **Canonical delivery loop** — `.cursor/rules/maintainer-delivery-loop.mdc`
- **Branch naming** — `.cursor/rules/branching-tagging-strategy.mdc`
- **Requestable Cursor rule** — `.cursor/rules/playbook-task-to-phase-branch.mdc`
- **Tier A transitions** — [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) → Task Engine transitions
