# Changelog

All notable changes to `@workflow-cannon/workspace-kit` are documented in this file.

`CHANGELOG.md` at the repository root is pointer-only and must not diverge from this canonical history.

## [Unreleased]

(none)

## [0.23.0] - 2026-03-28

Phase 23 — **agent-behavior** module (`T420`–`T424`): advisory interaction profiles, workspace persistence (JSON or unified SQLite), guided interview, maintainer/agent docs + requestable Cursor rule.

### Added

- **`agent-behavior` module** — builtins (`builtin:cautious`, `builtin:balanced`, `builtin:calculated`, `builtin:experimental`), custom profiles, `resolve` + provenance, deterministic `explain` / `diff`.
- **Commands** — `list-behavior-profiles`, `get-behavior-profile`, `resolve-behavior-profile`, `set-active-behavior-profile`, `create-behavior-profile`, `update-behavior-profile`, `delete-behavior-profile`, `diff-behavior-profiles`, `explain-behavior-profiles`, `interview-behavior-profile`.
- **Schema** — `schemas/agent-behavior-profile.schema.json`; plan `docs/maintainers/plans/agent-behavior-module.md`.
- **`ModuleCapability`** — `agent-behavior`.
- **`.cursor/rules/agent-behavior.mdc`** (requestable) and **AGENTS** / **AGENT-CLI-MAP** guidance.

### Changed

- **Default registry** — `agent-behavior` registered after `documentation` (no new hard dependencies).

## [0.22.0] - 2026-03-28

Phase 21 — agent reliability and planning dashboard signals (`T404`–`T414` scope): long-session maintainer guidance, persisted `build-plan` session snapshot for `dashboard-summary`, and extension dashboard visibility.

### Added

- **`.workspace-kit/planning/build-plan-session.json`** (gitignored) — written while a `build-plan` interview is in progress or blocked on finalize; stores answers + `resumeCli`; cleared on successful interview completion.
- **`dashboard-summary` → `data.planningSession`** — redacted summary (`schemaVersion`, timestamps, type, status, critical completion %, `resumeCli`) for operator UIs; `null` when no snapshot.
- **Requestable Cursor rule** — `.cursor/rules/cursor-long-session-hygiene.mdc` (`alwaysApply: false`) plus runbook **`docs/maintainers/runbooks/cursor-long-session.md`**.
- **Extension dashboard** — renders **Planning session** + resume CLI from `dashboard-summary`.

### Changed

- **Planning module** version **0.2.0**; compatibility matrix **`planning`** row aligned to **0.2.0**.
- **`docs/maintainers/AGENTS.md`** — **Long threads and context reload** section.

## [0.21.0] - 2026-03-28

Phase 20 — maintainer platform and documentation alignment (`T388`–`T393`, `T394`–`T397`, `T399`, `T400`, `T402`): architecture canon, module boundaries, policy command map decomposition, task-engine package surface, and CI guards.

### Added

- **`improvement.optionalPeers`** — lists `documentation` as an optional integration peer (must be present in the module map; appears in `getActivationReport` when the documentation module is disabled).
- **`ModuleInstructionEntry.requiresPeers`** — optional peer module ids required for a command to register in `ModuleCommandRouter`; registry validates ids; router skips non-executable entries; `execute` returns `peer-module-disabled` if invoked without satisfied peers.
- **`buildAgentInstructionSurface` / classification helpers** — full declared instruction catalog with `executable` + `degradation` and bundled `activationReport`.
- **`workspace-kit doctor --agent-instruction-surface`** — after standard doctor checks, prints JSON `{ ok, code, data }` with `schemaVersion: 1` for tooling and agents.
- **`registration.optionalPeers`** — soft module coupling: optional peers are validated but need not be enabled; `dependsOn` remains hard for enabled modules.
- **`ModuleRegistry.getActivationReport()`** — per-module enablement, unsatisfied hard deps, and missing optional peers for tooling.
- **Config-driven module toggles** — `modules.enabled` / `modules.disabled` in effective workspace config (defaults in kit layer); `workspace-kit run`, `config` CLI (non-list), and doctor planning checks resolve registry + config together via `resolveRegistryAndConfig`.
- **`moduleRegistryOptionsFromEffectiveConfig`** — maps effective config to registry options with unknown-id errors.
- **Per-module `policy-sensitive-commands.ts`** — documentation, task-engine, approvals, and improvement modules declare sensitive `run` operations; `policy.ts` aggregates via `buildBuiltinCommandToOperation()` (foundation for manifest-driven policy).
- **`src/contracts/command-manifest.ts`** — shared types for future full command manifest wiring (`T388` follow-up).
- **`scripts/check-orphan-instructions.mjs`** — fails `pnpm run check` when instruction markdown under a module is not referenced from that module’s root `.ts` sources (with a small allowlist for non-command templates).

### Changed

- **Task engine module layout** — implementation lives in `task-engine-internal.ts`; `index.ts` re-exports the public surface only (`T392`).
- **Maintainer documentation** — `ARCHITECTURE.md`, `TERMS.md`, `module-build-guide.md`, `src/modules/README.md`, planning/task-engine module READMEs, and `.ai/module-build.md` aligned with shipped registry, SQLite state, and `onCommand`-only lifecycle.
- **Compatibility matrix** — `documentation` module contract version set to **0.3.0** to match runtime registration.
- **Release / CI scripts** — `check-task-engine-run-contracts` reads `task-engine-internal.ts`; `check-agent-cli-map-coverage` registers `task-engine` commands from `index.ts` + `task-engine-internal.ts` without false positives from transition guard names.

### Fixed (housekeeping)

- **Task engine run contract schema** — document `get-module-state` and `list-module-states` for `check-task-engine-run-contracts`.
- **Agent CLI map exclusions** — same commands excluded from tier-table coverage check (operator/diagnostic surface).

## [0.18.0] - 2026-03-27

Phase 17 — planning module guided workflows (`T345`–`T350`): CLI-native planning interviews, configurable rule-driven prompts, hard critical-unknown gating, and wishlist artifact output.

### Added

- **Planning workflow command surface** — `list-planning-types`, `build-plan`, and `explain-planning-rules` under the `planning` module with typed workflow descriptors for task breakdown, sprint/phase, ordering, new feature, and change planning.
- **Adaptive planning question engine** — critical baseline questions + adaptive follow-up prompts with configurable depth (`minimal`/`guided`/`adaptive`) and rule-pack overrides.
- **Planning artifact composer** — versioned wishlist-style artifact payload (`schemaVersion: 1`) capturing goals, approach, major technical decisions, candidate features/changes, assumptions, open questions, and risks/constraints.
- **Wishlist persistence on finalize** — `build-plan` can create a new `W###` artifact record through the shared planning stores (JSON or SQLite backend aware).
- **Planning operator runbook** — `docs/maintainers/runbooks/planning-workflow.md` with command flow, response semantics, and config knobs.

### Changed

- **Finalize gating semantics** — `build-plan` enforces hard critical-unknown blocking by default (`planning.hardBlockCriticalUnknowns=true`) with an explicit warning-mode escape hatch.
- **Planning CLI UX payloads** — `build-plan` responses now include `cliGuidance` (critical completion progress + suggested next command) to streamline operator loops.
- **Maintainer command map** — `docs/maintainers/AGENT-CLI-MAP.md` includes copy/paste planning module commands and links to the planning runbook.

### Tests

- Added/updated planning tests for workflow typing, adaptive branching, hard-gate behavior, rules explainability, CLI guidance output, and finalize-to-wishlist persistence.
- Hardened CLI command discovery assertions to require planning commands in `workspace-kit run` output.

## [0.17.0] - 2026-03-27

Phase 16 — maintenance and stability across Task Engine contracts/validation and Cursor extension parity (`T335`–`T344`).

### Added

- **Versioned Task Engine run contracts** — `schemas/task-engine-run-contracts.schema.json` covering command argument/response-data surfaces, shipped in package files.
- **Contract sync check** — `scripts/check-task-engine-run-contracts.mjs`, wired into `pnpm run check`, validates package version and command coverage drift.
- **Known type validation** — `type: "improvement"` now enforces non-empty `acceptanceCriteria` + `technicalScope` with stable `invalid-task-type-requirements`.
- **Task mutation idempotency** — `clientMutationId` replay/conflict semantics for `create-task` and `update-task` with payload digests in mutation evidence.
- **Model explainer command** — `workspace-kit run explain-task-engine-model '{}'` returns task/wishlist variants, planning boundaries, and lifecycle actions.
- **Strict runtime validation toggle** — `tasks.strictValidation` validates task records before persistence (`strict-task-validation-failed` on violation).

### Changed

- **`list-tasks` ergonomics** — new filters: `type`, `category` (`metadata.category`), `tags` (`metadata.tags`), and safe `metadataFilters` dotted paths.
- **Extension watcher refresh model** — dynamically tracks `.workspace-kit/config.json`, default/configured JSON task path, and default/configured SQLite DB path.
- **Extension dashboard UI** — renders wishlist counts, blocked summary (with top blockers), and ready-queue preview from existing `dashboard-summary` payload fields.
- **Extension ready queue command** — prefers filtered ready improvements (`status + type`) and falls back to full ready queue when needed.
- **TERMS glossary** — adds Task Engine vocabulary: Wishlist, execution task, improvement task, unified work record.

### Tests

- Added/updated coverage for known-type validation, list-task filter combinations, idempotent replay/conflict paths, strict validation on/off behavior, and model explainer command output.
- Extension compile checks validated watcher/dashboard/filter updates.

## [0.16.1] - 2026-03-27

Patch: **`workspace-kit doctor`** and persisted config for SQLite task settings.

### Added

- **Doctor:** After canonical contract files pass, resolve effective workspace config; when **`tasks.persistenceBackend`** is **`sqlite`**, require the SQLite file to exist, open it read-only, validate `workspace_planning_state` access, and verify embedded JSON **`schemaVersion`** when row `id=1` is present (empty table allowed).

### Changed

- **Project config validation** (`.workspace-kit/config.json`): allow **`tasks.wishlistStoreRelativePath`**, **`tasks.persistenceBackend`**, **`tasks.sqliteDatabaseRelativePath`** with metadata in `src/core/config-metadata.ts`.

### Tests

- `test/cli.test.mjs` — doctor failures and passes for SQLite planning DB.

## [0.16.0] - 2026-03-27

Phase 15 — Optional SQLite persistence for Task Engine + Wishlist (single database file, JSON document columns), offline migration command, and atomic `convert-wishlist` when using SQLite.

### Added

- **`better-sqlite3`** dependency with `pnpm.onlyBuiltDependencies` so installs run the native prebuild.
- **`tasks.persistenceBackend`**: `json` (default) or `sqlite`; **`tasks.sqliteDatabaseRelativePath`** (default `.workspace-kit/tasks/workspace-kit.db`).
- **`SqliteDualPlanningStore`**: one row stores full task and wishlist JSON documents; WAL journal.
- **`migrate-task-persistence`** command: `json-to-sqlite` / `sqlite-to-json` with `dryRun` and `force`.
- **ADR:** `docs/maintainers/ADR-task-sqlite-persistence.md`.

### Changed

- **`TaskStore`** / **`WishlistStore`**: pluggable persistence (`TaskStore.forJsonFile`, `WishlistStore.forJsonFile`, `forSqliteDual`); improvement and approvals open stores via **`openPlanningStores`**.
- **Task engine** / **dashboard** / wishlist commands use shared planning opener; SQLite path uses one DB for both surfaces.

### Tests

- SQLite migration smoke test in `test/task-engine.test.mjs`; command list updated in `test/module-command-router.test.mjs`.

## [0.15.0] - 2026-03-27

Phase 14 — Wishlist intake and conversion: separate `W###` namespace, strict intake fields, and explicit conversion into phased `T###` tasks.

### Added

- **Wishlist persistence** at `.workspace-kit/wishlist/state.json` (`WishlistStore`) with atomic writes.
- **Task-engine commands:** `create-wishlist`, `list-wishlist`, `get-wishlist`, `update-wishlist`, `convert-wishlist`, with instruction docs under `src/modules/task-engine/instructions/`.
- **Strict intake validation** for required fields: `title`, `problemStatement`, `expectedOutcome`, `impact`, `constraints`, `successSignals`, `requestor`, `evidenceRef`; wishlist items cannot carry a Task Engine `phase`.
- **`convert-wishlist`** requires `decomposition` (`rationale`, `boundaries`, `dependencyIntent`) plus one or more workable task payloads (`id`, `title`, `phase`, `approach`, `technicalScope`, `acceptanceCriteria`); source wishlist item is marked **converted** with provenance to created task ids.
- **Planning-scope markers** on task-only surfaces: `scope: "tasks-only"` / `executionPlanningScope` on `list-tasks`, `get-next-actions`, `get-ready-queue`, `get-task-summary`, `get-blocked-summary`; `dashboard-summary` includes `wishlist.openCount` / `wishlist.totalCount` (wishlist never appears in ready-queue JSON).

### Tests

- `test/wishlist-schema.test.mjs` — intake/update validation.
- `test/task-engine.test.mjs` — wishlist create/list/convert integration and queue boundary checks.

## [0.14.0] - 2026-03-27

Phase 13 — Task Engine lifecycle tightening with canonical CRUD/dependency/history/summary command surfaces.

### Added

- Task-engine mutation commands: `create-task`, `update-task`, `archive-task`, `add-dependency`, `remove-dependency`, and planning bridge `create-task-from-plan`.
- Task-engine query commands: `get-dependency-graph`, `get-task-history`, `get-recent-task-activity`, `get-task-summary`, and `get-blocked-summary`.
- New task-engine instruction contracts for all Phase 13 command additions under `src/modules/task-engine/instructions/`.
- Phase 13 test coverage for command registration, CRUD/update/archive paths, dependency mutation behavior, and history retrieval (`test/task-engine.test.mjs`, `test/module-command-router.test.mjs`).

### Changed

- Task store schema now supports mutation evidence via `mutationLog` in addition to transition evidence.
- Task lifecycle queries and dashboard aggregates now exclude archived tasks by default, with `list-tasks` opt-in retrieval via `includeArchived: true`.
- Task engine workbook now includes Phase 13 contracts for mutable/immutable fields, evidence expectations, archival semantics, and extended error taxonomy.

## [0.13.0] - 2026-03-27

Phase 12 — Cursor native UI thin-client delivery and extension trust/test hardening.

### Added

- Cursor extension Node-only test suite under `extensions/cursor-workflow-cannon/test/` covering command-client parsing, workspace detection, task grouping, and integration invocation against real repo `dist/cli.js`.
- Extension operator/security docs: `extensions/cursor-workflow-cannon/docs/e2e.md`, `extensions/cursor-workflow-cannon/SECURITY.md`, and dashboard contract fixture `extensions/cursor-workflow-cannon/docs/fixtures/dashboard-summary.example.json`.
- Additional task-focused palette commands (`Start`, `Complete`, `Block`, `Pause`, `Unblock`) and `Show Task Detail`.

### Changed

- Dashboard view now includes quick actions (refresh, validate config, open tasks/config) and explicit `policy-denied` guidance.
- Config view now supports list/explain/validate and set/unset via `workspace-kit config` command surfaces (no direct file writes).
- Task interactions now include detail rendering from `get-task` contract and guarded transition confirmation prompts.
- Extension status bar now surfaces ready-queue count from `dashboard-summary`.

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
