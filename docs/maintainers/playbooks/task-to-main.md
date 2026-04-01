# Playbook: complete a task to main

**Playbook id:** `task-to-main`  
**Use when:** Taking a single **execution task** (`T###`) from **ready** / **in_progress** through merged code on **`main`**, with PR review and CI.

This file is an **ordered checklist**. Full policy for branching, commits, and PR quality lives in **`.cursor/rules/maintainer-delivery-loop.mdc`** and [`docs/maintainers/AGENTS.md`](../AGENTS.md) (task execution + CLI-first execution).

## 0) Attach context

- Confirm task **`id`**, **`status`**, and **acceptance criteria** via task-engine reads (`workspace-kit run get-task '{"taskId":"T###"}'`) — do not trust chat-only summaries for lifecycle.
- For **`workspace-kit run run-transition`**, use JSON **`policyApproval`** on the **third** CLI argument ([`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md), [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md)).

## 1) Branch from current main

1. `git fetch origin` and `git checkout main` (or rebase strategy your team uses).
2. `git pull origin main` so the branch starts from the latest **`main`**.
3. Create a **feature branch** (not `main`): one coherent objective; predictable name (e.g. `feature/T###-short-slug`).
4. `git switch` / `git checkout` that branch and do all task work there.

**Task engine (typical):** when you **start** implementation, transition the task to **`in_progress`** if it is still **`ready`**:

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"start","policyApproval":{"confirmed":true,"rationale":"begin implementation for task-to-main playbook"}}'
```

## 2) Implement, validate, commit

1. Implement the **smallest coherent slice** that satisfies the task’s acceptance criteria.
2. **Validate** with project checks (`pnpm run build`, `pnpm run check`, `pnpm run test`, and `pnpm run parity` when the change touches packaged/consumed behavior — or the task-specific commands).
3. **Commit** with a focused, reason-oriented message; avoid unrelated changes in the same commit.

**Optional automation:** `pnpm run playbook-run-steps examples/playbooks/pilot-task-to-main.json --log artifacts/playbook-run.log.jsonl` runs explicit argv steps (doctor + bare `run` discovery) and appends per-step evidence — it does **not** replace this playbook or GitHub review.

## 3) Open a pull request to `main`

1. `git push` the branch to `origin` (set upstream if first push).
2. Open a **PR targeting `main`** (GitHub UI or `gh pr create`).
3. PR body should cover **why**, **risk**, validation / evidence, and migration or compatibility if relevant (see maintainer-delivery-loop **PR review / merge** section).

## 4) Review the PR

1. Wait for **CI** (and any required checks) on the PR; treat failures as blocking until addressed or waived per team policy.
2. Perform **code review** (self-review for solo maintainers, or peer review): correctness, scope, tests, docs, and alignment with task acceptance criteria.
3. Optionally leave a **review comment** or summary on the PR documenting the review outcome.

## 5) Iterate until merge-ready

If review or CI surfaces issues:

1. **Fix** on the same feature branch; **commit** with clear messages (additional commits are fine).
2. **Push** updates; confirm CI re-runs and passes as expected.
3. **Post a PR comment** summarizing what changed since the last review (helps reviewers and future you).
4. **Review again** (step 4) until the PR is **ready to merge** (no open blockers, checks green).

Repeat until satisfied.

## 6) Merge to `main`

1. **Merge** the PR via normal GitHub flow (`gh pr merge` or UI) using the repo’s preferred strategy (merge / squash / rebase), consistent with **maintainer-delivery-loop**.
2. Do **not** merge past known **release** or **safety** gates without explicit maintainer decision.
3. **Update task-engine state** after the work is merged (or in sync with merge): transition the task to **`completed`** when acceptance criteria are met — **not** a substitute for Git, but required kit-owned evidence:

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"complete","policyApproval":{"confirmed":true,"rationale":"merged to main; acceptance criteria satisfied"}}'
```

If the task should **not** complete (partial delivery, superseded scope), use the appropriate **`run-transition`** action per [`src/modules/task-engine/instructions/run-transition.md`](../../../src/modules/task-engine/instructions/run-transition.md) instead of **`complete`**.

## Related

- **Canonical delivery loop** — `.cursor/rules/maintainer-delivery-loop.mdc`
- **Requestable Cursor rule** (optional; same checklist in-editor) — `.cursor/rules/playbook-task-to-main.mdc`
- **Tier A transitions** — [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) → Task Engine transitions
