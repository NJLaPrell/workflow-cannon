# Phase kickoff readiness

**Machine canon.** Read-only audit before starting phase delivery or calling **`set-current-phase`** for a rollover. Composes planning, git integration branch, task scope paths, validation recommendations, and doctor contract slices.

**Agents:** use this runbook and **`pnpm exec wk run phase-kickoff-readiness`** — do **not** rely on **`docs/maintainers/`** prose for kickoff procedure.

Instruction: `src/modules/task-engine/instructions/phase-kickoff-readiness.md` · Tier C copy-paste: **`.ai/AGENT-CLI-MAP.extended.md`** → **Phase kickoff readiness**.

## When to run

| Moment | Command | Notes |
| --- | --- | --- |
| **Before phase rollover** | `phase-kickoff-readiness` then `set-current-phase` with `dryRun:true` | Review `data.findings` and `data.passed` first. |
| **Dashboard Phase Roster Start** | Same audit (extension calls this before live rollover) | Block-severity findings disable Start when enforcement is on. |
| **`set-current-phase` with enforcement** | Audit runs automatically; live write blocked on `block` findings | Error code **`phase-kickoff-blocked`** when `tasks.phaseKickoff.enforcementMode` is **`enforce`**. |
| **Mid-phase sanity check** | `phase-kickoff-readiness '{"phaseKey":"<N>"}'` | Safe anytime; no mutations, no `policyApproval`. |

## Copy-paste (Tier C)

```bash
pnpm exec wk run get-workspace-status '{}'
pnpm exec wk run phase-kickoff-readiness '{}'
pnpm exec wk run phase-kickoff-readiness '{"phaseKey":"137"}'
pnpm exec wk run phase-kickoff-readiness '{"phaseKey":"137","baseRef":"origin/main","integrationRef":"origin/release/phase-137","staleTaskDays":14,"checkScopePaths":true,"includeValidationPlans":true,"mode":"advisory"}'
pnpm exec wk run set-current-phase '{"currentKitPhase":"137","dryRun":true}'
```

## Arguments

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `phaseKey` | string | workspace canonical phase | Stable phase key to audit (from `kit_workspace_status` when omitted). |
| `baseRef` | string | `origin/main` | Git ref for integration comparison. |
| `integrationRef` | string | `origin/release/phase-<phaseKey>` | Phase integration branch ref. |
| `staleTaskDays` | number | `14` | Flag `ready` / `in_progress` tasks older than this many days. |
| `checkScopePaths` | boolean | `true` | Scope manifest + git staleness for up to 50 `ready` / `in_progress` / `proposed` tasks. |
| `includeValidationPlans` | boolean | `true` | Top validation recommendations for up to 5 `ready` tasks. |
| `mode` | string | `advisory` | `advisory` or `enforce`. **`enforce`** treats a missing integration branch as **`block`** severity. |

## Response contract

- **`passed`**: `false` when any finding has **`severity: "block"`**; otherwise `true` (warn/advisory-only findings still pass).
- **`findings[]`**: stable `code`, `severity` (`advisory` \| `warn` \| `block`), `message`, `slice`, optional `taskId` / `path`.
- **`slices`**: `planning`, `git`, `scope`, `validation`, `doctor` detail objects.

## Finding codes (stable)

| Code | Slice | Severity | Meaning |
| --- | --- | --- | --- |
| `kickoff-planning-stale-task` | planning | warn | `ready` / `in_progress` task not updated within `staleTaskDays`. |
| `kickoff-planning-dependency-blocked` | planning | warn | `ready` task has unmet `dependsOn` (dependency not `completed`). |
| `kickoff-planning-catalog-mismatch` | planning | advisory | Phase catalog `shortDescription` may not match active task summaries (heuristic). |
| `kickoff-git-integration-branch-missing` | git | warn / **block** | `integrationRef` not available. **`block`** when `mode` is **`enforce`** (or kit enforcement is on). |
| `kickoff-git-ahead-of-base` | git | advisory | Integration branch commits ahead of `baseRef`. |
| `kickoff-git-behind-base` | git | warn | Integration branch commits behind `baseRef` (rebase/merge risk). |
| `kickoff-scope-path-missing` | scope | warn | Parsed scope path not on disk. |
| `kickoff-scope-path-deleted` | scope | warn | Scope path deleted in git since task `updatedAt`. |
| `kickoff-scope-path-stale` | scope | advisory | ≥3 commits on path since task `updatedAt` (default threshold). |
| `kickoff-scope-path-parse-skipped` | scope | advisory | Backtick/embedded token looked path-like but failed prefix rules. |
| `kickoff-git-unavailable` | scope | advisory | Git staleness check could not run. |
| `kickoff-validation-recommendation` | validation | advisory | `recommend-validation` returned commands for a ready task. |
| `kickoff-doctor-contract-issues` | doctor | warn | `doctor` contract validation reported issues. |
| `kickoff-doctor-unavailable` | doctor | advisory | Doctor issues could not be collected. |

**`set-current-phase` block code:** `phase-kickoff-blocked` — live rollover rejected when enforcement is **`enforce`** and kickoff audit has **`block`** findings.

## Remediation loops

Work findings in slice order: **git → planning → scope → doctor → validation**.

### Git (`kickoff-git-integration-branch-missing`, `kickoff-git-behind-base`)

1. `git fetch origin`
2. Create or checkout **`release/phase-<N>`** from **`main`** per **`.ai/playbooks/task-to-phase-branch.md`**
3. Re-run kickoff; proceed to `set-current-phase` only when `passed` is true (or enforcement is advisory).

### Planning (`kickoff-planning-stale-task`, `kickoff-planning-dependency-blocked`)

| Finding | Loop |
| --- | --- |
| Stale ready/in_progress | **`run-transition`** cancel/archive, refresh task text, or **`update-task`** bump `updatedAt` after real scope change. |
| Dependency-blocked ready | Complete or cancel blocker tasks first; use **`add-dependency`** / **`remove-dependency`** only with policy when mutating. |
| Catalog mismatch | **`update-phase-note`** or phase catalog entry; align task titles/summaries with phase intent. |

### Scope (`kickoff-scope-path-*`)

| Finding | Loop |
| --- | --- |
| Missing / deleted path | **`update-task`** — refresh **`technicalScope`** / **`description`** to real paths; split oversized tasks. |
| Stale path | Re-read code at path; narrow scope or accept churn with an explicit phase note. |
| Parse skipped | Fix backtick paths to use allowed prefixes (`src/`, `extensions/`, `schemas/`, `.ai/`, `.cursor/`). |

### Doctor / validation

- **`kickoff-doctor-contract-issues`**: run **`pnpm run wk doctor`**; fix contract drift before delivery.
- **`kickoff-validation-recommendation`**: run suggested commands from **`recommend-validation`** for the cited `taskId` before **`run-transition` `start`**.

## Related

- **`set-current-phase`** — live rollover; embeds same audit when `tasks.phaseKickoff.enforcementMode` ≠ `off`.
- **`phase-focus-dashboard`** — bounded phase queue rollup during delivery.
- **`phase-closeout-readiness`** — end-of-phase drain audit (kickoff complement).
- **`.cursor/rules/phase-kickoff-assessment.mdc`** — optional agent rule; attach at phase start.
