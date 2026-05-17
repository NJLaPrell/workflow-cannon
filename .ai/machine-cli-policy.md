# Machine CLI and policy quickref (agents)

**Agents** use **`.ai/AGENT-CLI-MAP.md`**, **`.ai/POLICY-APPROVAL.md`**, **`.ai/RELEASING.md`**, **`.ai/CLI-VISUAL-GUIDE.md`**, and this file — not `docs/maintainers/` prose (human / generated renders). **Maintainers** may still curate long-form copies under `docs/maintainers/` after running the doc pipeline.

## Command path

In an **attached project**, use **`./.workspace-kit/bin/wk`** for routine Workflow Cannon commands. The launcher reads **`.workspace-kit/runtime.json`** and uses the stamped Node runtime, so agents should not ask the user to run `nvm use` first. In the **Workflow Cannon source checkout**, `pnpm exec wk` and `node dist/cli.js` remain appropriate development entrypoints.

## Tier A — task lifecycle

Use `workspace-kit run run-transition` with JSON **`policyApproval`** as the **third** CLI argument (not chat-only approval).

```bash
./.workspace-kit/bin/wk run run-transition '{"taskId":"T###","action":"start","policyApproval":{"confirmed":true,"rationale":"begin work"}}'
```

## Tier B — sensitive `workspace-kit run` (non-transition)

Pass **`policyApproval`** inside the JSON args object for commands marked sensitive in the builtin manifest (for example `generate-recommendations`, `ingest-transcripts`).

## Config / init / upgrade lane

For `workspace-kit config`, `init`, and `upgrade`, approval may use env **`WORKSPACE_KIT_POLICY_APPROVAL`** (JSON string). **Do not** rely on that env for the `run` subcommand path—`run` expects JSON **`policyApproval`** on the command args when the operation is sensitive.

## Policy rehearsal (dry run)

`generate-recommendations` accepts **`dryRun: true`** in JSON args. It evaluates candidates and returns `recommendations-rehearsal` **without** syncing transcripts, persisting tasks, or writing improvement state. Still pass **`policyApproval`** when the command remains policy-gated.

## Discovery without dumping catalogs

Prefer `./.workspace-kit/bin/wk run` with no subcommand in attached projects for a short command list, then open `src/modules/<module>/instructions/<command>.md` for the specific surface. In this source checkout, use `pnpm exec wk run` for the same discovery. Avoid pasting full `doctor` JSON catalogs into chat unless debugging.

## Maintainer delivery loop (`doctor`)

- **`pnpm exec wk doctor --delivery-loop`** — advisory when **dirty git** on **`main` / `master` / `release/phase-<n>`** while execution tasks are **`in_progress`** in planning SQLite.
- **`pnpm exec wk doctor --delivery-loop-strict`** — same condition **fails** **`doctor`** (strict maintainer / CI workflows).

Cold-start JSON **`maintainerDelivery`** on **`agent-bootstrap`**, **`get-next-actions`**, and **`agent-session-snapshot`** summarizes playbook paths and **`inProgressTasks`** without running git.
