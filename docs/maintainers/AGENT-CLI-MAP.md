# Agent CLI map

Single maintainer reference for **what agents must run in a terminal** when working in this repository. Intent → command → approval surface → evidence.

**Prefer diagrams first?** [`CLI-VISUAL-GUIDE.md`](./CLI-VISUAL-GUIDE.md) — ASCII topology, Mermaid decision flow, approval lanes, default module router.

**Related:** `docs/maintainers/POLICY-APPROVAL.md` (approval semantics), `docs/maintainers/TERMS.md` (terminology), module instructions under `src/modules/*/instructions/*.md` (exact JSON fields per command).

**Cursor extension (monorepo):** TypeScript shapes for **`dashboard-summary`** success payloads are shared from **`@workflow-cannon/workspace-kit/contracts/dashboard-summary-run`** (see `extensions/cursor-workflow-cannon/README.md`).

## 30-second bootstrap (run this first)

If a session might touch `.workspace-kit/` state, lifecycle transitions, policy traces, approvals, or generated maintainer docs, run this first:

1. `workspace-kit doctor` — confirms canonical task/policy contract files are present.
2. `workspace-kit run` (no subcommand) — lists **router-registered** commands (executable for the current enabled module set).
3. Use this map + `src/modules/<module>/instructions/<command>.md` for JSON payload shape.

Optional machine-readable catalog (same validation as `doctor`, then JSON on stdout):

```bash
workspace-kit doctor --agent-instruction-surface
```

Payload shape: `{ ok, code: "agent-instruction-surface", data: { schemaVersion, commands[], activationReport } }`. Rows include `executable` and `degradation` when a declared instruction is documentation-only because the owning module or a `requiresPeers` module is disabled. **Documentation-only** does **not** waive `policyApproval` for mutating `workspace-kit run` operations — see `docs/maintainers/POLICY-APPROVAL.md`.

When the workspace root is not a kit source checkout, instruction paths still resolve from the process working directory (same rule as `resolveRegistryAndConfig`); run from the repo root in CI and local dev so paths match this tree.

## Quick boundary gate (use this before acting)

- If work mutates task lifecycle, approvals, policy traces, transcript/improvement stores, or maintainer doc generation outputs, use the matching `workspace-kit` command from this map.
- If work is application/source edits only, use normal code workflow; optional Tier C reads (`list-tasks`, `get-next-actions`) are safe discovery helpers.
- For `workspace-kit run` sensitive operations, pass JSON `policyApproval`; for top-level `workspace-kit config|init|upgrade`, use env `WORKSPACE_KIT_POLICY_APPROVAL`.

## Maintainer playbook: one task to `main`

When delivering **one** **`T###`** via GitHub PR to **`main`**, use the ordered playbook **`docs/maintainers/playbooks/task-to-main.md`** (id `task-to-main`): branch from updated **`main`**, implement, open PR, review (and iterate with PR comments until checks pass), merge, then **`run-transition`** with **`complete`** and evidence. Pairs with **`.cursor/rules/maintainer-delivery-loop.mdc`**; optional requestable **`.cursor/rules/playbook-task-to-main.mdc`**. Human summary: **`docs/maintainers/AGENTS.md`** → **Task execution**.

## Maintainer playbook: improvement discovery

When **researching** friction to log as **`improvement`** tasks or via **`generate-recommendations`** / transcript ingest, use **`docs/maintainers/playbooks/improvement-task-discovery.md`** (id `improvement-task-discovery`). Optional requestable **`.cursor/rules/playbook-improvement-task-discovery.mdc`**. Human summary: **`docs/maintainers/AGENTS.md`** → **Improvement discovery**.

## Maintainer playbook: improvement triage (top 3 → ready)

When **promoting** up to three **`type: "improvement"`** tasks from **`proposed`** to **`ready`**, use **`docs/maintainers/playbooks/improvement-triage-top-three.md`** (id `improvement-triage-top-three`); Tier A **`run-transition`** with **`action":"accept"`** and **`policyApproval`**. Optional requestable **`.cursor/rules/playbook-improvement-triage-top-three.mdc`**. Human summary: **`docs/maintainers/AGENTS.md`** → **Improvement triage**.

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
3. Use **`clientMutationId`** on mutating commands (where supported) so retries are **idempotent** when you re-send the same logical operation after a timeout or ambiguous transport failure.
4. Distinguish **parse failures** (your script could not decode stdout as JSON — exit code may still be 0 if the process wrote non-JSON garbage) from **`ok: false`** in a successfully parsed payload (the kit returned a structured error). A parse error does **not** prove the kit skipped a mutation; check task-engine state before re-running destructive sequences.
5. Prefer **`set -euo pipefail`** (bash) and explicit capture: `out=$(pnpm exec wk run list-tasks '{}' 2>/dev/null)` then parse **`out`** — adjust stderr handling to your logging needs.

## Tier overview

| Tier | Meaning | Approval |
| --- | --- | --- |
| **A** | Task Engine lifecycle transitions (`run-transition`) | JSON **`policyApproval`** on `workspace-kit run` (or session grant — see policy doc) |
| **B** | Other policy-sensitive `workspace-kit run` subcommands | JSON **`policyApproval`** (or session grant); **`WORKSPACE_KIT_POLICY_APPROVAL` is not read** for the `run` path |
| **C** | Application/source edits only; read-only or non-sensitive `run` commands | No kit policy approval (normal code review applies) |

**Extra sensitivity:** `policy.extraSensitiveModuleCommands` in effective config adds **Tier B** entries dynamically; denials may show `operationId` **`policy.dynamic-sensitive`**.

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

### Planning generation (SQLite optimistic lock)

Config **`tasks.planningGenerationPolicy`**: **`off`** (consumer default; optional **`expectedPlanningGeneration`**), **`warn`** (omit allowed; watch **`planningGenerationPolicyWarnings`** on success JSON), **`require`** (**this repo** — mutating task-engine / wishlist / planning persist / **`generate-recommendations`** must pass **`expectedPlanningGeneration`** from **`planningGeneration`** on your **last read**).

**Strong-consistency lap (policy `require`):** (1) `workspace-kit run list-tasks '{}'` (or **`get-next-actions`**, **`get-task`**, **`dashboard-summary`**) → read **`data.planningGeneration`**. (2) Include **`"expectedPlanningGeneration": <int>`** on the mutating command. (3) On **`planning-generation-mismatch`**, re-read and retry.

**Idempotency:** **`clientMutationId`** replay responses (**`*-idempotent-replay`**) do not write the planning row again and **do not** require **`expectedPlanningGeneration`** even under **`require`**. Same id + different payload → **`idempotency-key-conflict`** (unchanged).

**Human / IDE:** Cursor extension dashboard shows **Planning generation** + policy; Tasks DnD and palette transitions pass **`expectedPlanningGeneration`** when the cached policy is **`require`** (refresh Tasks/Dashboard if you see mismatches).

ADR: **`docs/maintainers/ADR-planning-generation-optimistic-concurrency.md`**.

## Tier B — Policy-sensitive `workspace-kit run` (non-transition)

| Intent | Invocation | `operationId` | Notes |
| --- | --- | --- | --- |
| Batch doc generation | `workspace-kit run document-project '<json>'` | `doc.document-project` | Sensitive unless `options.dryRun === true` |
| Single doc generation | `workspace-kit run generate-document '<json>'` | `doc.generate-document` | Sensitive unless `options.dryRun === true` |
| Improvement recommendations | `workspace-kit run generate-recommendations '<json>'` | `improvement.generate-recommendations` | Always sensitive |
| Transcript ingest + recommendations | `workspace-kit run ingest-transcripts '<json>'` | `improvement.ingest-transcripts` | Always sensitive |
| Approval queue decision | `workspace-kit run review-item '<json>'` | `approvals.review-item` | Always sensitive |
| Config-declared extra commands | `workspace-kit run <name> '<json>'` | `policy.dynamic-sensitive` if listed in `policy.extraSensitiveModuleCommands` | Must still pass **`policyApproval`** |

**Copy-paste — document batch (real writes):**

```bash
workspace-kit run document-project '{"options":{"overwriteHuman":true},"policyApproval":{"confirmed":true,"rationale":"regenerate maintainer docs after template change"}}'
```

**Copy-paste — single doc with dry run (not sensitive):**

```bash
workspace-kit run generate-document '{"documentType":"ROADMAP.md","options":{"dryRun":true}}'
```

**Copy-paste — recommendations:**

```bash
workspace-kit run generate-recommendations '{"policyApproval":{"confirmed":true,"rationale":"weekly improvement pass"}}'
```

**Copy-paste — review approval item:**

```bash
workspace-kit run review-item '{"taskId":"imp-example","decision":"accept","actor":"agent@example","policyApproval":{"confirmed":true,"rationale":"accept after review"}}'
```

## CLI mutations (`init` / `upgrade` / `config`) — env approval, not JSON `policyApproval`

These are **`workspace-kit` top-level commands**, not `run` subcommands. They require **`WORKSPACE_KIT_POLICY_APPROVAL`** (JSON in the env var), not the **`policyApproval`** field used for `workspace-kit run`.

| Intent | Example |
| --- | --- |
| Regenerate profile artifacts | `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"init"}' workspace-kit init` |
| Upgrade kit-owned paths | `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"upgrade"}' workspace-kit upgrade` |
| Mutate config keys | `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"set cadence"}' workspace-kit config set improvement.cadence.minIntervalMinutes 20 --json` |

## Queue health and ready-queue consistency (Tier C)

Use **`queue-health`** when you need a **single JSON answer** to “are ready tasks aligned with the current phase, and are any **`ready`** rows still blocked by incomplete dependencies?” — without ad-hoc `jq` over the full task list.

**Canonical phase resolution (precedence):**

1. **`kit.currentPhaseNumber`** in effective workspace config (`.workspace-kit/config.json` / user layer) when set to a **positive integer**.
2. Otherwise, leading digits parsed from **`docs/maintainers/data/workspace-kit-status.yaml`** → **`current_kit_phase`** (for example `"28"` → **`28`**).

**`workspace-kit doctor`** fails when **both** config and YAML supply a phase number and they **disagree** (maintainer drift signal).

**Copy-paste — full audit:**

```bash
workspace-kit run queue-health '{}'
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

**Task id spaces** (when to mint **`T###`**, wishlist intake, vs **`imp-*`**): [`runbooks/wishlist-workflow.md`](./runbooks/wishlist-workflow.md).

Instruction: `src/modules/task-engine/instructions/queue-health.md`. Related runbook: [`runbooks/agent-task-engine-ergonomics.md`](./runbooks/agent-task-engine-ergonomics.md).

## Tier C — Safe discovery / read-only examples

Non-sensitive commands (no `policyApproval` unless you added `extraSensitiveModuleCommands`):

```bash
workspace-kit run list-tasks '{}'
workspace-kit run get-next-actions '{}'
workspace-kit run queue-health '{}'
workspace-kit run get-task '{"taskId":"T285"}'
workspace-kit run list-tasks '{"type":"improvement","phase":"Phase 16 - Maintenance and stability"}'
workspace-kit run list-tasks '{"category":"reliability","tags":["ui"],"metadataFilters":{"owner.team":"platform"}}'
workspace-kit run list-tasks '{"type":"improvement","confidenceTier":"medium"}'
workspace-kit run list-tasks '{"status":"blocked","blockedReasonCategory":"external_dependency"}'
workspace-kit run list-tasks '{"features":["doc-generation"]}'
workspace-kit run create-task '{"id":"T900","title":"retry-safe mutation","status":"ready","features":["ci-guards"],"clientMutationId":"agent-run-20260327-1"}'
workspace-kit run update-task '{"taskId":"T900","updates":{"title":"retry-safe mutation v2","features":["ci-guards","release-versioning"]},"clientMutationId":"agent-run-20260327-2"}'
workspace-kit run assign-task-phase '{"taskId":"T900","phaseKey":"43","phase":"Phase 43 (example)","clientMutationId":"agent-run-phase-1"}'
workspace-kit run clear-task-phase '{"taskId":"T900","clientMutationId":"agent-run-phase-2"}'
workspace-kit run update-workspace-phase-snapshot '{"currentKitPhase":"43","nextKitPhase":"44","dryRun":true}'
workspace-kit run explain-task-engine-model '{}'
workspace-kit run list-planning-types '{}'
workspace-kit run explain-planning-rules '{"planningType":"new-feature"}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript"}}'
workspace-kit run build-plan '{"planningType":"new-feature","answers":{"featureGoal":"...","placement":"CLI","technology":"TypeScript","targetAudience":"AI Agent Operators","problemStatement":"...","expectedOutcome":"...","impact":"...","constraints":"...","successSignals":"..."},"finalize":true,"createWishlist":true}'
workspace-kit run list-wishlist '{}'
workspace-kit run get-wishlist '{"wishlistId":"T42"}'
workspace-kit run migrate-wishlist-intake '{"dryRun":true}'
workspace-kit run explain-config '{}'
workspace-kit run resolve-config '{}'
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
workspace-kit doctor
```

**Agent behavior** (`list-behavior-profiles`, `get-behavior-profile`, `resolve-behavior-profile`, `set-active-behavior-profile`, `create-behavior-profile`, `update-behavior-profile`, `delete-behavior-profile`, `diff-behavior-profiles`, `explain-behavior-profiles`, `interview-behavior-profile`) are **Tier C**: advisory interaction posture only; **subordinate** to PRINCIPLES and policy. They persist under `.workspace-kit/agent-behavior/` (JSON) or unified SQLite (`module_id` `agent-behavior`) when `tasks.persistenceBackend` is `sqlite`.

**Wishlist mutations** (`create-wishlist`, `update-wishlist`, `convert-wishlist`), **`migrate-task-persistence`**, and **`migrate-wishlist-intake`** are Tier C by default (same as `create-task`): they persist workspace state (JSON files and/or the configured SQLite planning DB under `tasks.sqliteDatabaseRelativePath`) but do not use `policyApproval` unless listed in `policy.extraSensitiveModuleCommands`. **`update-workspace-phase-snapshot`** is Tier C and writes only the two phase scalar lines in **`docs/maintainers/data/workspace-kit-status.yaml`** (see **`AGENTS.md`** → workspace phase snapshot).

Instruction paths: run `workspace-kit run` with no subcommand to list commands; each line lists `(moduleId)` and points to the module’s instruction file pattern above.

## Agent discovery path (minimal)

1. `workspace-kit doctor` — canonical JSON contract files present.
2. `workspace-kit run` (no arguments) — router-registered commands with descriptions (see `doctor --agent-instruction-surface` for the full declared catalog including non-executable rows).
3. This file + `src/modules/<module>/instructions/<command>.md` — copy-paste JSON shape.
4. `docs/maintainers/POLICY-APPROVAL.md` — JSON vs env vs interactive approval.
5. Task Engine run schemas: `schemas/task-engine-run-contracts.schema.json` (versioned with package; command coverage verified by `pnpm run check`).
6. Agent behavior plan: `docs/maintainers/plans/agent-behavior-module.md` + profile schema `schemas/agent-behavior-profile.schema.json`.
7. Planning module runbook: `docs/maintainers/runbooks/planning-workflow.md`.
8. Agent task-engine ergonomics: `docs/maintainers/runbooks/agent-task-engine-ergonomics.md`.

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
