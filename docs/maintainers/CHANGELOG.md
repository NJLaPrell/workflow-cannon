# Changelog

All notable changes to `@workflow-cannon/workspace-kit` are documented in this file.

`CHANGELOG.md` at the repository root is pointer-only and must not diverge from this canonical history.

## [Unreleased]

## [0.12.0] - 2026-03-27

Phase 11 — architectural review follow-up hardening and release-process alignment.

### Added

- **Phase 11 policy/session edge tests** in `test/phase11-architectural-followup.test.mjs` covering malformed `policyApproval`, session-id mismatch for grants, and non-interactive denial behavior with stable denial fields.
- **Concurrency contention tests** in `test/task-engine.test.mjs` for concurrent task-store saves and concurrent policy-trace appends (line-delimited JSON assertions).
- **Runtime path audit note**: `docs/maintainers/RUNTIME-PATH-AUDIT-PHASE11.md`.

### Changed

- **Sensitive `workspace-kit run` denial messaging** now distinguishes missing vs invalid `policyApproval` payloads while keeping `policy-denied`, `operationId`, and `remediationDoc` stable.
- **Task engine README** now includes explicit concurrency semantics for `.workspace-kit/tasks/state.json` and `.workspace-kit/policy/traces.jsonl`.
- **Release workflow docs** now include a pre-approval doc consistency sweep checklist with explicit `pnpm run check-planning-consistency`.

## [0.11.0] - 2026-03-26

Phase 9–10 — interactive policy UX, strict response-template opt-in, and **Agent/CLI parity** documentation plus discoverability.

### Added

- **`docs/maintainers/AGENT-CLI-MAP.md`** — tier table (task transitions vs other sensitive `workspace-kit run` commands), `/qt` vs CLI boundaries, and copy-paste JSON for each policy `operationId`.
- **`WORKSPACE_KIT_INTERACTIVE_APPROVAL`** — optional TTY prompt for sensitive `workspace-kit run` (`src/cli/interactive-policy.ts`, `readStdinLine` test hook on `WorkspaceKitCliOptions`).
- **Strict response templates:** `enforcementMode: strict` fails on unknown default/override template ids and on `responseTemplateId` vs instruction directive mismatch (`response-template-conflict`).
- **`.cursor/rules/workspace-kit-cli-execution.mdc`** — always-on rule mirroring CLI-first execution; **`pnpm run advisory:task-state-hand-edit`** — non-blocking advisory when `state.json` diffs look like hand-edits (CI: `continue-on-error`).

### Changed

- **`workspace-kit run`** (no subcommand) and **`workspace-kit doctor`** success output point agents at instruction paths, `POLICY-APPROVAL.md`, and **`AGENT-CLI-MAP.md`**.
- **`docs/maintainers/POLICY-APPROVAL.md`** — Agents / IDE / non-TTY subsection (session id, chat is not approval).
- **`docs/maintainers/AGENTS.md`** and **`.ai/AGENTS.md`** — CLI-first rules and concrete examples; **`tasks/*.md`** and **`.cursor/commands/qt.md`** — persistence vs planning-only labeling.
- **`docs/maintainers/CONFIG.md`** — `responseTemplates.enforcementMode` strict/advisory semantics documented in metadata and generated reference.
- **Task engine** — `.workspace-kit/tasks/state.json` is tracked in git (`.gitignore` updated); Phase 9–10 tasks completed in maintainer workflow.

## [0.10.0] - 2026-03-26

Phase 8 — improvement backlog triage: maintainer onboarding, policy clarity, and doc/runbook alignment.

### Added

- **`docs/maintainers/POLICY-APPROVAL.md`** — canonical guide for JSON **`policyApproval`** on `workspace-kit run` vs **`WORKSPACE_KIT_POLICY_APPROVAL`** for `init` / `upgrade` / `config` mutations.
- **Runbooks** — `recommendation-and-transcript-triggers.md`, `agent-structured-workspace-report.md`, `first-run-validation.md`.
- **`docs/maintainers/TASK-ENGINE-STATE.md`** and optional editor schema **`schemas/task-engine-state.schema.json`** (not loaded by runtime).

### Changed

- **`workspace-kit run`** — `policy-denied` JSON now includes **`operationId`**, **`remediationDoc`**, and **`hint`** distinguishing env approval from `run` JSON approval.
- **CLI messages** — `init` / `upgrade` / `config` mutating paths cite **`docs/maintainers/POLICY-APPROVAL.md`** and operation ids where applicable.
- **README / AGENTS** — explicit CLI invocation table, task-state as execution truth, link to policy doc.
- **Transcript ingestion runbook** — corrected guidance: `run` does not read `WORKSPACE_KIT_POLICY_APPROVAL`; wrapper scripts may still use env for detached ingest.
- **FEATURE-MATRIX / ARCHITECTURAL-REVIEW-FINDINGS** — Phase 7–8 rows and remediation snapshot; removed incorrect “Phase 6 includes imp-2cf5” feature claim.

### Fixed

- Misleading implication that env-based approval applies to bare `workspace-kit run` sensitive commands.

## [0.9.0] - 2026-03-26

Phase 7 — architectural hardening and canon alignment: documentation/index cleanup, package/changelog canon normalization, CLI decomposition, runtime/path hardening, and governance surface clarification.

- **`generate-recommendations`** — always runs **`sync-transcripts`** first (honors the same `sourcePath` / `archivePath` / discovery resolution as standalone sync). Response `data` includes a **`sync`** object with the sync result alongside recommendation fields.
- **`sync-transcripts` / transcript discovery** — default `improvement.transcripts.sourcePath` is now **empty** so sync **discovers** sources: repo-relative paths (`.cursor/agent-transcripts`, `.vscode/agent-transcripts`, then optional `discoveryPaths`), then **Cursor global** `~/.cursor/projects/<workspace-path-slug>/agent-transcripts` when present (`buildCursorProjectsAgentTranscriptsPath`). Set `sourcePath` explicitly to pin a single relative source and skip discovery.
- **CLI orchestration** — `workspace-kit run` command orchestration moved into a dedicated run-handler path (`src/cli/run-command.ts`) with shared bootstrap/policy behavior preserved.
- **Package identity and drift checks** — canonical kit identity is now `@workflow-cannon/workspace-kit` in manifest upgrade output and drift comparison logic (legacy `quicktask-workspace-kit` remains accepted for compatibility checks).
- **Documentation runtime pathing** — documentation generation now resolves module config/templates/schemas from either the active workspace root or the installed package source root, removing hard dependency on consumer repo layout.
- **Policy actor resolution** — actor precedence remains `args.actor` -> `WORKSPACE_KIT_ACTOR` -> git identity -> `unknown`, but git lookups are now bounded async fallbacks (`WORKSPACE_KIT_ACTOR_GIT_LOOKUP=off` disables git fallback).
- **Transcript completion hooks** — background hook runs now append status evidence to `.workspace-kit/improvement/transcript-hook-events.jsonl` and explicitly log skip/failure reasons while retaining lock-based overlap prevention.

## [0.8.0] - 2026-03-26

Phase 6 — automation hardening, response-template advisory, and Cursor-native transcript automation: bounded transcript operations, policy session grants, response templates on `workspace-kit run` JSON, and optional editor/CLI automation.

### Added

- **Transcript hardening (6a)** — scan budgets (`maxFilesPerSync`, `maxBytesPerFile`, `maxTotalScanBytes`), source discovery paths, sync `runId` + `skipReasons`, retry queue with backoff in `.workspace-kit/improvement/state.json` (schema v2), `transcript-automation-status` command, transcript snippet redaction for ingest provenance, session-scoped policy grants (`.workspace-kit/policy/session-grants.json` + `policyApproval.scope`), optional `pre-release-transcript-hook` script and `pnpm run pre-release-transcript-hook`.
- **Response templates (6b)** — builtin template registry, `responseTemplates.*` config (`enforcementMode`, `defaultTemplateId`, `commandOverrides`), advisory shaping on every `workspace-kit run` result (`responseTemplate` metadata + optional `data.presentation`), plain-English directives via `responseTemplateDirective` / `instruction` fields.
- **Cursor / CLI automation (6c)** — `pnpm run transcript:sync` and `transcript:ingest` via `scripts/run-transcript-cli.mjs` (fails fast if `dist/` missing), `.vscode/tasks.json` folder-open sync + manual ingest task, `improvement.hooks.afterTaskCompleted` (`off` / `sync` / `ingest`) spawning detached transcript CLI after task `completed` transitions.

### Changed

- **`workspace-kit run` JSON** — results may include `responseTemplate` (telemetry + warnings); strict mode can fail with `response-template-invalid` when an explicit template id is unknown.
- **Task engine** — completion transitions may trigger optional background transcript sync per `improvement.hooks.afterTaskCompleted`.

### Migration notes

- New config keys are opt-in except defaults merged from kit layer (`responseTemplates`, `improvement.hooks`). Review `docs/maintainers/runbooks/transcript-ingestion-operations.md`, `response-templates.md`, and `cursor-transcript-automation.md`.
- Regenerate config reference docs after upgrading: `workspace-kit config generate-docs` (maintainer workflow).

### Fixed

- **`check-planning-doc-consistency`** — when `.workspace-kit/tasks/state.json` is absent (CI / fresh clone), Phase 4 alignment uses the roadmap so publish workflows pass without a local task store.

## [0.7.0] - 2026-03-26

Phase 5 — transcript intelligence automation (initial slice): manual-first transcript sync and one-shot ingest flow, with cadence/config contracts and a locked rollout baseline.

### Added

- **Transcript sync command** — `workspace-kit run sync-transcripts` copies transcript `*.jsonl` files from configured source into local archive with deterministic summaries (`scanned`, `copied`, `skippedExisting`, `skippedConflict`, `errors`, `copiedFiles`).
- **One-shot ingest command** — `workspace-kit run ingest-transcripts` orchestrates sync + recommendation generation and returns consolidated sync/cadence/generation JSON in a single call.
- **Phase 5 config contract** — new keys `improvement.transcripts.sourcePath`, `improvement.transcripts.archivePath`, `improvement.cadence.minIntervalMinutes`, and `improvement.cadence.skipIfNoNewTranscripts` with strict validation and metadata exposure.
- **Cadence/backoff policy outputs** — ingest responses now include explicit cadence decision reasons for observability and troubleshooting.
- **Design baseline** — `docs/maintainers/workbooks/transcript-automation-baseline.md` defines command model, safety boundaries, config ownership, and rollout guardrails for follow-on Phase 5 work.

### Changed

- **Policy map** — `ingest-transcripts` is classified as a sensitive operation (`improvement.ingest-transcripts`) because it can mutate task-engine state through recommendation generation.
- **Improvement module registration** — module command surface now includes `sync-transcripts` and `ingest-transcripts`.

### Migration notes

- Add/update transcript automation keys through canonical config surfaces (for example `workspace-kit config set improvement.transcripts.sourcePath ...`).
- Continue keeping transcript archives local-only (`agent-transcripts/` remains ignored by git).
- Automation invoking `workspace-kit run ingest-transcripts` must supply `policyApproval` in JSON args, same as other sensitive `run` commands.

## [0.6.0] - 2026-03-26

Phase 4 — runtime scale and ecosystem hardening: compatibility contract enforcement, diagnostics/SLO baseline, release-channel guarantees, and planning-doc consistency guardrails.

### Added

- **Compatibility matrix + schema** — canonical `docs/maintainers/data/compatibility-matrix.json` and `schemas/compatibility-matrix.schema.json` for runtime/module/config/policy compatibility mapping.
- **Compatibility gate** — `scripts/check-compatibility.mjs` with machine-readable report output at `artifacts/compatibility-report.json`.
- **Release channel enforcement** — `scripts/check-release-channel.mjs` validates channel (`canary`/`stable`/`lts`) behavior against matrix mapping.
- **Planning consistency guard** — `scripts/check-planning-doc-consistency.mjs` enforces consistent Phase status across `ROADMAP.md`, `.workspace-kit/tasks/state.json`, and `FEATURE-MATRIX.md`.
- **Operational diagnostics pack** — `scripts/generate-runtime-diagnostics.mjs` emits runtime evidence inventory and SLO objective status to `artifacts/runtime-diagnostics.json`.
- **Evidence lifecycle control** — `scripts/prune-evidence.mjs` supports retention-based pruning for stale `.workspace-kit` evidence artifacts.

### Changed

- **CI and publish gates** now run `phase4-gates` (`check-compatibility`, planning consistency, release-channel validation) before release execution.
- **Release metadata validation** now requires Phase 4 gate scripts in `package.json` scripts.

### Migration notes

- Release automation should set channel context with `WORKSPACE_KIT_RELEASE_CHANNEL` (defaults to `stable`) and may set `WORKSPACE_KIT_RELEASE_DIST_TAG` / `WORKSPACE_KIT_RELEASE_TAG` for strict channel validation.
- If local evidence stores grow, run `pnpm run prune-evidence` in dry-run mode first, then with `WORKSPACE_KIT_EVIDENCE_PRUNE_APPLY=true` for cleanup.

## [0.5.0] - 2026-03-25

Phase 3 — enhancement loop MVP: evidence-driven `improvement` tasks, approvals decisions, heuristic confidence, and append-only lineage.

### Added

- **`improvement` module** — `generate-recommendations` (on-demand ingest from agent transcripts, policy denials, config mutation failures, task transition churn, optional `fromTag`/`toTag` git diff); `query-lineage` (read-only chain for a recommendation task id). Dedupe by `evidenceKey`; incremental cursors in `.workspace-kit/improvement/state.json`; `rec` lineage events in `.workspace-kit/lineage/events.jsonl`.
- **`approvals` module** — `review-item` with `accept`, `decline`, `accept_edited` (requires `editedSummary`). Idempotent decisions via fingerprint; append-only `.workspace-kit/approvals/decisions.jsonl`; updates Task Engine `improvement` tasks (`decline` transition from `in_progress` → `cancelled`).
- **Heuristic confidence (T202)** — `computeHeuristicConfidence`, `shouldAdmitRecommendation`, `HEURISTIC_1_ADMISSION_THRESHOLD` exported for deterministic admission.
- **Lineage contract (T192/T203)** — Versioned events (`rec`, `dec`, `app`, `corr`) with correlation root `taskId::evidenceKey`; `appendLineageEvent`, `queryLineageChain`, `readLineageEvents` in core exports.
- **Policy** — Sensitive `run` operations `review-item` (`approvals.review-item`) and `generate-recommendations` (`improvement.generate-recommendations`).

### Changed

- **Task Engine transitions** — `in_progress` → `cancelled` via action `decline` (declined recommendations after `start`).

### Migration notes

- Scripts that call `workspace-kit run generate-recommendations` or `workspace-kit run review-item` must supply `policyApproval` in JSON args (or env where applicable), same as other sensitive module commands.
- Add `.workspace-kit/improvement/`, `.workspace-kit/lineage/`, and `.workspace-kit/approvals/` to `.gitignore` if those artifacts should stay local.

## [0.4.1] - 2026-03-25

Phase 2b — config validation/policy trace versioning, config UX (CLI + metadata + docs), and user config layer.

### Added

- **User config layer** — `~/.workspace-kit/config.json` (override `WORKSPACE_KIT_HOME` in tests) merged after module defaults and before project `.workspace-kit/config.json`.
- **`workspace-kit config`** — `list`, `get`, `set`, `unset`, `explain`, `validate`, `resolve`, `generate-docs`, `edit` (TTY). JSON via `--json`; mutating sensitive keys require `WORKSPACE_KIT_POLICY_APPROVAL` in the environment.
- **Config metadata registry** — `src/core/config-metadata.ts` drives validation, CLI allowlists, and generated `.ai/CONFIG.md` + `docs/maintainers/CONFIG.md`.
- **`resolve-config` module command** — Full effective config (key-sorted) and layer ids via `workspace-kit run resolve-config`.
- **Policy** — Trace records include `schemaVersion` (default `1`). Effective `policy.extraSensitiveModuleCommands` extends sensitive `run` commands; traces use operation id `policy.dynamic-sensitive` for those entries.

- **Config mutation evidence** — Append-only JSONL under `.workspace-kit/config/mutations.jsonl`.

### Changed

- **Strict persisted config** — Unknown top-level or nested keys in project/user JSON are rejected on read/write/validate.

### Migration notes

- Add `.workspace-kit/config/` to `.gitignore` if mutation logs should not be committed.
- Scripts that set `policy.extraSensitiveModuleCommands` or mutate those keys via `config set` need policy approval as for other sensitive mutators.

## [0.4.0] - 2026-03-25

Phase 2 (config, policy, local cutover) release. Layered workspace configuration, policy gates with traces, and maintainer docs for optional task-engine cutover.

### Added

- **Workspace config resolution** — Merge order: kit defaults → module defaults (registry order) → `.workspace-kit/config.json` → `WORKSPACE_KIT_*` env → `workspace-kit run` JSON `config`. Task store path reads `tasks.storeRelativePath` from effective config.
- **`workspace-config` module** — `explain-config` command (JSON: `path`, optional `config`) returns effective value, winning layer, and alternates.
- **Policy baseline** — Sensitive `run` commands require `policyApproval: { confirmed, rationale }` in JSON args. `init` and `upgrade` require `WORKSPACE_KIT_POLICY_APPROVAL` JSON in the environment. Documentation writes gated unless `options.dryRun === true`.
- **Policy traces** — Append-only JSONL at `.workspace-kit/policy/traces.jsonl` (with operation id, actor, allowed/denied, rationale, `commandOk` when applicable).
- **Actor resolution** — `actor` arg → `WORKSPACE_KIT_ACTOR` → `git config user.email` / `user.name` → `"unknown"`.
- **Maintainer docs** — `docs/maintainers/config-policy-matrix.md` and historical local-adoption guidance for Phase 2 (aligned with `docs/maintainers/workbooks/phase2-config-policy-workbook.md`).

### Changed

- **`ModuleLifecycleContext`** — Optional `effectiveConfig`, `resolvedActor`, `moduleRegistry` for config and explain-config wiring.
- **CLI** — `workspace-kit run` builds effective config before dispatch; task-engine uses merged config for store path and default transition actor.

### Migration notes

- **Breaking for automation:** scripts that call `workspace-kit init` or `workspace-kit upgrade` must set `WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"..."}'` (or obtain user approval and inject the same).
- Agents calling sensitive `workspace-kit run` commands must include `policyApproval` in JSON args per module instructions.
- Add `.workspace-kit/policy/` to `.gitignore` if traces should not be committed.

## [0.3.0] - 2026-03-25

Phase 1 (Task Engine core) release. Adds a canonical task lifecycle, transition runtime with evidence, file-backed persistence, and maintainer-facing CLI commands.

### Added

- **Task Engine module** — `TaskEntity` model with lifecycle states (`proposed`, `ready`, `in_progress`, `blocked`, `completed`, `cancelled`), typed transition map, `TransitionValidator` with ordered `TransitionGuard` hooks, and built-in dependency and state-validity guards.
- **Transition runtime** — `TransitionService` with deterministic transitions, auto-unblock of dependents when dependencies complete, and structured transition evidence (timestamp, actor, guard results, unblocked dependents).
- **Task store** — Schema-versioned JSON persistence (default under `.workspace-kit/tasks/`, configurable via module config).
- **Module commands** — `run-transition`, `get-task`, `list-tasks`, `get-ready-queue`, `get-next-actions` exposed through the module command router and `workspace-kit run`.
- **Task state contract** — canonical execution state in `.workspace-kit/tasks/state.json`.
- **Next-action suggestions** — Priority-sorted ready queue with blocking-chain context for agent workflows.
- **Design workbook** — `docs/maintainers/workbooks/task-engine-workbook.md` capturing schema, transition graph, guards, persistence, and error taxonomy.

### Changed

- Task-engine module registration now provides full `onCommand` implementation and expanded instruction entries.

### Migration notes

- Existing workflows that only used documentation and core CLI commands are unaffected.
- Use `.workspace-kit/tasks/state.json` as the only task execution source.
- New default state directory `.workspace-kit/tasks/`; add to `.gitignore` if task state should stay local.

## [0.2.0] - 2026-03-25

Phase 0 (foundation) release. Establishes the module platform, documentation generation, release automation, and parity validation infrastructure.

### Added

- **Module contract and registry** — `WorkflowModule` interface, `ModuleRegistry` with dependency graph validation (duplicate, missing, self-reference, cycle detection), deterministic startup ordering, and enable/disable with dependency-integrity checks.
- **Module config/state/instruction contracts** — Modules declare config, state, and instruction metadata at registration; registry validates instruction name/file mapping and backing file existence at startup.
- **Module command router** — `ModuleCommandRouter` for discovering and dispatching commands across enabled modules, with alias resolution and duplicate-command detection.
- **Documentation module** — First module implementation: template-driven document generation for paired AI-surface (`.ai/`) and human-surface (`docs/maintainers/`) outputs, with write-boundary enforcement, section-coverage validation, conflict detection, and structured evidence output.
- **Template library** — Generation templates for `AGENTS.md`, `ARCHITECTURE.md`, `PRINCIPLES.md`, `RELEASING.md`, `ROADMAP.md`, `SECURITY.md`, `SUPPORT.md`, and `TERMS.md` using `{{{ }}}` instruction blocks.
- **Release metadata validation** — `scripts/check-release-metadata.mjs` fail-closed validator for package.json fields; wired into CI `release-readiness` job.
- **Consumer update cadence** — Defined `candidate`/`stable`/`patch` states with transition rules and required validation per transition.
- **Parity validation flow** — Canonical 6-step command chain (`build` → `typecheck` → `test` → `pack:dry-run` → `metadata-check` → `fixture-smoke`) with standardized output contract.
- **Parity fixture pack** — Consumer fixture at `test/fixtures/parity/` with smoke test verifying package exports and CLI bin entry.
- **Parity runner** — `scripts/run-parity.mjs` executes the full command chain and emits `artifacts/parity-evidence.json`.
- **Parity evidence schema** — `schemas/parity-evidence.schema.json` (JSON Schema 2020-12) defining the evidence artifact format.
- **Release-blocking parity in CI** — `parity` job in `ci.yml` depends on `test` + `release-readiness`, uploads evidence artifact; `publish-npm.yml` runs metadata + parity checks before publish.
- **Release gate matrix** — `docs/maintainers/release-gate-matrix.md` with 10 gates, ownership, CI mapping, and escalation path.
- **Module build guidance** — `.ai/module-build.md` (canonical AI spec) and `docs/maintainers/module-build-guide.md` (human companion).
- **Canonical documentation surfaces** — AI docs under `.ai/`, human docs under `docs/maintainers/`, with cross-references and ownership boundaries.
- **Feature matrix** — `docs/maintainers/FEATURE-MATRIX.md` tracking product capabilities by phase.

### Changed

- CI workflow (`ci.yml`) now includes `release-readiness` and `parity` jobs in addition to the existing `test` job.
- Publish workflow (`publish-npm.yml`) now requires metadata and parity validation before npm publish.

### Migration notes

- No breaking changes to the public API from `v0.1.0`.
- New scripts (`check-release-metadata`, `parity`) are additive.
- New `schemas/`, `scripts/`, and `test/fixtures/parity/` directories are additive.

## [0.1.0] - 2026-03-18

Initial publish from split-repo extraction.

### Added

- CLI commands: `init`, `doctor`, `check`, `upgrade`, `drift-check`.
- Profile-driven project context generation.
- Kit-owned asset management with backup and drift detection.
