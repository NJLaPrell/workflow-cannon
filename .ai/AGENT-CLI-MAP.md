# Agent CLI map (navigation)

Machine-oriented **how to run** workspace-kit in this repo: policy, cold start, and where the heavy copy-paste tables went.

**Full narrative + long copy-paste appendix (human optional):** [`.ai/AGENT-CLI-MAP.extended.md`](./AGENT-CLI-MAP.extended.md)

**Per-command argv JSON Schema + samples (generated, CI-checked):** [`.ai/agent-cli-snippets/INDEX.json`](./agent-cli-snippets/INDEX.json) — one `--schema-only` JSON blob per `workspace-kit run` command under [`by-command/`](./agent-cli-snippets/by-command/).

**Related:** [`.ai/POLICY-APPROVAL.md`](./POLICY-APPROVAL.md), [`.ai/TERMS.md`](./TERMS.md), [`CLI-VISUAL-GUIDE.md`](./CLI-VISUAL-GUIDE.md), `src/modules/*/instructions/*.md` (human procedure per command).

## 30-second bootstrap

1. **`pnpm exec wk run agent-bootstrap '{}'`** — doctor-equivalent checks + session snapshot (read-only). Optional lean digest for the instruction catalog: **`'{"projection":"lean"}'`** (compare `data.instructionSurface.instructionSurfaceDigest` to skip reloading full `commands[]` from `doctor --agent-instruction-surface`).
2. **`pnpm exec wk doctor --agent-instruction-surface`** — full instruction rows + activation report. Add **`--agent-instruction-surface-lean`** (alone or with the base flag) for digest-only **`projection: "lean"`** when the catalog unchanged.
3. **`pnpm exec wk run`** (no subcommand) — executable commands for the enabled module set.
4. **Schema discovery:** **`pnpm exec wk run <command> --schema-only '{}'`** — same shapes as committed under **`.ai/agent-cli-snippets/by-command/`**.

**Clean stdout:** Prefer **`pnpm exec wk`** over **`pnpm run wk`** when parsing JSON.

**Agent task reads:** `.ai/runbooks/agent-task-db-contract.md`, `schemas/agent-task-read-contract.v1.json` — use command JSON, not raw SQLite.

## Runtime invocation

- **Shape:** `pnpm exec wk run <command> '<single-json-object>'` — Tier A/B mutators need **`"policyApproval":{"confirmed":true,"rationale":"…"}`** inside that object. Env **`WORKSPACE_KIT_POLICY_APPROVAL`** does **not** approve `run` (init/upgrade/config only).
- **Planning generation (`require`):** read **`planningGeneration`** from **`list-tasks` / `get-task` / `get-next-actions`**, then pass **`expectedPlanningGeneration`** on prelude commands (see **`schemas/planning-generation-cli-prelude.json`**).
- **Failures:** **`invalid-run-args`** → fix against **`--schema-only`**; **`planning-generation-*`** → re-read generation and retry; **`policy-denied`** → JSON approval on argv.

## Tier overview

| Tier | Meaning | Approval |
| --- | --- | --- |
| **A** | Task lifecycle / `run-transition` family | JSON **`policyApproval`** on `run` |
| **B** | Other sensitive `run` commands | JSON **`policyApproval`** |
| **C** | Read-only or non-sensitive `run` | None (normal review) |

**Lanes:** JSON **`policyApproval`** on `run` vs env **`WORKSPACE_KIT_POLICY_APPROVAL`** for top-level **`init` / `upgrade` / `config`** — [`.ai/POLICY-APPROVAL.md`](./POLICY-APPROVAL.md).

## Maintainer delivery (one `T###` → `release/phase-<N>`)

Playbook: [`.ai/playbooks/task-to-phase-branch.md`](./playbooks/task-to-phase-branch.md) — branch from phase branch, PR, merge, **`run-transition`** **`complete`** with evidence.

## Contract: no hand-editing lifecycle in the task store

Use **`workspace-kit run run-transition`** (and related commands). Do not edit SQLite/JSON task stores for routine status motion.

## Shell scripts consuming stdout

`workspace-kit run` emits **one JSON value** on stdout (often pretty-printed). Capture full stdout, trim, **`JSON.parse` once**. See **`.ai/AGENT-CLI-MAP.extended.md`** → *Shell scripts and JSON stdout* for edge cases (`set -euo pipefail`, `clientMutationId`, parse vs `ok:false`).

## Response templates

Optional **`responseTemplateId`** / directive fields on argv — [`.ai/response-template-contract.md`](./response-template-contract.md), [`.ai/runbooks/response-templates.md`](./runbooks/response-templates.md).

## Where did the big tables go?

- **Tier A/B/C examples, CAE block, queue-health copy-paste, wishlist ladder:** **`.ai/AGENT-CLI-MAP.extended.md`**
- **Runnable command → schema + sample argv:** **`.ai/agent-cli-snippets/`**

Regenerate snippets after changing pilot args or manifest (requires build):

```bash
pnpm run build && node scripts/generate-agent-cli-snippets.mjs
```

Maintainer mirror: **`docs/maintainers/AGENT-CLI-MAP.md`** — keep in sync with policy additions; coverage gate also accepts snippet **INDEX.json** entries (see **`scripts/check-agent-cli-map-coverage.mjs`**).
