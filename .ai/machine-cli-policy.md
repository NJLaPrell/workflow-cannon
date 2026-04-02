# Machine CLI and policy quickref (agents)

**Canonical maintainer prose** (long tables, diagrams, release detail) stays in `docs/maintainers/AGENT-CLI-MAP.md`, `docs/maintainers/POLICY-APPROVAL.md`, `docs/maintainers/RELEASING.md`, and `docs/maintainers/CLI-VISUAL-GUIDE.md`. **Agents** should use this file plus live CLI output.

## Tier A — task lifecycle

Use `workspace-kit run run-transition` with JSON **`policyApproval`** as the **third** CLI argument (not chat-only approval).

```bash
pnpm run wk run run-transition '{"taskId":"T###","action":"start","policyApproval":{"confirmed":true,"rationale":"begin work"}}'
```

## Tier B — sensitive `workspace-kit run` (non-transition)

Pass **`policyApproval`** inside the JSON args object for commands marked sensitive in the builtin manifest (for example `generate-recommendations`, `ingest-transcripts`).

## Config / init / upgrade lane

For `workspace-kit config`, `init`, and `upgrade`, approval may use env **`WORKSPACE_KIT_POLICY_APPROVAL`** (JSON string). **Do not** rely on that env for the `run` subcommand path—`run` expects JSON **`policyApproval`** on the command args when the operation is sensitive.

## Policy rehearsal (dry run)

`generate-recommendations` accepts **`dryRun: true`** in JSON args. It evaluates candidates and returns `recommendations-rehearsal` **without** syncing transcripts, persisting tasks, or writing improvement state. Still pass **`policyApproval`** when the command remains policy-gated.

## Discovery without dumping catalogs

Prefer `pnpm run wk run` with no subcommand for a short command list, then open `src/modules/<module>/instructions/<command>.md` for the specific surface. Avoid pasting full `doctor` JSON catalogs into chat unless debugging.
