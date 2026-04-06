# Policy approval (agents)

Fail-closed: sensitive **`workspace-kit`** operations need explicit approval so automation cannot silently mutate kit-owned state.

**Tier tables and `operationId` rows:** `.ai/AGENT-CLI-MAP.md`  
**Ultra-compact CLI recap:** `.ai/machine-cli-policy.md`

## What counts as approval for `workspace-kit run`

For **policy-sensitive** `workspace-kit run` commands, use one of:

- JSON **`policyApproval`** in the **third CLI argument** (preferred in agents/CI)
- A **valid session grant** for the same `operationId` + `WORKSPACE_KIT_SESSION_ID`
- **Interactive approval** when stdio is a TTY and `WORKSPACE_KIT_INTERACTIVE_APPROVAL` enables the prompt

**Not sufficient:** chat messages, ticket comments, or **`WORKSPACE_KIT_POLICY_APPROVAL` alone** on the `run` path.

## Two approval surfaces (do not mix)

| Surface | When | How |
| --- | --- | --- |
| **`policyApproval` in JSON** | `workspace-kit run <cmd> '<json>'` when the command is policy-sensitive | Third argv includes `"policyApproval":{"confirmed":true,"rationale":"…"}`. Optional `"scope":"session"` for reuse with the same `WORKSPACE_KIT_SESSION_ID`. |
| **`WORKSPACE_KIT_POLICY_APPROVAL` env** | `workspace-kit init`, `upgrade`, **`config`** mutating subcommands | Export env to JSON `{"confirmed":true,"rationale":"…"}`. |

**`workspace-kit run` does not read `WORKSPACE_KIT_POLICY_APPROVAL` for the run path.** Repo helpers that wrap `run` may read the env var only to **inject** `policyApproval` into the third JSON argument.

## Agents and IDE subprocesses (non-TTY)

Assume **no TTY**: use JSON **`policyApproval`** on `workspace-kit run`. **Chat is not approval.**

## Evidence

- Traces: `.workspace-kit/policy/traces.jsonl`
- Session grants: `.workspace-kit/policy/session-grants.json` when using `scope":"session"`

## Copy-paste patterns

```bash
workspace-kit run generate-recommendations '{"policyApproval":{"confirmed":true,"rationale":"improvement pass"}}'
```

```bash
export WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"config change"}'
workspace-kit config set some.key value --json
```

**Policy rehearsal:** `generate-recommendations` accepts `"dryRun":true` in JSON; still pass **`policyApproval`** when the command remains gated.

## `operationId` recipes (doc generation + task-engine backfill)

These are **Tier B** `workspace-kit run` commands: approval is JSON **`policyApproval`** on the **third** argv object. **`WORKSPACE_KIT_POLICY_APPROVAL` alone does not satisfy** the `run` path.

### `doc.generate-document`

Dry-run / preview (not sensitive):

```bash
pnpm exec wk run generate-document '{"documentType":"ROADMAP.md","options":{"dryRun":true}}'
```

Real write (example — adjust `documentType` / `options` per `src/modules/documentation/instructions/generate-document.md`):

```bash
pnpm exec wk run generate-document '{"documentType":"ROADMAP.md","options":{"overwriteHuman":true},"policyApproval":{"confirmed":true,"rationale":"regenerate maintainer ROADMAP"}}'
```

### `task-engine.backfill-task-feature-links`

This repository sets `tasks.planningGenerationPolicy` to **`require`**: **both** dry-run and live runs need **`policyApproval`** and **`expectedPlanningGeneration`** (read **`data.planningGeneration`** from **`list-tasks`** / **`get-next-actions`** first).

Dry-run:

```bash
pnpm exec wk run list-tasks '{}'
pnpm exec wk run backfill-task-feature-links '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"dry-run backfill"},"expectedPlanningGeneration":123}'
```

Live backfill (replace the integer; **`dryRun`** false or omit when your instruction allows):

```bash
pnpm exec wk run backfill-task-feature-links '{"dryRun":false,"policyApproval":{"confirmed":true,"rationale":"backfill task↔feature junction"},"expectedPlanningGeneration":123}'
```
