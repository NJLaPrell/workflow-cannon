# Playbook: deliver a task to the phase integration branch

**Playbook id:** `task-to-phase-branch`  
**Use when:** Taking a single **execution task** (`T###`) from **ready** / **in_progress** through merged code on the **phase integration branch** (`release/phase-<N>`), with PR review and CI. **`main`** receives the phase only during **phase closeout** — see [`phase-closeout-and-release.md`](./phase-closeout-and-release.md).

This file is an **ordered checklist**. Branch naming lives in **`.cursor/rules/branching-tagging-strategy.mdc`**; commit and PR quality expectations align with **`.cursor/rules/maintainer-delivery-loop.mdc`** and [`docs/maintainers/AGENTS.md`](../AGENTS.md).

## Phase integration branch naming

- **Pattern:** `release/phase-<N>` (example: `release/phase-52`).
- **`<N>`** is the **workspace kit phase number** — align with [`docs/maintainers/data/workspace-kit-status.yaml`](../data/workspace-kit-status.yaml) **`current_kit_phase`**, the task’s **`phaseKey`** / phase metadata, or explicit maintainer agreement. Do **not** invent a phase number from chat alone.

## 0) Attach context

- Confirm task **`id`**, **`status`**, and **acceptance criteria** via task-engine reads (`workspace-kit run get-task '{"taskId":"T###"}'`) — do not trust chat-only summaries for lifecycle.
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

## 1) Ensure the phase integration branch exists

1. `git fetch origin`.
2. Fix **`<N>`** and branch name **`release/phase-<N>`** per the naming rules above.
3. If **`origin/release/phase-<N>`** exists: `git checkout release/phase-<N>` and `git pull origin release/phase-<N>`.
4. If it does **not** exist: `git checkout main`, `git pull origin main`, `git checkout -b release/phase-<N>`, `git push -u origin release/phase-<N>` — then continue from that branch for step 2.

## 2) Create a task branch from the phase branch

1. With **`release/phase-<N>`** up to date, create a **task branch** (not the phase branch): one coherent objective; predictable name (e.g. `feature/T###-short-slug`).
2. `git switch` / `git checkout` the task branch and do all task work there.

**Task engine:** If you have **not** yet run **`start`** from step **0b**, run it **now** — before section **3** (first implementation commit).

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

1. Wait for **CI** (and any required checks) on the PR; treat failures as blocking until addressed or waived per team policy.
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
3. **Update task-engine state** after the work is merged (or in sync with merge): transition the task to **`completed`** when acceptance criteria are met — **not** a substitute for Git, but required kit-owned evidence:

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"complete","policyApproval":{"confirmed":true,"rationale":"merged to release/phase-<N>; acceptance criteria satisfied"}}'
```

If the task should **not** complete (partial delivery, superseded scope), use the appropriate **`run-transition`** action per [`src/modules/task-engine/instructions/run-transition.md`](../../../src/modules/task-engine/instructions/run-transition.md) instead of **`complete`**.

## Related

- **Phase closeout (merge phase → `main`, release)** — [`phase-closeout-and-release.md`](./phase-closeout-and-release.md)
- **Canonical delivery loop** — `.cursor/rules/maintainer-delivery-loop.mdc`
- **Branch naming** — `.cursor/rules/branching-tagging-strategy.mdc`
- **Requestable Cursor rule** — `.cursor/rules/playbook-task-to-phase-branch.mdc`
- **Tier A transitions** — [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) → Task Engine transitions
