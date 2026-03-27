# Agent CLI map

Single maintainer reference for **what agents must run in a terminal** when working in this repository. Intent → command → approval surface → evidence.

**Related:** `docs/maintainers/POLICY-APPROVAL.md` (approval semantics), `docs/maintainers/TERMS.md` (terminology), module instructions under `src/modules/*/instructions/*.md` (exact JSON fields per command).

## `/qt` vs `workspace-kit`

The editor **`/qt`** command only loads prompt templates from `tasks/*.md`. It does **not** execute `workspace-kit`, write task-engine state, or satisfy policy. If a workflow step changes kit-owned files or policy-sensitive behavior, the agent must run the **`workspace-kit` line** from this map (or the linked instruction file)—not only describe it in chat.

## Contract: no hand-editing task lifecycle

**Do not** hand-edit `.workspace-kit/tasks/state.json` to move tasks between lifecycle states (`proposed` → `ready` → `in_progress` → `completed`, etc.). Use:

```bash
workspace-kit run run-transition '{"taskId":"T285","action":"start","policyApproval":{"confirmed":true,"rationale":"why this transition"}}'
```

Exception: **documented recovery** (e.g. repair after corruption) may require a maintainer to edit JSON under a tracked PR with evidence; that is out-of-contract for routine agent work.

## Tier overview

| Tier | Meaning | Approval |
| --- | --- | --- |
| **A** | Task Engine lifecycle transitions (`run-transition`) | JSON **`policyApproval`** on `workspace-kit run` (or session grant — see policy doc) |
| **B** | Other policy-sensitive `workspace-kit run` subcommands | JSON **`policyApproval`** (or session grant); **`WORKSPACE_KIT_POLICY_APPROVAL` is not read** for the `run` path |
| **C** | Application/source edits only; read-only or non-sensitive `run` commands | No kit policy approval (normal code review applies) |

**Extra sensitivity:** `policy.extraSensitiveModuleCommands` in effective config adds **Tier B** entries dynamically; denials may show `operationId` **`policy.dynamic-sensitive`**.

## Tier A — Task Engine transitions

| Intent | Invocation | `operationId` | Evidence |
| --- | --- | --- | --- |
| Transition task status | `workspace-kit run run-transition '<json>'` | `tasks.run-transition` | Transition record in command JSON output; task store update |

**Copy-paste (start work):**

```bash
workspace-kit run run-transition '{"taskId":"T285","action":"start","policyApproval":{"confirmed":true,"rationale":"begin implementation"}}'
```

**Session reuse (same shell / same `WORKSPACE_KIT_SESSION_ID`):**

```bash
export WORKSPACE_KIT_SESSION_ID=my-session
workspace-kit run run-transition '{"taskId":"T285","action":"complete","policyApproval":{"confirmed":true,"rationale":"criteria met","scope":"session"}}'
# later transitions for other Tier A/B ops with same operation grant rules...
```

See `src/modules/task-engine/instructions/run-transition.md` for allowed `action` values by state.

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

## Tier C — Safe discovery / read-only examples

Non-sensitive commands (no `policyApproval` unless you added `extraSensitiveModuleCommands`):

```bash
workspace-kit run list-tasks '{}'
workspace-kit run get-next-actions '{}'
workspace-kit run get-task '{"taskId":"T285"}'
workspace-kit run list-wishlist '{}'
workspace-kit run get-wishlist '{"wishlistId":"W1"}'
workspace-kit run resolve-config '{}'
workspace-kit doctor
```

**Wishlist mutations** (`create-wishlist`, `update-wishlist`, `convert-wishlist`) and **`migrate-task-persistence`** are Tier C by default (same as `create-task`): they persist workspace state (JSON files and/or the configured SQLite planning DB under `tasks.sqliteDatabaseRelativePath`) but do not use `policyApproval` unless listed in `policy.extraSensitiveModuleCommands`.

Instruction paths: run `workspace-kit run` with no subcommand to list commands; each line lists `(moduleId)` and points to the module’s instruction file pattern above.

## Agent discovery path (minimal)

1. `workspace-kit doctor` — canonical JSON contract files present.
2. `workspace-kit run` (no arguments) — all module commands with descriptions.
3. This file + `src/modules/<module>/instructions/<command>.md` — copy-paste JSON shape.
4. `docs/maintainers/POLICY-APPROVAL.md` — JSON vs env vs interactive approval.
5. Task Engine run schemas: `schemas/task-engine-run-contracts.schema.json` (versioned with package; command coverage verified by `pnpm run check`).

## Optional guardrail: hand-edit detection

Maintainers can run an **advisory** check that warns when `state.json` changes look like direct task edits without new `transitionLog` entries:

```bash
pnpm run advisory:task-state-hand-edit
```

In CI this runs as a **non-blocking** step (see `.github/workflows/ci.yml`). It always exits 0; read stderr for warnings. Legitimate recovery edits should be rare and documented in the PR.
