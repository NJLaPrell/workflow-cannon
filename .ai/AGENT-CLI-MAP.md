# Agent CLI map (navigation)

Machine-oriented **how to run** workspace-kit in this repo: policy, cold start, and where the heavy copy-paste tables went.

**Full narrative + long copy-paste appendix (human optional):** [`.ai/AGENT-CLI-MAP.extended.md`](./AGENT-CLI-MAP.extended.md)

**Per-command argv JSON Schema + samples (generated, CI-checked):** [`.ai/agent-cli-snippets/INDEX.json`](./agent-cli-snippets/INDEX.json) — one `--schema-only` JSON blob per `workspace-kit run` command under [`by-command/`](./agent-cli-snippets/by-command/).

**Related:** [`.ai/POLICY-APPROVAL.md`](./POLICY-APPROVAL.md), [`.ai/TERMS.md`](./TERMS.md) (machine `term|name=sprint|…` row lists **sprint** machine synonyms), [`.ai/TERMS.index.json`](./TERMS.index.json), [`CLI-VISUAL-GUIDE.md`](./CLI-VISUAL-GUIDE.md), `src/modules/*/instructions/*.md` (human procedure per command).

## Discover the surface

When you do not know a command name or argv shape:

1. **`pnpm exec wk run --list-commands`** (alias: **`pnpm exec wk run list-commands '{}'`**, or **`pnpm exec wk run --json`**) — machine catalog with `instructionPath` and schema hints per command.
2. **`pnpm exec wk run <command> --schema-only '{}'`** — JSON Schema + sample args before mutating.
3. **`pnpm exec wk doctor --agent-instruction-surface`** — full instruction catalog + activation report.

Failed `wk run` envelopes include **`discovery.listCommands`** and **`discovery.schemaOnly`** when args or command names are wrong.

## 30-second bootstrap

**Command path:** In an **attached project**, use **`./.workspace-kit/bin/wk`** as the canonical Workflow Cannon command after `init`; it delegates through the stamped Node runtime in **`.workspace-kit/runtime.json`** and does not require `nvm use` before routine commands. In the **Workflow Cannon source checkout**, `pnpm exec wk` (or `node dist/cli.js` from a built tree) remains appropriate for package development.

For a **net-new consumer project**, attach Workflow Cannon first: install `@workflow-cannon/workspace-kit`, run **`pnpm exec wk init --dry-run --json`** to preview owned paths, then run **`pnpm exec wk init`** with `WORKSPACE_KIT_POLICY_APPROVAL`; after that, use **`./.workspace-kit/bin/wk start`**. The bootstrap below is for this source checkout or an already-attached workspace.

1. **`./.workspace-kit/bin/wk run agent-bootstrap '{}'`** — doctor-equivalent checks + session snapshot (read-only). Optional lean digest for the instruction catalog: **`'{"projection":"lean"}'`** (compare `data.instructionSurface.instructionSurfaceDigest` to skip reloading full `commands[]` from `doctor --agent-instruction-surface`).
2. **`./.workspace-kit/bin/wk doctor --agent-instruction-surface`** — full instruction rows + activation report. Add **`--agent-instruction-surface-lean`** (alone or with the base flag) for digest-only **`projection: "lean"`** when the catalog unchanged.
3. **`./.workspace-kit/bin/wk run`** (no subcommand) — executable commands for the enabled module set.
4. **Schema discovery:** **`./.workspace-kit/bin/wk run <command> --schema-only '{}'`** — same shapes as committed under **`.ai/agent-cli-snippets/by-command/`**.

**Clean stdout:** In attached projects, prefer **`./.workspace-kit/bin/wk`**. In this source checkout, prefer **`pnpm exec wk`** over **`pnpm run wk`** when parsing JSON.

**Agent task reads:** `.ai/runbooks/agent-task-db-contract.md`, `schemas/agent-task-read-contract.v1.json`, `schemas/agent-phase-journal-read-contract.v1.json` — use command JSON, not raw SQLite.

## Runtime invocation

- **Shape:** `./.workspace-kit/bin/wk run <command> '<single-json-object>'` in attached projects, or `pnpm exec wk run <command> '<single-json-object>'` in this source checkout. Tier A/B mutators need **`"policyApproval":{"confirmed":true,"rationale":"…"}`** inside that object. Env **`WORKSPACE_KIT_POLICY_APPROVAL`** does **not** approve `run` (init/upgrade/config only).

### Shell-safe JSON argv (agents)

- Prefer **`./.workspace-kit/bin/wk`** (attached) or **`pnpm exec wk`** (source checkout) so stdout stays a single JSON value without pnpm engine warnings on stderr.
- **Single-quoted** third-arg JSON breaks when the payload contains `'` — use a here-doc, **`@file` argv** (when supported), or build JSON in Node/`jq` and pass the variable unquoted.
- Capture stdout only: `out="$(pnpm exec wk run list-tasks '{}')"` then `node -e 'JSON.parse(process.argv[1])' "$out"` — do not pipe mixed stderr into the parser.
- Before **`run-transition` `complete`**, run **`completion-preflight`**; before mutating commands, run **`agent-mutation-plan`** with `commandName` set.
- Errors surface **`remediation.instructionPath`** and **`.ai/` `remediation.docPath`** first; maintainer mirrors may appear in **`docAnchors`** only.
- **Planning generation (`require`):** read **`planningGeneration`** from **`list-tasks` / `get-task` / `get-next-actions`**, then pass **`expectedPlanningGeneration`** on prelude commands (see **`schemas/planning-generation-cli-prelude.json`**).
- **Failures:** **`invalid-run-args`** → fix against **`--schema-only`**; **`planning-generation-*`** → re-read generation and retry; **`policy-denied`** → JSON approval on argv.
- **Phase journal (examples):** **`./.workspace-kit/bin/wk run add-phase-note '{}'`**, **`./.workspace-kit/bin/wk run list-phase-notes '{}'`**, **`./.workspace-kit/bin/wk run propose-tasks-from-phase-notes '{}'`**, **`./.workspace-kit/bin/wk run convert-phase-note-to-task '{}'`** — see `src/modules/task-engine/instructions/*.md`.

## Tier overview

| Tier | Meaning | Approval |
| --- | --- | --- |
| **A** | Task lifecycle / `run-transition` family | JSON **`policyApproval`** on `run` |
| **B** | Other sensitive `run` commands | JSON **`policyApproval`** |
| **C** | Read-only or non-sensitive `run` | None (normal review) |

**Lanes:** JSON **`policyApproval`** on `run` vs env **`WORKSPACE_KIT_POLICY_APPROVAL`** for top-level **`init` / `upgrade` / `config`** — [`.ai/POLICY-APPROVAL.md`](./POLICY-APPROVAL.md).

**Dashboard:** Routine drawer actions auto-fill structured `policyApproval.rationale`; elevated paths require operator text. Agents invoking **`wk run` from the terminal** must still pass explicit JSON rationale — see [`.ai/POLICY-APPROVAL.md`](./POLICY-APPROVAL.md) → **Workflow Cannon Dashboard**.

## PlanArtifact v1 (planning module)

Runbook: [`.ai/runbooks/plan-artifact-workflow.md`](./runbooks/plan-artifact-workflow.md). Copy-paste ladder: [`.ai/AGENT-CLI-MAP.extended.md`](./AGENT-CLI-MAP.extended.md) → *PlanArtifact lifecycle*. Validate-only: `pnpm exec wk run draft-plan-artifact '{"persist":false,"artifact":{...}}'`. Finalize preview is Tier C: `pnpm exec wk run finalize-plan-to-phase '{"planId":"<uuid>","dryRun":true}'`. Finalize persist is Tier B and needs JSON `policyApproval` + `expectedPlanningGeneration`: `pnpm exec wk run finalize-plan-to-phase '{"planId":"<uuid>","dryRun":false,"targetPhaseKey":"110","targetPhase":"Phase 110","desiredStatus":"ready","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"materialize accepted plan WBS"}}'`. Use `--schema-only` for arg shapes.

## Maintainer delivery (one `T###` → `release/phase-<N>`)

Playbook: [`.ai/playbooks/task-to-phase-branch.md`](./playbooks/task-to-phase-branch.md) — branch from phase branch, PR, merge, **`run-transition`** **`complete`** with evidence.

## Ideas capture

- `pnpm exec wk run create-idea '{"title":"Try planner chat from Ideas","policyApproval":{"confirmed":true,"rationale":"capture operator idea"}}'`
- `pnpm exec wk run get-idea '{"ideaId":"I001"}'`
- `pnpm exec wk run list-ideas '{}'`
- `pnpm exec wk run get-planner-flow-status '{}'` — Tier C read-only; golden-path stage, blockers, and recommended next CLI command (optional `ideaId`)
- `pnpm exec wk run update-idea '{"ideaId":"I001","status":"planning","policyApproval":{"confirmed":true,"rationale":"mark idea as planning"}}'`
- `pnpm exec wk run delete-idea '{"ideaId":"I001","policyApproval":{"confirmed":true,"rationale":"remove stale idea"}}'`
- `pnpm exec wk run reorder-ideas '{"ideaIds":["I002","I001"],"policyApproval":{"confirmed":true,"rationale":"reorder ideas by operator priority"}}'`
- `pnpm exec wk run start-brainstorm-session '{"planRef":"plan-artifact:<planId>","policyApproval":{"confirmed":true,"rationale":"start brainstorm session"}}'`
- `pnpm exec wk run update-brainstorm-session '{"planRef":"plan-artifact:<planId>","sessionIndex":0,"inputs":{"valueImpact":8},"policyApproval":{"confirmed":true,"rationale":"update brainstorm inputs"}}'` — use `completedAt` here to finish the guided session, then stop for operator direction.
- `pnpm exec wk run complete-brainstorm '{"planRef":"plan-artifact:<planId>","operatorConfirmedBrainstormComplete":true,"policyApproval":{"confirmed":true,"rationale":"operator confirmed brainstorming is finished and planning should start"}}'` — only after the operator explicitly says brainstorming is finished.
- `pnpm exec wk run check-delivery-status '{"planRef":"plan-artifact:<planId>","policyApproval":{"confirmed":true,"rationale":"check IdeaPlan delivery task completion"}}'`

## Contract: no hand-editing lifecycle in the task store

Use **`workspace-kit run run-transition`** (and related commands). Do not edit SQLite/JSON task stores for routine status motion.

## Shell scripts consuming stdout

`workspace-kit run` emits **one JSON value** on stdout (often pretty-printed). Capture full stdout, trim, **`JSON.parse` once**. See **`.ai/AGENT-CLI-MAP.extended.md`** → *Shell scripts and JSON stdout* for edge cases (`set -euo pipefail`, `clientMutationId`, parse vs `ok:false`).

## Response templates

Optional **`responseTemplateId`** / directive fields on argv — [`.ai/response-template-contract.md`](./response-template-contract.md), [`.ai/runbooks/response-templates.md`](./runbooks/response-templates.md).

## Agent presentation policy

Baseline visible-agent presentation is configured with **`agentPresentation.*`** and resolved through **`resolve-agent-guidance`** / **`dashboard-summary`**. The generated Cursor rule from **`sync-effective-behavior-cursor-rule`** is the early chat instruction surface; dashboards and **`data.presentation.agentPresentation`** are observability/output metadata only. Private reasoning is never displayed or requested. Use CAE scoped Guidance for situational exceptions such as onboarding plain language, phase closeout technical evidence, or sensitive-command remediation: [`.ai/runbooks/agent-presentation-policy.md`](./runbooks/agent-presentation-policy.md).

## Dashboard policy UX (extension)

The Cursor Dashboard drawer sends JSON **`policyApproval`** on gated **`wk run`** calls. **Routine** paths auto-build rationale (`dashboard|workflow=…|tier=routine|…`); **elevated** paths require operator text in the drawer (`|detail=…`). Agents on the terminal must **not** reuse Dashboard boilerplate — see **`.ai/POLICY-APPROVAL.md`** (Dashboard section) and **`.ai/DASHBOARD-POLICY-UX.md`**. Tier matrix: `extensions/cursor-workflow-cannon/src/policy/dashboard-policy-tier.ts`.

## WC Agent status workflow

`dashboard-summary.data.agentStatus` is a status hint for operators. `source: "derived"` comes from existing task/dashboard facts and is enough for `Awaiting Instruction`, active planning, blocked work, in-progress work, delegation, or suggested ready work. `source: "live_activity"` comes from a fresh expiring lease and is for intent that cannot be inferred, such as PR review, approval queue review, validation, release, policy approval, or human gates.

Record high-signal live activity with **`pnpm exec wk run set-agent-activity '{"kind":"reviewing_pr","prNumber":192}'`** or structured fields like **`version`**, **`phaseKey`**, **`taskId`**, **`details.prUrl`**, **`details.reviewItemId`**, and **`details.validationCommand`**. Clear it with **`clear-agent-activity`** when the flow finishes; otherwise expiry returns the dashboard to derived status. Do not treat live activity as transition evidence, and do not add GitHub/network lookups to `dashboard-summary`.

## Project memory (governed recall)

Distinct from `.ai/` canon and `document-project` outputs — see `CANNON.md` and `explain-memory-precedence`.

- `pnpm exec wk run list-memory '{}'`
- `pnpm exec wk run write-memory '{"category":"runtime","body":"…","policyApproval":{"confirmed":true,"rationale":"…"}}'`
- `pnpm exec wk run approve-memory '{"id":"mem_…","policyApproval":{"confirmed":true,"rationale":"…"}}'`
- `pnpm exec wk run prune-memory '{"id":"mem_…","auditNote":"…","policyApproval":{"confirmed":true,"rationale":"…"}}'`
- `pnpm exec wk run explain-memory-precedence '{}'`


## Task sync (canonical backend)

Preferred **`task-sync-*`** commands (backend-neutral). Legacy **`task-state-*`** names remain as recovery aliases — same argv and policy surfaces.

| Canonical | Recovery alias |
| --- | --- |
| `task-sync-status` | `task-state-status` |
| `task-sync-hydrate` | `task-state-hydrate` |
| `task-sync-init` | `task-state-init` |
| `task-sync-verify` | `task-state-verify` |
| `task-sync-publish` | `task-state-publish` |
| `task-sync-snapshot` | `task-state-snapshot` |
| `task-sync-compact` | `task-state-compact` |

- `pnpm exec wk run task-sync-status '{}'`
- `pnpm exec wk run task-sync-hydrate '{"fetch":true,"policyApproval":{"confirmed":true,"rationale":"…"}}'`
- `pnpm exec wk run task-sync-publish '{"policyApproval":{"confirmed":true,"rationale":"…"}}'` (see `--schema-only` for full argv)
- `pnpm exec wk run task-sync-verify '{"source":"git","branch":"workflow-cannon/task-state"}'`

Operator runbook: [`.ai/runbooks/task-state-git-operator.md`](./runbooks/task-state-git-operator.md). Per-command schemas: [`.ai/agent-cli-snippets/`](./agent-cli-snippets/INDEX.json).

## Isolated proposal mode

- `pnpm exec wk run create-isolated-proposal '{"taskId":"T100193","baseBranch":"release/phase-137"}'`
- `pnpm exec wk run list-isolated-proposals '{}'`
- `pnpm exec wk run view-isolated-proposal-diff '{"proposalId":"proposal-<id>"}'`
- `pnpm exec wk run apply-isolated-proposal '{"proposalId":"proposal-<id>","dryRun":true}'`
- `pnpm exec wk run open-isolated-proposal-pr '{"proposalId":"proposal-<id>","dryRun":true}'`
- `pnpm exec wk run discard-isolated-proposal '{"proposalId":"proposal-<id>"}'`
- `pnpm exec wk run recover-isolated-proposal '{"proposalId":"proposal-<id>"}'`
- `pnpm exec wk run record-isolated-proposal-validation '{"proposalId":"proposal-<id>","command":"pnpm run check","status":"passed"}'`
- `pnpm exec wk run export-task-state-artifacts '{"outputDir":".workspace-kit/state-export","dryRun":false}'`

## Remote runs (Cursor background agents)

Phase 1 (T100334): read-only `list-remote-runs` stub; launch/write kit commands not shipped. Phase 2 adapters use **Cursor SDK** (`@cursor/sdk` / `cursor-sdk`) per `.ai/adrs/ADR-cursor-remote-agent-handoff-v1.md`.

- `pnpm exec wk run list-remote-runs '{}'`
- `pnpm exec wk run list-remote-runs '{"taskId":"T100334"}'`

Runbook: [`.ai/runbooks/cursor-remote-agent-handoff.md`](./runbooks/cursor-remote-agent-handoff.md). Schema: `schemas/remote-run-metadata.v1.json`.

## Where did the big tables go?

- **Tier A/B/C examples, CAE block, queue-health copy-paste, Ideas/planning ladder:** **`.ai/AGENT-CLI-MAP.extended.md`**
- **Runnable command → schema + sample argv:** **`.ai/agent-cli-snippets/`**

Regenerate snippets after changing pilot args or manifest (requires build):

```bash
pnpm run build && node scripts/generate-agent-cli-snippets.mjs
```

Maintainer mirror: **`docs/maintainers/AGENT-CLI-MAP.md`** — keep in sync with policy additions; coverage gate also accepts snippet **INDEX.json** entries (see **`scripts/check-agent-cli-map-coverage.mjs`**).
