# Machine playbook summaries (agents)

Full checklists with links live under `docs/maintainers/playbooks/` for **maintainers**. Agents follow the compressed expectations below; attach requestable Cursor rules when the editor supports it.

## Single task → `main` (delivery loop)

1. Pull latest `main`, create a feature branch.
2. Implement with commits; run `pnpm run check` / `pnpm run test` as appropriate.
3. Open PR, iterate review, merge via GitHub.
4. Run Tier A `run-transition` **`start`** / **`complete`** with JSON **`policyApproval`** so task-engine state matches merged work.

Optional Cursor rule: `.cursor/rules/playbook-task-to-main.mdc`. Maintainer detail: human playbook `docs/maintainers/playbooks/task-to-main.md` (reference only for humans).

## Improvement discovery (research → log)

Use Tier B `workspace-kit run` commands from `.ai/machine-cli-policy.md` / maintainer **AGENT-CLI-MAP** to persist recommendations—never chat-only approval for gated commands.

Human playbook: `docs/maintainers/playbooks/improvement-task-discovery.md`.

## Improvement triage (≤3 → ready)

Pick at most three `proposed` improvement tasks, document rationale, **`accept`** to **`ready`** with **`policyApproval`** on the transition args.

Human playbook: `docs/maintainers/playbooks/improvement-triage-top-three.md`.

### Confidence tiers (improvement inbox)

Recommendation tasks carry **`metadata.confidenceTier`** (`high` / `medium` / `low`). Filter with:

`pnpm run wk run list-tasks '{"type":"improvement","status":"ready","confidenceTier":"medium"}'`

## Long-session reload

See `.ai/LONG-SESSION-RELOAD.md`.
