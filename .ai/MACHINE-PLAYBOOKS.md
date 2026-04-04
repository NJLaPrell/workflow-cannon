# Machine playbook summaries (agents)

Full checklists with links live under `docs/maintainers/playbooks/` for **maintainers**. Agents follow the compressed expectations below; attach requestable Cursor rules when the editor supports it.

## Single task → phase integration branch (delivery loop)

1. Ensure **`release/phase-<N>`** exists (from `main` if new phase); branch a **task branch** from that line.
2. Implement with commits; run `pnpm run check` / `pnpm run test` as appropriate.
3. Open **PR targeting `release/phase-<N>`** (not `main`); iterate review; merge into the phase branch.
4. Run Tier A `run-transition` **`start`** / **`complete`** with JSON **`policyApproval`** so task-engine state matches merged work.

Optional Cursor rule: `.cursor/rules/playbook-task-to-phase-branch.mdc`. Maintainer detail: human playbook `docs/maintainers/playbooks/task-to-phase-branch.md` (reference only for humans).

## Phase closeout → `main` + release

When the phase is done: validate and fix on **`release/phase-<N>`**, obtain human approval, **merge phase branch to `main`**, then follow `docs/maintainers/RELEASING.md` on the **`main`** tip.

Human playbook: `docs/maintainers/playbooks/phase-closeout-and-release.md`.

## Improvement discovery (research → log)

Use Tier B `workspace-kit run` commands from `.ai/machine-cli-policy.md` / maintainer **AGENT-CLI-MAP** to persist recommendations—never chat-only approval for gated commands.

Human playbook: `docs/maintainers/playbooks/improvement-task-discovery.md`.

## Improvement triage (≤3 → ready)

Pick at most three `proposed` improvement tasks, document rationale, **`accept`** to **`ready`** with **`policyApproval`** on the transition args.

Human playbook: `docs/maintainers/playbooks/improvement-triage-top-three.md`.

## Wishlist intake → execution

Rank **`wishlist_intake`** items with **`list-wishlist`** / **`get-wishlist`**, confirm operator timing, clarify scope, pick a target **`phaseKey`**, then **`convert-wishlist`** with **`expectedPlanningGeneration`** when policy is **`require`**.

Human playbook: `docs/maintainers/playbooks/wishlist-intake-to-execution.md`.

Optional Cursor rule: `.cursor/rules/playbook-wishlist-intake-to-execution.mdc`.

### Confidence tiers (improvement inbox)

Recommendation tasks carry **`metadata.confidenceTier`** (`high` / `medium` / `low`). Filter with:

`pnpm run wk run list-tasks '{"type":"improvement","status":"ready","confidenceTier":"medium"}'`

## Long-session reload

See `.ai/LONG-SESSION-RELOAD.md`.
