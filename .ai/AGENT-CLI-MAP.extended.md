# Agent CLI map

> **Phase 76:** Prefer the navigation-first **[`.ai/AGENT-CLI-MAP.md`](./AGENT-CLI-MAP.md)** plus **`.ai/agent-cli-snippets/`** for argv shapes. This file keeps the **full** tier tables and copy-paste wall for maintainers and deep dives.

Single maintainer reference for **what agents must run in a terminal** when working in this repository. Intent → command → approval surface → evidence.

**Prefer diagrams first?** [`CLI-VISUAL-GUIDE.md`](./CLI-VISUAL-GUIDE.md) — ASCII topology, Mermaid decision flow, approval lanes, default module router.

**Related:** `.ai/POLICY-APPROVAL.md` (approval semantics), `.ai/TERMS.md` (terminology), module instructions under `src/modules/*/instructions/*.md` (exact JSON fields per command).

**Architecture review index (cold start):** [`.ai/runbooks/principal-architectural-review-themes.md`](./runbooks/principal-architectural-review-themes.md) — ranked themes (schema/contract sprawl, task-engine gravity, extension ↔ package contract drift) with repo anchors.

**Cursor extension (monorepo):** TypeScript shapes for **`dashboard-summary`** success payloads are shared from **`@workflow-cannon/workspace-kit/contracts/dashboard-summary-run`** (see `extensions/cursor-workflow-cannon/README.md`).

## 30-second bootstrap (run this first)

If a session might touch `.workspace-kit/` state, lifecycle transitions, policy traces, approvals, or generated maintainer docs, run this first:

Use **`./.workspace-kit/bin/wk`** in attached projects; it reads the stamped runtime from **`.workspace-kit/runtime.json`**. Use `pnpm exec wk` / `node dist/cli.js` for Workflow Cannon source checkout development.

1. **One-shot (preferred):** `./.workspace-kit/bin/wk run agent-bootstrap '{}'` — same contract checks as `doctor` **plus** `agent-session-snapshot` fields in one JSON response (read-only).
2. **Split:** `./.workspace-kit/bin/wk doctor` — confirms canonical task/policy contract files are present; then `./.workspace-kit/bin/wk run agent-session-snapshot '{}'` for the composed bundle.
3. `./.workspace-kit/bin/wk run` (no subcommand) — lists **router-registered** commands (executable for the current enabled module set).
4. Use this map + `src/modules/<module>/instructions/<command>.md` for JSON payload shape.

**CAE (`cae-*` read-only commands):** when shipped (**`T861`**, **`T862`**), names + JSON envelope live in **`.ai/cae/cli-read-only.md`**; operator/debug path in **`.ai/cae/README.md`** and **`.ai/runbooks/cae-debug.md`** (**`T855`**). **Advisory CAE on `doctor` / agent instruction surface (design):** **`.ai/cae/advisory-surfacing.md`** (**`T850`**).

Optional machine-readable catalog (same validation as `doctor`, then JSON on stdout):

```bash
./.workspace-kit/bin/wk doctor --agent-instruction-surface
```

Payload shape: `{ ok, code: "agent-instruction-surface", data: { schemaVersion, commands[], activationReport, errorRemediationCatalog } }`. Rows include `executable` and `degradation` when a declared instruction is documentation-only because the owning module or a `requiresPeers` module is disabled. **`errorRemediationCatalog`** maps common failure `code` strings to repo-relative **`instructionPath`** / **`docPath`** hints (see **`docs/maintainers/adrs/ADR-cli-error-remediation-contract.md`**). **Documentation-only** does **not** waive `policyApproval` for mutating `workspace-kit run` operations — see `.ai/POLICY-APPROVAL.md`.

When the workspace root is not a kit source checkout, instruction paths still resolve from the process working directory (same rule as `resolveRegistryAndConfig`); run from the repo root in CI and local dev so paths match this tree.

## Runtime `workspace-kit run` invocation (argv, `--schema-only`, approvals)

1. **Shape:** `./.workspace-kit/bin/wk run <command> '<single-json-object>'` in attached projects, or `pnpm exec wk run <command> '<single-json-object>'` in this source checkout — the third argv is one JSON object. Discovery flags attach to the command: `./.workspace-kit/bin/wk run run-transition --schema-only '{}'`.
2. **Policy:** Tier A/B mutators require `"policyApproval":{"confirmed":true,"rationale":"…"}` **inside** that JSON. The env var **`WORKSPACE_KIT_POLICY_APPROVAL`** does **not** approve `workspace-kit run` — see **Two approval lanes** below.
3. **Schema discovery:** Use `./.workspace-kit/bin/wk run <command> --schema-only` for any executable command to emit JSON Schema or a permissive fallback, `sampleArgs`, examples, instruction path, policy metadata, planning-generation metadata, and idempotency hints instead of executing.
4. **Failures:** **`invalid-run-args`** → fix JSON against the schema from **`--schema-only`**. **`planning-generation-required`** / **`planning-generation-mismatch`** → re-read **`data.planningGeneration`** from **`list-tasks`** / **`get-next-actions`** / **`get-task`**, then pass **`expectedPlanningGeneration`** on commands listed in **`schemas/planning-generation-cli-prelude.json`** (this repo uses policy **`require`**).
5. **Clean stdout:** Prefer **`./.workspace-kit/bin/wk`** in attached projects; prefer **`pnpm exec wk`** over **`pnpm run wk`** in this source checkout when scripts parse JSON from stdout — see **Shell scripts and JSON stdout** below.

Verified read: `./.workspace-kit/bin/wk run list-tasks '{}'`.

**Agent task read contract:** normal task reads use the versioned v1 projection in
`.ai/runbooks/agent-task-db-contract.md`, `schemas/agent-task-read-contract.v1.json`,
and package subpath `@workflow-cannon/workspace-kit/contracts/agent-task-read-contract`.
Phase journal projections share **`schemas/agent-phase-journal-read-contract.v1.json`**
and **`@workflow-cannon/workspace-kit/contracts/agent-phase-journal-read-contract`**.
Agents should consume `get-next-actions`, `list-tasks`, `get-task`, `queue-health`,
dependency graph, and evidence/history command JSON instead of raw SQLite tables or
blob mirrors.

## Team execution assignments and subagent registry (inspect vs mutate)

**Architecture:** `docs/maintainers/adrs/ADR-team-execution-v1.md`, `docs/maintainers/adrs/ADR-subagent-registry-v1.md`.

**SQLite (configured kit DB, `tasks.sqliteDatabaseRelativePath`):**

- **Team execution:** table **`kit_team_assignments`** (`PRAGMA user_version` ≥ 7).
- **Subagents:** **`kit_subagent_definitions`**, **`kit_subagent_sessions`**, **`kit_subagent_messages`** (`user_version` ≥ 6).

**Read-only rollups**

- **`pnpm exec wk run dashboard-summary '{}'`** — **`data.teamExecution`** and **`data.subagentRegistry`** when schema versions match; see `src/modules/task-engine/instructions/dashboard-summary.md`.
- **`pnpm exec wk run agent-session-snapshot '{}'`** — composed bundle including open team assignments when present.

**Mutating CLI (Tier B + `policyApproval`; add `expectedPlanningGeneration` when policy `require`)**

- **Team:** `list-assignments`, `agent-execution-packet`, `assignment-reconciliation-preflight`, `register-assignment`, `submit-assignment-handoff`, `reconcile-assignment`, `block-assignment`, `cancel-assignment` — `src/modules/team-execution/instructions/*.md`.
- **Subagents:** `register-subagent`, `spawn-subagent`, `message-subagent`, `close-subagent-session`, … plus read-only `list-*` / `get-*` — **`.ai/runbooks/subagent-registry.md`**.

**Cursor extension:** dashboard consumes packaged **`dashboard-summary`** JSON (`extensions/cursor-workflow-cannon/README.md`).

## Quick boundary gate (use this before acting)

- If work mutates task lifecycle, approvals, policy traces, transcript/improvement stores, or maintainer doc generation outputs, use the matching `workspace-kit` command from this map.
- If work is application/source edits only, use normal code workflow; optional Tier C reads (`list-tasks`, `get-next-actions`, `list-approval-queue`) are safe discovery helpers.
- For `workspace-kit run` sensitive operations, pass JSON `policyApproval`; for top-level `workspace-kit config|init|upgrade`, use env `WORKSPACE_KIT_POLICY_APPROVAL`.

## Maintainer playbook: one task to the phase integration branch

When delivering **one** **`T###`** via GitHub PR **into `release/phase-<N>`** (not **`main`**), use the ordered playbook **`.ai/playbooks/task-to-phase-branch.md`** (id `task-to-phase-branch`): ensure the phase branch exists (from **`main`** when starting a phase), branch the task from **`release/phase-<N>`**, implement, open PR with **base = phase branch**, review (and iterate with PR comments until checks pass), merge into the phase branch, then **`run-transition`** with **`complete`** and evidence. Pairs with **`.cursor/rules/maintainer-delivery-loop.mdc`** and **`.cursor/rules/branching-tagging-strategy.mdc`**; optional requestable **`.cursor/rules/playbook-task-to-phase-branch.mdc`**. Phase → **`main`** happens at closeout per **`.ai/playbooks/phase-closeout-and-release.md`**. Human summary: **`.ai/agent-source-of-truth-order.md`** → **Task execution**.

## Maintainer playbook: improvement discovery

When **researching** friction to log as **`type: "improvement"`** tasks (**`T###`** ids; **`create-task`** or **`generate-recommendations`** / **`ingest-transcripts`**), synthesize a **problem report** (`metadata.issue`, `metadata.supportingReasoning`)—not raw transcript/tool dumps. Use **`.ai/playbooks/improvement-task-discovery.md`** (id `improvement-task-discovery`). For a **bounded scout** pass (lens rotation, evidence floor, read-only rehearsal JSON), use **`.ai/playbooks/improvement-scout.md`** (id `improvement-scout`) and **`workspace-kit run scout-report`** (non-sensitive). Optional requestable **`.cursor/rules/playbook-improvement-task-discovery.mdc`**. Human summary: **`.ai/agent-source-of-truth-order.md`** → **Improvement discovery**.

## Maintainer playbook: improvement triage (top 3 → ready)

When **promoting** up to three **`type: "improvement"`** tasks from **`proposed`** to **`ready`**, use **`.ai/playbooks/improvement-triage-top-three.md`** (id `improvement-triage-top-three`); Tier A **`run-transition`** with **`action":"accept"`** and **`policyApproval`**. Optional requestable **`.cursor/rules/playbook-improvement-triage-top-three.mdc`**. Human summary: **`.ai/agent-source-of-truth-order.md`** → **Improvement triage**.

## Maintainer task templates (`tasks/*.md`) vs `workspace-kit`

Optional Markdown under **`tasks/*.md`** is **prompt-only** reference for agents and humans. Those files do **not** execute **`workspace-kit`**, write task-engine state, or satisfy policy. If a workflow step changes kit-owned files or policy-sensitive behavior, the agent must run the **`workspace-kit` line** from this map (or the linked instruction file)—not only describe it in chat.

## Contract: no hand-editing task lifecycle

**Do not** hand-edit `.workspace-kit/tasks/state.json` to move tasks between lifecycle states (`proposed` → `ready` → `in_progress` → `completed`, etc.). Use:

```bash
workspace-kit run run-transition '{"taskId":"T285","action":"start","policyApproval":{"confirmed":true,"rationale":"why this transition"}}'
```

Exception: **documented recovery** (e.g. repair after corruption) may require a maintainer to edit JSON under a tracked PR with evidence; that is out-of-contract for routine agent work.

## Shell scripts and JSON stdout

Successful **`workspace-kit run …`** invocations print **one JSON value to stdout** (often **pretty-printed across multiple lines**). Operators wrapping **`pnpm exec wk run`** / **`workspace-kit run`** in shell scripts should:

1. **Capture all stdout**, then **`trim`**, then **`JSON.parse` the whole string** — do not assume one line equals one JSON value and do not split on newlines to “find” JSON.
2. Treat **stderr separately** — diagnostics or progress may appear there; interleaving with stdout is not a supported contract for splitting streams into JSON.
3. Prefer the exported helper **`parseWorkspaceKitJsonStdout`** from **`@workflow-cannon/workspace-kit`** when writing Node-based automation; it preserves the “one JSON value” contract and returns targeted remediation for package-manager banner contamination.
4. Use **`clientMutationId`** on mutating commands (where supported) so retries are **idempotent** when you re-send the same logical operation after a timeout or ambiguous transport failure.
5. Distinguish **parse failures** (your script could not decode stdout as JSON — exit code may still be 0 if the process wrote non-JSON garbage) from **`ok: false`** in a successfully parsed payload (the kit returned a structured error). A parse error does **not** prove the kit skipped a mutation; check task-engine state before re-running destructive sequences.
6. Prefer **`set -euo pipefail`** (bash) and explicit capture: `out=$(pnpm exec wk run list-tasks '{}' 2>/dev/null)` then parse **`out`** — adjust stderr handling to your logging needs.
7. **`pnpm run wk …`** can prepend **package-manager banner lines** before the JSON document and break naive one-line parsers; prefer **`pnpm exec wk …`**, or **`node dist/cli.js run …`** from a built tree when scripts require clean stdout.

### Multi-writer task store (lost updates)

Parallel **`workspace-kit run`** processes that **mutate** task state each do read→modify→write; **last writer wins** without coordination. When **`tasks.planningGenerationPolicy`** is **`require`**, mutating commands should pass **`expectedPlanningGeneration`** from **`get-task`** / **`list-tasks`**. Reads stay safe. Depth: **`.ai/runbooks/task-persistence-operator.md`** and **`docs/maintainers/adrs/ADR-planning-generation-optimistic-concurrency.md`**.

### Relational SQLite: scalar text fields

**`approach`**, **`summary`**, and **`description`** persist as **single TEXT** values. Passing a JSON **array** where the relational row expects a string can yield **better-sqlite3** bind errors (“Too many parameter values”); keep bullet lists in **`technicalScope`** (string[]) or fold prose into one **`approach`** string.

## Tier overview

| Tier | Meaning | Approval |
| --- | --- | --- |
| **A** | Task Engine lifecycle transitions (`run-transition`) | JSON **`policyApproval`** on `workspace-kit run` (or session grant — see policy doc) |
| **B** | Other policy-sensitive `workspace-kit run` subcommands | JSON **`policyApproval`** (or session grant); **`WORKSPACE_KIT_POLICY_APPROVAL` is not read** for the `run` path |
| **C** | Application/source edits only; read-only or non-sensitive `run` commands | No kit policy approval (normal code review applies) |

**Extra sensitivity:** `policy.extraSensitiveModuleCommands` in effective config adds **Tier B** entries dynamically; denials may show `operationId` **`policy.dynamic-sensitive`**.

### Skill packs (read-only discovery; Tier C)

```bash
workspace-kit run list-skills '{}'
workspace-kit run inspect-skill '{"skillId":"sample-wc-skill"}'
workspace-kit run recommend-skills '{"tags":["example"]}'
```

**`apply-skill`** defaults to preview mode (policy waived); non-preview / audit paths are **Tier B** — see **Tier B** table below.

### Two approval lanes (single cross-reference)

| Lane | Mechanism | Applies to |
| --- | --- | --- |
| **JSON `policyApproval`** | Third CLI argument to `workspace-kit run … '<json>'` | Sensitive **`run`** subcommands (Tier A/B) |
| **Env `WORKSPACE_KIT_POLICY_APPROVAL`** | `export WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"…"}'` | **`workspace-kit init`**, **`upgrade`**, **`config`** mutations only |

**`workspace-kit run` does not read the env var** for approval. If you set the env var but omit JSON `policyApproval`, you get **`policy-denied`** with a wrong-lane hint. Diagram: [`CLI-VISUAL-GUIDE.md`](./CLI-VISUAL-GUIDE.md) → **Approval lanes (two doors)**. Normative detail: [`POLICY-APPROVAL.md`](./POLICY-APPROVAL.md) → **Two approval surfaces**.

## Response templates on `workspace-kit run`

Optional JSON shaping: pass **`responseTemplateId`** and/or plain-English in **`responseTemplateDirective`** / **`instructionTemplateDirective`** / **`instruction`**. Effective config may set **`responseTemplates.commandOverrides`**, **`responseTemplates.defaultTemplateId`**, and **`responseTemplates.enforcementMode`** (`advisory` vs **`strict`**).

- **Precedence table + strict behavior:** [`response-template-contract.md`](./response-template-contract.md) and runbook [`runbooks/response-templates.md`](./runbooks/response-templates.md).
- **Strict failures:** unknown resolved template → **`response-template-invalid`** (message includes which source picked the id); explicit id vs directive mismatch → **`response-template-conflict`**.

## Tier A — Task Engine transitions

| Intent | Invocation | `operationId` | Evidence |
| --- | --- | --- | --- |
| Transition task status | `workspace-kit run run-transition '<json>'` | `tasks.run-transition` | Transition record in command JSON output; task store update |
| Claim next runnable task | `workspace-kit run claim-next-task '<json>'` | `tasks.run-transition` | Same transition evidence as `run-transition` with action `start`, or structured no-op |
| Start one task | `workspace-kit run start-task '<json>'` | `tasks.run-transition` | Same transition evidence and idempotency as `run-transition` |
| Complete one task | `workspace-kit run complete-task '<json>'` | `tasks.run-transition` | Same transition evidence, delivery-evidence guard, and idempotency as `run-transition` |
| File in-loop defect | `workspace-kit run report-defect '<json>'` | `tasks.report-defect` | Creates **`improvement` / `proposed`** via thin **`create-task`** wrapper (`title`, `summary`, `evidence` required) |
| Block / pause / unblock / demote | `block-task`, `pause-task`, `unblock-task`, `demote-task` | `tasks.run-transition` | Same guards and evidence as **`run-transition`** with matching **`action`** |
| Accept / reject improvement | `accept-improvement`, `reject-improvement` | `tasks.run-transition` | **`accept`** / **`reject`** on **`proposed`** rows (intake guards still apply) |
| Promote transcript churn after research | `workspace-kit run synthesize-transcript-churn '<json>'` | `tasks.synthesize-transcript-churn` | Task becomes **`improvement` / `proposed`**; evidence row appended; prior forensics preserved under **`metadata.researchForensicsSnapshot`** |

**Copy-paste (start work):**

```bash
workspace-kit run run-transition '{"taskId":"T285","action":"start","policyApproval":{"confirmed":true,"rationale":"begin implementation"}}'
```

**Copy-paste (demote / return to triage — `ready` → `proposed`):**

```bash
workspace-kit run run-transition '{"taskId":"imp-example","action":"demote","policyApproval":{"confirmed":true,"rationale":"return to proposed until triage"}}'
```

**Session reuse (same shell / same `WORKSPACE_KIT_SESSION_ID`):**

```bash
export WORKSPACE_KIT_SESSION_ID=my-session
workspace-kit run run-transition '{"taskId":"T285","action":"complete","policyApproval":{"confirmed":true,"rationale":"criteria met","scope":"session"}}'
# later transitions for other Tier A/B ops with same operation grant rules...
```

See `src/modules/task-engine/instructions/run-transition.md` for allowed `action` values by state.

**Copy-paste (transcript churn → improvement, after you investigated the row):**

```bash
workspace-kit run synthesize-transcript-churn '{"taskId":"T301","synthesis":{"approach":"…","technicalScope":["…"],"acceptanceCriteria":["…"],"metadata":{"issue":"…","supportingReasoning":"…"}},"policyApproval":{"confirmed":true,"rationale":"synthesized from transcripts"}}'
```

Shape: `src/modules/task-engine/instructions/synthesize-transcript-churn.md`. When **`tasks.planningGenerationPolicy`** is **`require`**, add **`expectedPlanningGeneration`** from your last read.

### GitHub-native runner (Phase 55)

Headless **`run-transition`** from GitHub Actions must pass **`policyApproval` inside the third JSON argument** — same as any Tier A **`workspace-kit run`**. The reference script **`tools/github-invocation/run-github-delivery.mjs`** expects maintainer-supplied **`WORKSPACE_KIT_GITHUB_RUN_ARGS_JSON`** (full argv JSON object) plus **`WORKSPACE_KIT_GITHUB_RUN_POLICY_APPROVAL`** when **`policyApproval` is omitted** from that object; it never treats issue comments as approval. Plan-only automation uses **`kit.githubInvocation.planOnlyRunCommands`** (default includes **`get-next-actions`**, **`list-tasks`**, **`get-task`**). Runbook: **`.ai/runbooks/github-workflow-cannon-invocation.md`**; ADR: **`docs/maintainers/adrs/ADR-github-native-invocation.md`**.

### Planning generation (SQLite optimistic lock)

Config **`tasks.planningGenerationPolicy`**: **`off`** (consumer default; optional **`expectedPlanningGeneration`**), **`warn`** (omit allowed; watch **`planningGenerationPolicyWarnings`** on success JSON), **`require`** (**this repo** — mutating task-engine / planning persist / **`generate-recommendations`** must pass **`expectedPlanningGeneration`** from **`planningGeneration`** on your **last read**).

**Strong-consistency lap (policy `require`):** (1) `workspace-kit run list-tasks '{}'` (or **`get-next-actions`**, **`get-task`**, **`dashboard-summary`**) → read **`data.planningGeneration`**. (2) Include **`"expectedPlanningGeneration": <int>`** on the mutating command. (3) On **`planning-generation-mismatch`**, re-read and retry.

**Idempotency:** **`clientMutationId`** replay responses (**`*-idempotent-replay`**) do not write the planning row again and **do not** require **`expectedPlanningGeneration`** even under **`require`**. Same id + different payload → **`idempotency-key-conflict`** (unchanged).

**Human / IDE:** The Cursor extension caches **`planningGeneration`** and **`planningGenerationPolicy`** from each **`dashboard-summary`** refresh; dashboard mutations (e.g. proposed-row **Accept** / **Decline**) and palette **Task** actions merge **`expectedPlanningGeneration`** when policy is **`require`**. Refresh the dashboard after concurrent CLI writes if you see **`planning-generation-mismatch`**. The dashboard does **not** include a read-only **Approvals & policy** discoverability card (removed); use **`pnpm exec wk run list-approval-queue '{}'`** for the review-item queue (**`.ai/POLICY-APPROVAL.md`**).

ADR: **`docs/maintainers/adrs/ADR-planning-generation-optimistic-concurrency.md`**.

### Recovery: `planning-generation-required` and `invalid-run-args`

- **`planning-generation-required`** — Re-read **`planningGeneration`** from **`list-tasks`**, **`get-task`**, **`get-next-actions`**, or **`dashboard-summary`**, then resend the mutating JSON with **`expectedPlanningGeneration`**. Failure JSON may include **`remediation.docPath`** → **`ADR-planning-generation-optimistic-concurrency.md`** and **`remediation.instructionPath`** for the command you invoked.
- **`invalid-run-args`** (strict schema commands) — Fix the JSON shape against the bundled schema: **`workspace-kit run <command> --schema-only`**. Commands without strict validation still return a permissive schema-only fallback with instruction and policy metadata. See **`docs/maintainers/adrs/ADR-runtime-run-args-validation-pilot.md`**.
- **`policy-denied`** — Use JSON **`policyApproval`** on the **`run`** argv object (not env **`WORKSPACE_KIT_POLICY_APPROVAL`**). Check **`remediation.docPath`** → **`POLICY-APPROVAL.md`** when present.
- **`unknown-command`** — Router failures print structured JSON with **`remediation`**; run **`workspace-kit run`** (no subcommand) or **`doctor --agent-instruction-surface`** for the catalog.

## Tier B — Policy-sensitive `workspace-kit run` (non-transition)

| Intent | Invocation | `operationId` | Notes |
| --- | --- | --- | --- |
| Batch doc generation | `workspace-kit run document-project '<json>'` | `doc.document-project` | Sensitive unless `options.dryRun === true` |
| Single doc generation | `workspace-kit run generate-document '<json>'` | `doc.generate-document` | Sensitive unless `options.dryRun === true` |
| Improvement recommendations | `workspace-kit run generate-recommendations '<json>'` | `improvement.generate-recommendations` | Always sensitive |
| Transcript ingest + recommendations | `workspace-kit run ingest-transcripts '<json>'` | `improvement.ingest-transcripts` | Always sensitive |
| Approval queue decision | `workspace-kit run review-item '<json>'` | `approvals.review-item` | Always sensitive; Tier C **`list-approval-queue`** lists **`ready`** / **`in_progress`** improvements first |
| Backfill task↔feature junction | `workspace-kit run backfill-task-feature-links '<json>'` | `task-engine.backfill-task-feature-links` | Copies legacy **`features_json`** into **`task_engine_task_features`** |
| Export taxonomy JSON from registry | `workspace-kit run export-feature-taxonomy-json '<json>'` | `task-engine.export-feature-taxonomy-json` | Writes **`src/modules/documentation/data/feature-taxonomy.json`** |
| Apply skill pack (non-preview) | `workspace-kit run apply-skill '<json>'` | `skills.apply-skill` | Sensitive unless `options.dryRun === true` (default preview is dry-run; see instruction file) |
| Config-declared extra commands | `workspace-kit run <name> '<json>'` | `policy.dynamic-sensitive` if listed in `policy.extraSensitiveModuleCommands` | Must still pass **`policyApproval`** |

**Copy-paste — document batch (real writes):**

```bash
workspace-kit run document-project '{"options":{"overwriteHuman":true},"policyApproval":{"confirmed":true,"rationale":"regenerate maintainer docs after template change"}}'
```

**Copy-paste — single doc with dry run (not sensitive):**

```bash
workspace-kit run generate-document '{"documentType":"ROADMAP.md","options":{"dryRun":true}}'
```

**Copy-paste — single doc real write (`operationId` `doc.generate-document`, Tier B):** pass JSON **`policyApproval`** on the **`run`** argv. **`WORKSPACE_KIT_POLICY_APPROVAL` does not apply** to `run`.

```bash
workspace-kit run generate-document '{"documentType":"ROADMAP.md","options":{"overwriteHuman":true},"policyApproval":{"confirmed":true,"rationale":"regenerate ROADMAP after data change"}}'
```

**Copy-paste — recommendations:**

```bash
workspace-kit run generate-recommendations '{"policyApproval":{"confirmed":true,"rationale":"weekly improvement pass"}}'
```

**Copy-paste — improvement scout rehearsal (read-only; optional rotation memory):**

```bash
workspace-kit run scout-report '{}'
workspace-kit run scout-report '{"seed":"session-1","persistRotation":true}'
```

**Copy-paste — review approval item:**

```bash
workspace-kit run review-item '{"taskId":"imp-example","decision":"accept","actor":"agent@example","policyApproval":{"confirmed":true,"rationale":"accept after review"}}'
```

**Copy-paste — list improvement tasks awaiting `review-item` (read-only Tier C; includes policy artifact paths in JSON):**

```bash
workspace-kit run list-approval-queue '{}'
```

**Copy-paste — backfill junction from legacy `features_json` (`operationId` `task-engine.backfill-task-feature-links`, Tier B; listed in `planning-generation-cli-prelude` — pass `expectedPlanningGeneration` when policy `require`):**

```bash
# This repo: policy `require` — even dry-run needs policyApproval + expectedPlanningGeneration from a prior read:
workspace-kit run list-tasks '{}'
workspace-kit run backfill-task-feature-links '{"dryRun":true,"policyApproval":{"confirmed":true,"rationale":"dry-run backfill"},"expectedPlanningGeneration":123}'
# Replace the integer with data.planningGeneration from that read. Live run: dryRun false + same fields.
workspace-kit run backfill-task-feature-links '{"dryRun":false,"policyApproval":{"confirmed":true,"rationale":"backfill task feature links"},"expectedPlanningGeneration":123}'
```

**Copy-paste — export taxonomy JSON from SQLite registry:**

```bash
workspace-kit run export-feature-taxonomy-json '{"dryRun":true}'
workspace-kit run export-feature-taxonomy-json '{"policyApproval":{"confirmed":true,"rationale":"export taxonomy for commit"}}'
```

**Copy-paste — apply skill (Claude-shaped `SKILL.md` preview, default dry-run):**

```bash
workspace-kit run apply-skill '{"skillId":"sample-wc-skill"}'
```

**Copy-paste — apply skill with audit append (non-preview, mutating):**

```bash
workspace-kit run apply-skill '{"skillId":"sample-wc-skill","options":{"dryRun":false,"recordAudit":true},"policyApproval":{"confirmed":true,"rationale":"record skill apply audit"}}'
```

## CLI mutations (`init` / `upgrade` / `config`) — env approval, not JSON `policyApproval`

These are **`workspace-kit` top-level commands**, not `run` subcommands. They require **`WORKSPACE_KIT_POLICY_APPROVAL`** (JSON in the env var), not the **`policyApproval`** field used for `workspace-kit run`.

| Intent | Example |
| --- | --- |
| Regenerate profile artifacts | `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"refresh profile context"}' workspace-kit refresh-context` |
| Upgrade kit-owned paths | `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"upgrade"}' workspace-kit upgrade` |
| Mutate config keys | `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"set cadence"}' workspace-kit config set improvement.cadence.minIntervalMinutes 20 --json` |

## Queue health and ready-queue consistency (Tier C)

Use **`queue-health`** when you need a **single JSON answer** to “are ready tasks aligned with the current phase, and are any **`ready`** rows still blocked by incomplete dependencies?” — without ad-hoc `jq` over the full task list.

**Canonical phase resolution (precedence)** when **`kit_workspace_status`** is available (**SQLite `user_version` ≥ 10** and dual-store readers supply a snapshot):

1. Leading digits from **`kit_workspace_status.current_kit_phase`** (via **`dashboard-summary` / `queue-health` / `agent-bootstrap`** — not maintainer YAML).
2. Otherwise **`kit.currentPhaseNumber`** in effective workspace config when set to a **positive integer** (bootstrap / operator UX only).

**`workspace-kit doctor`** does **not** fail on config vs DB phase mismatch; it may print a **note** after a successful pass. Use **`phase-status`** to inspect canonical phase and drift, then **`set-current-phase`** for the SQLite-first mutation that also aligns config hints and the non-authoritative export.

**Copy-paste — read workspace status (SQLite):**

```bash
pnpm exec wk run get-workspace-status '{}'
```

**Copy-paste — read canonical phase and drift:**

```bash
pnpm exec wk run phase-status '{}'
pnpm exec wk run phase-status '{"includeTaskCounts":true,"includeDriftDetails":true}'
```

**Copy-paste — set current phase (SQLite first, config hint + export after):**

```bash
pnpm exec wk run get-workspace-status '{}'
pnpm exec wk run set-current-phase '{"currentKitPhase":"72","nextKitPhase":"73","expectedWorkspaceRevision":1,"clientMutationId":"phase-72-rollover"}'
pnpm exec wk run set-current-phase '{"currentKitPhase":"72","nextKitPhase":"73","dryRun":true}'
```

## Phase kickoff readiness (Tier C)

Read-only aggregate audit **before** phase rollover or delivery start. Composes planning staleness, git integration branch, task scope paths, validation recommendations, and doctor contract slices. **`passed`** is `false` only when a finding has **`severity: "block"`** (for example missing integration branch when `mode` is **`enforce`**). No `policyApproval`; no task-store or workspace-status mutations.

Runbook: [`.ai/runbooks/phase-kickoff-readiness.md`](./runbooks/phase-kickoff-readiness.md) (finding codes + remediation loops). Instruction: `src/modules/task-engine/instructions/phase-kickoff-readiness.md`.

**Copy-paste — kickoff audit (default workspace phase):**

```bash
pnpm exec wk run phase-kickoff-readiness '{}'
```

**Copy-paste — kickoff audit (explicit phase + integration branch):**

```bash
pnpm exec wk run phase-kickoff-readiness '{"phaseKey":"137","baseRef":"origin/main","integrationRef":"origin/release/phase-137","staleTaskDays":14,"checkScopePaths":true,"includeValidationPlans":true,"mode":"advisory"}'
```

**Copy-paste — dry-run rollover after kickoff:**

```bash
pnpm exec wk run phase-kickoff-readiness '{"phaseKey":"137"}'
pnpm exec wk run set-current-phase '{"currentKitPhase":"137","dryRun":true}'
```

When **`tasks.phaseKickoff.enforcementMode`** is **`enforce`**, live **`set-current-phase`** returns **`phase-kickoff-blocked`** (no SQLite mutation) if kickoff has block-severity findings — remediate per the runbook, then retry.

**Copy-paste — full audit:**

```bash
workspace-kit run queue-health '{}'
```

**Copy-paste — phase delivery evidence audit (read-only):**

```bash
workspace-kit run phase-delivery-preflight '{}'
workspace-kit run phase-delivery-preflight '{"phaseKey":"74","includeInProgress":true}'
```

**Copy-paste — bounded phase answer for agents (read-only):**

```bash
workspace-kit run phase-focus-dashboard '{}'
workspace-kit run phase-focus-dashboard '{"phaseKey":"100"}'
```

**Copy-paste — release evidence manifest (read-only):**

```bash
workspace-kit run release-evidence-manifest '{"phaseKey":"74","approval":{"actor":"maintainer@example.com","timestamp":"2026-04-28T07:00:00.000Z","rationale":"approved after reviewing scope and gates","scope":"phase-74 publish"},"releaseNotes":{"source":"release-notes-json","entries":["Phase 74 release evidence hardening"]},"followUpScan":{"scannedAt":"2026-04-28T07:00:00.000Z","rationale":"No unresolved follow-up tasks after transcript/friction scan"},"followUpTasks":[]}'
```

**Copy-paste — same phase/dependency hints on a filtered `list-tasks` result** (default `list-tasks` shape unchanged when omitted):

```bash
workspace-kit run list-tasks '{"includeQueueHints":true,"status":"ready"}'
```

**Copy-paste — filter by stable `phaseKey`** (uses `task.phaseKey` or infers from `task.phase` text when possible):

```bash
workspace-kit run list-tasks '{"phaseKey":"28","status":"ready"}'
```

**Copy-paste — filter by feature taxonomy slug(s)** (OR match: task is included if it lists **any** of the given slugs on **`features`**):

```bash
workspace-kit run list-tasks '{"features":["doc-generation","task-schema"]}'
```

**Copy-paste — filter by single feature slug or by component id** (relational registry, `user_version` 5+):

```bash
workspace-kit run list-tasks '{"featureId":"doc-generation"}'
workspace-kit run list-tasks '{"componentId":"task-engine-queue"}'
```

**Copy-paste — inspect feature registry (read-only):**

```bash
workspace-kit run list-components '{}'
workspace-kit run list-features '{}'
workspace-kit run list-features '{"componentId":"task-engine-queue"}'
```

**Task id spaces** (execution vs **`type: "improvement"`** — all use **`T###`** today; legacy **`imp-*`** may remain in older stores): use **`create-idea`** / **`list-ideas`** for ideation and **`.ai/playbooks/planner-chat.md`** when materializing PlanArtifact work.

**Ideas operator ladder:** capture with **`create-idea`**, refine in Dashboard **Ideas**, then **`planner-chat`** / **`finalize-plan-to-phase`** when ready for phased execution tasks. Execution queue reads (**`get-next-actions`**, **`list-tasks`**) stay **`tasks-only`** — Ideas rows are separate from the ready queue until materialized.

Instruction: `src/modules/task-engine/instructions/queue-health.md`. Related runbook: [`runbooks/agent-task-engine-ergonomics.md`](./runbooks/agent-task-engine-ergonomics.md).

## CAE read-only CLI (contract v1 — Tier C; handlers `T861` / `T862`)

Normative contract + JSON Schema: **`.ai/cae/cli-read-only.md`**, **`schemas/cae/cli-read-only-requests.v1.json`**, **`schemas/cae/cli-read-only-data.v1.json`**. **`policyOperationId`** pattern: **`context-activation.cae-<name>`** (e.g. **`context-activation.cae-evaluate`**).

Until **`T861` / `T862`** register these names in **`src/contracts/builtin-run-command-manifest.json`**, **`workspace-kit run` (no args)** will not list them — the shapes below are still the **copy-paste contract** for implementers and agents once shipped. **No `policyApproval`.** Prefer **`pnpm exec wk run`** for clean JSON stdout.

**Registry inspection (`T861`):**

```bash
pnpm exec wk run cae-registry-validate '{"schemaVersion":1}'
pnpm exec wk run cae-validate-registry '{"schemaVersion":1}'
pnpm exec wk run cae-list-artifacts '{"schemaVersion":1,"limit":50}'
pnpm exec wk run cae-get-artifact '{"schemaVersion":1,"artifactId":"cae.playbook.machine-playbooks"}'
pnpm exec wk run cae-list-activations '{"schemaVersion":1,"family":"policy","limit":25}'
pnpm exec wk run cae-get-activation '{"schemaVersion":1,"activationId":"cae.activation.policy.phase70-playbook"}'
```

**Evaluation / explain / health / conflicts / trace (`T862`):**

```bash
pnpm exec wk run cae-evaluate '{"schemaVersion":1,"evaluationContext":{"schemaVersion":1,"task":{"taskId":"T847","status":"in_progress","phaseKey":"70"},"command":{"name":"cae-evaluate"},"workspace":{"currentKitPhase":"70"},"governance":{"policyApprovalRequired":false,"approvalTierHint":"C"},"queue":{"readyQueueDepth":0},"mapSignals":null},"evalMode":"live"}'
pnpm exec wk run cae-explain '{"schemaVersion":1,"traceId":"cae.trace.example.minimal","level":"summary"}'
pnpm exec wk run cae-explain '{"schemaVersion":1,"evaluationContext":{"schemaVersion":1,"task":{"taskId":"T847","status":"in_progress","phaseKey":"70"},"command":{"name":"cae-explain"},"workspace":{"currentKitPhase":"70"},"governance":{"policyApprovalRequired":false,"approvalTierHint":"C"},"queue":{"readyQueueDepth":0},"mapSignals":null},"level":"verbose"}'
pnpm exec wk run cae-health '{"schemaVersion":1,"includeDetails":true}'
pnpm exec wk run cae-dashboard-summary '{"schemaVersion":1}'
pnpm exec wk run cae-recent-traces '{"schemaVersion":1,"limit":10}'
pnpm exec wk run cae-guidance-preview '{"schemaVersion":1,"taskId":"T921","commandName":"get-next-actions","evalMode":"shadow"}'
pnpm exec wk run cae-conflicts '{"schemaVersion":1,"evaluationContext":{"schemaVersion":1,"task":{"taskId":"T847","status":"ready","phaseKey":"70"},"command":{"name":"cae-conflicts"},"workspace":{"currentKitPhase":"70"},"governance":{"policyApprovalRequired":false,"approvalTierHint":"C"},"queue":{"readyQueueDepth":3},"mapSignals":null},"evalMode":"shadow"}'
pnpm exec wk run cae-get-trace '{"schemaVersion":1,"traceId":"cae.trace.example.minimal"}'
pnpm exec wk run cae-list-acks '{"schemaVersion":1,"activationId":"cae.activation.policy.phase70-playbook"}'
pnpm exec wk run cae-shadow-feedback-report '{"schemaVersion":1,"activationId":"cae.activation.policy.phase70-playbook"}'
```

**Governed CAE mutation (Tier A — JSON `policyApproval`; requires `kit.cae.persistence`):**

```bash
pnpm exec wk run cae-satisfy-ack '{"schemaVersion":1,"traceId":"<traceId>","ackToken":"<token>","activationId":"cae.activation.policy.phase70-playbook","actor":"operator@example","policyApproval":{"confirmed":true,"rationale":"record CAE ack satisfaction"}}'
pnpm exec wk run cae-import-json-registry '{"schemaVersion":1,"policyApproval":{"confirmed":true,"rationale":"seed sqlite registry from default JSON paths"}}'
pnpm exec wk run cae-record-shadow-feedback '{"schemaVersion":1,"traceId":"<traceId>","activationId":"cae.activation.policy.phase70-playbook","commandName":"get-next-actions","signal":"useful","actor":"operator@example","policyApproval":{"confirmed":true,"rationale":"record CAE shadow feedback"}}'
```

**CAE SQLite registry admin (Phase 70 — Tier C manifest + in-handler gate; JSON `caeMutationApproval`, not `policyApproval`):**

Requires **`kit.cae.enabled`**, **`kit.cae.registryStore: "sqlite"`**, **`kit.cae.adminMutations: true`**, plus **`caeMutationApproval`** + **`actor`** on mutators. Canon: **`.ai/cae/registry-mutation-governance.md`**.

```bash
pnpm exec wk run cae-list-registry-versions '{"schemaVersion":1}'
pnpm exec wk run cae-create-registry-version '{"schemaVersion":1,"actor":"operator","versionId":"cae.reg.admin.example","note":"demo","caeMutationApproval":{"confirmed":true,"rationale":"empty version"},"config":{"kit":{"cae":{"enabled":true,"adminMutations":true,"registryStore":"sqlite"}}}}'
```

When these rows land in the manifest, add matching lines to **`docs/maintainers/AGENT-CLI-MAP.md`** (or an **`agent-cli-map-exclusions.json`** entry with rationale) so **`pnpm run check`** stays green — see **`.ai/cae/cli-read-only.md` § Agent CLI map coverage**.

## Tier C — Safe discovery / read-only examples

Non-sensitive commands (no `policyApproval` unless you added `extraSensitiveModuleCommands`):

```bash
workspace-kit run list-tasks '{}'
workspace-kit run get-next-actions '{}'
workspace-kit run list-approval-queue '{}'
workspace-kit run agent-mutation-plan '{"commandName":"run-transition","taskId":"T285","action":"start"}'
workspace-kit run queue-health '{}'
workspace-kit run task-persistence-readiness '{}'
workspace-kit run classify-kit-state '{}'
workspace-kit run get-task '{"taskId":"T285"}'
workspace-kit run list-tasks '{"type":"improvement","phase":"Phase 16 - Maintenance and stability"}'
workspace-kit run list-tasks '{"category":"reliability","tags":["ui"],"metadataFilters":{"owner.team":"platform"}}'
workspace-kit run list-tasks '{"type":"improvement","confidenceTier":"medium"}'
workspace-kit run list-tasks '{"status":"blocked","blockedReasonCategory":"external_dependency"}'
workspace-kit run list-tasks '{"features":["doc-generation"]}'
workspace-kit run list-components '{}'
workspace-kit run list-features '{}'
workspace-kit run create-task '{"id":"T900","title":"retry-safe mutation","status":"ready","features":["ci-guards"],"clientMutationId":"agent-run-20260327-1"}'
workspace-kit run update-task '{"taskId":"T900","updates":{"title":"retry-safe mutation v2","features":["ci-guards","release-versioning"]},"clientMutationId":"agent-run-20260327-2"}'
workspace-kit run assign-task-phase '{"taskId":"T900","phaseKey":"43","phase":"Phase 43 (example)","clientMutationId":"agent-run-phase-1"}'
workspace-kit run clear-task-phase '{"taskId":"T900","clientMutationId":"agent-run-phase-2"}'
workspace-kit run set-current-phase '{"currentKitPhase":"43","nextKitPhase":"44","dryRun":true}'
workspace-kit run explain-task-engine-model '{}'
workspace-kit run list-planning-types '{}'
workspace-kit run explain-planning-rules '{"planningType":"new-feature"}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript"}}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators","problemStatement":"...","expectedOutcome":"...","impact":"...","constraints":"...","successSignals":"..."},"finalize":true,"outputMode":"tasks"}'
# Multi-task execution drafts: finalize + outputMode tasks + executionTaskDrafts[] → code planning-multi-task-decomposition-preview; then persist with expectedPlanningGeneration when policy requires:
workspace-kit run build-plan '{"planningType":"new-feature","outputMode":"tasks","finalize":true,"answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators"},"executionTaskDrafts":[{"title":"...","phase":"Phase 68","approach":"...","technicalScope":["..."],"acceptanceCriteria":["..."]}]}'
workspace-kit run persist-planning-execution-drafts '{"tasks":[...],"expectedPlanningGeneration":<n>,"planRef":"planning:new-feature:...","planningType":"new-feature","clientMutationId":"agent-bulk-1"}'
workspace-kit run review-planning-execution-drafts '{"targetPhaseKey":"73","targetPhase":"Phase 73","desiredStatus":"ready","tasks":[...]}'
workspace-kit run persist-planning-execution-drafts '{"targetPhaseKey":"73","targetPhase":"Phase 73","desiredStatus":"ready","tasks":[...],"expectedPlanningGeneration":<n>,"planRef":"planning:new-feature:phase-73","clientMutationId":"phase-73-task-open"}'
# PlanArtifact lifecycle (contracts in PLANNER_COMMANDS.md; runbook .ai/runbooks/plan-artifact-workflow.md):
workspace-kit run draft-plan-artifact '{"persist":false,"artifact":{...}}'
workspace-kit run draft-plan-artifact '{"persist":true,"artifact":{...},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"persist plan draft"}}'
workspace-kit run review-plan-artifact '{"planId":"<uuid>","profile":"full-feature"}'
workspace-kit run accept-plan-artifact '{"planId":"<uuid>","approvalRecord":{"schemaVersion":1,"confirmed":true,"approvedVersion":1,"approvedAt":"2026-05-27T00:00:00.000Z","approvedBy":"operator@example.com","planRef":"plan-artifact:<uuid>"},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"operator accepted plan"}}'
# Tier C preview: validates accepted plan, phase proposal, WBS normalization, and task-batch review without writes.
workspace-kit run finalize-plan-to-phase '{"planId":"<uuid>","dryRun":true}'
# Tier B persist: delegates task creation to persist-planning-execution-drafts, then versions the PlanArtifact as finalized.
workspace-kit run finalize-plan-to-phase '{"planId":"<uuid>","dryRun":false,"targetPhaseKey":"110","targetPhase":"Phase 110","desiredStatus":"ready","expectedPlanningGeneration":<n>,"clientMutationId":"finalize-<uuid>-phase-110","policyApproval":{"confirmed":true,"rationale":"materialize accepted plan WBS"}}'
workspace-kit run explain-config '{}'
workspace-kit run resolve-config '{}'
workspace-kit run resolve-agent-guidance '{}'
workspace-kit run set-agent-guidance '{"tier":3}'
workspace-kit run resolve-behavior-profile '{}'
workspace-kit run list-behavior-profiles '{}'
workspace-kit run get-behavior-profile '{"profileId":"builtin:balanced"}'
workspace-kit run set-active-behavior-profile '{"profileId":"builtin:cautious"}'
workspace-kit run set-active-behavior-profile '{"clear":true}'
workspace-kit run create-behavior-profile '{"id":"custom:my-team","baseProfileId":"builtin:balanced","label":"My team"}'
workspace-kit run update-behavior-profile '{"profileId":"custom:my-team","updates":{"summary":"…"}}'
workspace-kit run delete-behavior-profile '{"profileId":"custom:my-team"}'
workspace-kit run diff-behavior-profiles '{"profileIdA":"builtin:cautious","profileIdB":"builtin:experimental"}'
workspace-kit run explain-behavior-profiles '{"mode":"summarize","profileId":"builtin:calculated"}'
workspace-kit run explain-behavior-profiles '{"mode":"compare","profileIds":["builtin:cautious","builtin:experimental"]}'
workspace-kit run interview-behavior-profile '{"action":"start"}'
workspace-kit run sync-effective-behavior-cursor-rule '{}'
workspace-kit run sync-effective-behavior-cursor-rule '{"dryRun":true}'
workspace-kit doctor
```

### Task intake — opening execution work as `ready`

When **`tasks.intakePolicy.enforcementMode`** is **`enforce`**, **`create-task`** with **`status: "ready"`** and **`type: "workspace-kit"`** must satisfy the context profile **`workspace-kit-create-ready`** (non-empty **`summary`**, **`technicalScope`**, **`acceptanceCriteria`** with substantive list items). **`status: "proposed"`** stays a thin-draft path. Failures surface as **`task-intake-blocked`**.

Preflight (Tier C): **`pnpm exec wk run resolve-task-intake-policy`** with **`"action":"create-ready"`**, **`"targetStatus":"ready"`**, **`"fields":{"type":"workspace-kit","title":"…","status":"ready",…}`**. Prefer **`allocateId: true`** for new ids; include **`expectedPlanningGeneration`** when **`tasks.planningGenerationPolicy`** is **`require`** (see **`get-next-actions`** / **`list-tasks`**).

**Agent behavior** (`list-behavior-profiles`, `get-behavior-profile`, `resolve-behavior-profile`, `set-active-behavior-profile`, `create-behavior-profile`, `update-behavior-profile`, `delete-behavior-profile`, `diff-behavior-profiles`, `explain-behavior-profiles`, `interview-behavior-profile`, `sync-effective-behavior-cursor-rule`) are **Tier C**: advisory interaction posture only; **subordinate** to PRINCIPLES and policy. They persist under `.workspace-kit/agent-behavior/` (JSON) or unified SQLite (`module_id` `agent-behavior`) when `tasks.persistenceBackend` is `sqlite`. **`sync-effective-behavior-cursor-rule`** writes a generated **`.cursor/rules/*.mdc`** summary (also auto-scheduled after common profile / guidance mutators; fail-open).

**`persist-planning-execution-drafts`**, and **`migrate-task-persistence`** are Tier C by default (same as `create-task`): they persist workspace state (legacy task JSON import and/or the configured SQLite planning DB under `tasks.sqliteDatabaseRelativePath`) but do not use `policyApproval` unless listed in `policy.extraSensitiveModuleCommands`. **`update-workspace-phase-snapshot`** is Tier C compatibility: it updates SQLite/export first and then writes the legacy **`docs/maintainers/data/workspace-kit-status.yaml`** surface (see **`.ai/agent-source-of-truth-order.md`** and task-engine instructions for phase snapshot).

Instruction paths: run `workspace-kit run` with no subcommand to list commands; each line lists `(moduleId)` and points to the module’s instruction file pattern above.

## Agent discovery path (minimal)

1. `workspace-kit doctor` — canonical JSON contract files present.
2. `workspace-kit run` (no arguments) — router-registered commands with descriptions (see `doctor --agent-instruction-surface` for the full declared catalog including non-executable rows).
3. This file + `src/modules/<module>/instructions/<command>.md` — copy-paste JSON shape.
4. `.ai/POLICY-APPROVAL.md` — JSON vs env vs interactive approval.
5. Task Engine run schemas: `schemas/task-engine-run-contracts.schema.json` (versioned with package; command coverage verified by `pnpm run check`).
6. Agent behavior plan: `docs/maintainers/plans/agent-behavior-module.md` + profile schema `schemas/agent-behavior-profile.schema.json`.
7. Planning module runbook: `.ai/runbooks/planning-workflow.md` (build-plan / Ideas); PlanArtifact: `.ai/runbooks/plan-artifact-workflow.md`.
8. Agent task-engine ergonomics: `.ai/runbooks/agent-task-engine-ergonomics.md` (includes **§0** natural-language → command exemplar table).
9. CAE read-only CLI contract (when enabled): `.ai/cae/cli-read-only.md` + `schemas/cae/cli-read-only-*.v1.json`.

## Isolated proposal mode (Tier B)

Branch/worktree-isolated delivery for one or more tasks without taking over the visible checkout lease. Proposals live under `$GIT_COMMON_DIR/workflow-cannon/proposals/` with metadata, diff artifacts, validation evidence, and optional PR open. Integrates with **`claim-workspace-edit-lease`** / **`workspace-edit-status`** — apply and PR flows respect lease guards from T100192.

ADR: [`.ai/adrs/ADR-workflow-cannon-state-backend-v1.md`](./adrs/ADR-workflow-cannon-state-backend-v1.md). Instructions: `src/modules/task-engine/instructions/<command>.md`.

**Copy-paste — create and inspect:**

```bash
pnpm exec wk run create-isolated-proposal '{"taskId":"T100193","baseBranch":"release/phase-137"}'
pnpm exec wk run list-isolated-proposals '{}'
pnpm exec wk run view-isolated-proposal-diff '{"proposalId":"<id>"}'
```

**Copy-paste — apply, validate, ship:**

```bash
pnpm exec wk run apply-isolated-proposal '{"proposalId":"<id>","dryRun":true}'
pnpm exec wk run record-isolated-proposal-validation '{"proposalId":"<id>","command":"pnpm run check","exitCode":0}'
pnpm exec wk run open-isolated-proposal-pr '{"proposalId":"<id>","baseBranch":"release/phase-137"}'
```

**Copy-paste — discard / recover:**

```bash
pnpm exec wk run discard-isolated-proposal '{"proposalId":"<id>"}'
pnpm exec wk run recover-isolated-proposal '{"proposalId":"<id>"}'
```

**Copy-paste — deterministic task-state export (snapshot + event JSONL):**

```bash
pnpm exec wk run export-task-state-artifacts '{"includeEvents":true}'
```

## Optional session opener (habit hook)

Use this Tier C starter block at session start to avoid stale queue assumptions:

```bash
workspace-kit run get-next-actions '{}'
# If you are implementing the queue head, suggestedNext is already a full task record — re-fetch with get-task only after other mutations or when you need a specific id:
workspace-kit run get-task '{"taskId":"<id-from-suggestedNext>"}'
```

`get-next-actions` returns **`suggestedNext`** as a complete task object (same fields you get from **`get-task`** for that id). Use **`get-task`** when the queue head is not your target, after writes that may reorder the queue, or when you need to re-load after a transition. For implementation, still read **`Approach`**, **`Technical scope`**, and **`Acceptance criteria`** on the record you intend to ship.

Maintainer-oriented narrative for Git vs task state, planning vs queue, and extension vs CLI: [`runbooks/agent-task-engine-ergonomics.md`](./runbooks/agent-task-engine-ergonomics.md).

## Optional guardrail: hand-edit detection

Maintainers can run an **advisory** check that warns when `state.json` changes look like direct task edits without new `transitionLog` entries:

```bash
pnpm run advisory:task-state-hand-edit
```

In CI this runs as a **non-blocking** step (see `.github/workflows/ci.yml`). It always exits 0; read stderr for warnings. Legitimate recovery edits should be rare and documented in the PR.

## CLI map coverage guardrail

`pnpm run check` includes a strict command-coverage check (`scripts/check-agent-cli-map-coverage.mjs`) that compares discovered `workspace-kit run` commands from module registrations against:

- commands explicitly shown in this map (`workspace-kit run <command> ...`)
- documented exclusions in `docs/maintainers/data/agent-cli-map-exclusions.json`

If a new run command ships without map coverage (or exclusion entry), the check fails with the missing command names.
