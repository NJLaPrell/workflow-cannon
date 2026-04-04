# Persisted artifacts and high-traffic CLI inventory

**Audience:** maintainers and agents planning schema, store, or router changes.  
**Non-goals:** This table does not replace **`src/contracts/builtin-run-command-manifest.json`** (full command list) or module **`instructions/*.md`** (behavior). Broader **`run`** validation beyond the Phase 50 pilot allowlist and error/remediation catalog (**`T602`**) remain follow-up work.

**When to update this file**

- New JSON artifact under **`schemas/`** or **`docs/maintainers/data/`** with contract meaning.
- New or renamed kit-owned path (SQLite file, JSON opt-out, planning session file).
- New **`workspace-kit run`** command that defines a stable success JSON shape consumed by tooling (extension, scripts, CI).
- Bump to **`task-engine-run-contracts.schema.json`** or **`compatibility-matrix.json`** that changes enforcement.

## On-disk JSON and schemas (`schemas/`)

| Artifact | R/W | Contract | Enforcement | Owner |
| --- | --- | --- | --- | --- |
| `schemas/task-engine-run-contracts.schema.json` | Read (generated bumps) | JSON Schema | `pnpm run check` (task-engine run contracts stage); publish/parity consumers | task-engine |
| `schemas/pilot-run-args.snapshot.json` | Read | Extracted args schemas for pilot `run` commands | `pnpm run check` (pilot-run-args-snapshot); refresh via `node scripts/refresh-pilot-run-args-snapshot.mjs` | core / task-engine |
| `schemas/task-engine-state.schema.json` | Read | JSON Schema | Documentation / validation helpers | task-engine |
| `schemas/compatibility-matrix.schema.json` | Read | JSON Schema | `scripts/check-compatibility.mjs` | release / workspace-config |
| `schemas/parity-evidence.schema.json` | Read | JSON Schema | Parity evidence contract | CI / parity |
| `schemas/workspace-kit-profile.schema.json` | Read | JSON Schema | Profile validation surfaces | workspace-config |
| `schemas/agent-behavior-profile.schema.json` | Read | JSON Schema | Agent-behavior module | agent-behavior |

## Maintainer data (`docs/maintainers/data/`)

| Artifact | R/W | Contract | Enforcement | Owner |
| --- | --- | --- | --- | --- |
| `compatibility-matrix.json` | R/W | `compatibility-matrix.schema.json` | `pnpm run check-compatibility`; release channel gate | maintainers |
| `workspace-kit-status.yaml` | R/W | Informal YAML | `workspace-kit doctor` vs `kit.currentPhaseNumber`; snapshot CLI | maintainers |
| `persisted-artifacts-and-cli-inventory.md` | R/W | Human table | Drift: maintainer review on phase closeout | documentation / maintainers |
| `roadmap-data.json`, `feature-taxonomy.json` | R/W | `src/modules/documentation/schemas/*.schema.json` | `pnpm run check` documentation data stage | documentation |

## Kit persistence (default SQLite)

| Location | R/W | Contract / notes | Enforcement | Owner |
| --- | --- | --- | --- | --- |
| `.workspace-kit/tasks/workspace-kit.db` | R/W | Relational task + wishlist + module state + subagent registry (`user_version` ≥ 6); `PRAGMA user_version` migrations | Runtime store APIs; `doctor`; `get-kit-persistence-map` | task-engine / subagents |
| `.workspace-kit/tasks/state.json` | R/W | JSON opt-out task document (documented recovery path) | Config `tasks.persistenceBackend` | task-engine |
| `.workspace-kit/planning/build-plan-session.json` | R/W | In-flight planning interview (not a substitute for task store) | Planning module + dashboard card | planning |
| `.workspace-kit/manifest.json` | Read | Workspace marker for kit | `doctor` / CLI resolve | core |

## Extension-critical `workspace-kit run` commands

Shapes are defined in **`src/contracts/`** (TypeScript) and/or **`schemas/task-engine-run-contracts.schema.json`**. Tiering: **`docs/maintainers/AGENT-CLI-MAP.md`**, **`docs/maintainers/POLICY-APPROVAL.md`**.

| Command | Mutating | Args / success reference | Schema / TS | Enforcement | Owner |
| --- | --- | --- | --- | --- | --- |
| `dashboard-summary` | No | `{}` or optional `config` / `actor` → `DashboardSummaryData` | `src/contracts/dashboard-summary-run.ts` + run-contracts schema; CLI pilot AJV | Extension compile; contract + pilot snapshot stages in `pnpm run check` | task-engine |
| `list-tasks` | No | Filters in instruction | Run-contracts dashboard/task list facets | `check` | task-engine |
| `get-next-actions` | No | `{}` or filters | Run-contracts / instruction | `check` | task-engine |
| `get-task` | No | `taskId`, optional `historyLimit` | Instruction + store | `check` | task-engine |
| `run-transition` | Yes | `taskId`, `action`, `policyApproval`, optional `expectedPlanningGeneration` | Instruction; policy traces | Policy + planning-generation guards | task-engine |
| `list-subagents`, `get-subagent`, `list-subagent-sessions`, `get-subagent-session` | No | Instruction + `subagents` module | Builtin manifest / instruction coverage | `check` | subagents |
| `register-subagent`, `retire-subagent`, `spawn-subagent`, `message-subagent`, `close-subagent-session` | Yes | `policyApproval` (+ `expectedPlanningGeneration` when required); `subagents.persist` | Policy traces; planning-generation guards | `check` | subagents |

**Builtin manifest:** All shipped `run` subcommands are listed in **`src/contracts/builtin-run-command-manifest.json`** (module id, instruction file, optional `policyOperationId`). **`pnpm run check`** includes instruction coverage and router/manifest alignment (`check-task-engine-run-contracts`, orphan instruction guards).

## Parity and release evidence

| Artifact | R/W | Contract | Enforcement | Owner |
| --- | --- | --- | --- | --- |
| `artifacts/parity-evidence.json` (gitignored dir) | Write | `parity-evidence.schema.json` | `pnpm run parity` | CI |

## Config registry

| Artifact | R/W | Contract | Enforcement | Owner |
| --- | --- | --- | --- | --- |
| `src/core/config-registry.json` | R/W | Typed registry consumed by config CLI | `pnpm run check`; `validatePersistedConfigDocument` | workspace-config |

## Related runbooks

- **`docs/maintainers/runbooks/task-persistence-operator.md`** — backend paths and recovery.
- **`docs/maintainers/runbooks/native-sqlite-consumer-install.md`** — consumer `better-sqlite3` issues.
