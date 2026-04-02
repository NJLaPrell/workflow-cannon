# Changelog

All notable changes to `@workflow-cannon/workspace-kit` are documented in this file.

`CHANGELOG.md` at the repository root is pointer-only and must not diverge from this canonical history.

**Strategy:** Canonical history lives **here** (`docs/maintainers/CHANGELOG.md`). The root file is a pointer only. GitHub Releases should paste or link the same sections for each tag.

## [Unreleased]

## [0.39.0] - 2026-04-02

Phase 39 — SQLite persistence hardening (schema versioning, integrity, backup, operator docs).

### Added

- **Centralized kit SQLite migrations** — **`PRAGMA user_version`** with baseline DDL for **`workspace_planning_state`** + **`workspace_module_state`** on open (**`src/core/state/workspace-kit-sqlite.ts`**); shared **`busy_timeout`** (10s) + WAL.
- **`workspace-kit run backup-planning-sqlite`** — Online backup of the planning DB via **`better-sqlite3`** (**`backup-planning-sqlite-runtime.ts`**).
- **`workspace-kit doctor`** — **`PRAGMA quick_check`** for configured SQLite planning DB; persistence summary includes **Kit SQLite schema (`user_version`)** when the file exists.
- **`list-module-states`** — Response includes **`kitSqliteUserVersion`**.
- **ADR** — **`docs/maintainers/ADR-json-persistence-deprecation.md`** (JSON opt-out deprecation direction + future semver-major removal).
- **Runbook** — **`docs/maintainers/runbooks/json-to-sqlite-one-shot-upgrade.md`**.
- **Exports** — **`KIT_SQLITE_USER_VERSION`**, **`prepareKitSqliteDatabase`**, **`readKitSqliteUserVersion`** from **`@workflow-cannon/workspace-kit`** core entry.

### Docs

- **`task-persistence-operator.md`** — backup, **`quick_check`**, **`user_version`**, concurrency notes.

## [0.38.0] - 2026-04-02

Phase 38 — maintainer **kit phase** slice (**`current_kit_phase` 38** in `docs/maintainers/data/workspace-kit-status.yaml`) with **no separate `@workflow-cannon/workspace-kit` npm release**. The published line stayed at **v0.37.0** until **v0.39.0** (Phase 39). This version exists for **phase ↔ semver alignment** in history and tags.

### Notes

- **Queue / docs** — ROADMAP and maintainer snapshots advanced toward Phase 39 (e.g. **v0.37.0** release evidence on **`main`**); no consumer-facing package bump.
- **Install** — Use **v0.37.0** or **v0.39.0** on npm; **v0.38.0** is not published to the registry.
- **Git tag** — **`v0.38.0`** marks the last **`main`** commit before the **v0.39.0** Phase 39 implementation merge (checkpoint only; that tree still reports **`0.37.0`** in **`package.json`**).

## [0.37.0] - 2026-04-02

Phase 37 — maintainer onboarding clarity, shell JSON guidance, improvement churn closure, and dashboard parity for terminal task statuses.

### Added

- **Dashboard payload** — **`dashboard-summary`** includes **`readyImprovementsSummary`**, **`readyExecutionSummary`**, and **`proposedExecutionSummary`** so UIs can list improvement vs execution work separately (Cursor webview groups them under **Tasks**).
- **CLI `.env` loading** — **`workspace-kit`** loads the first **`.env`** found walking up from cwd (**`dotenv`**, **`override: false`**). Repository **`.env.example`** documents **`WORKSPACE_KIT_POLICY_APPROVAL`** for local hook / config mutations; **`.env`** is gitignored.
- **`dashboard-summary` → `completedSummary` / `cancelledSummary`** — phase buckets aligned with the Tasks sidebar; Cursor dashboard renders them in **collapsed** `<details>` until expanded.
- **Onboarding names** — **`README.md`** table (**Workflow Cannon** vs **`@workflow-cannon/workspace-kit`** vs **`wk`** / **`workspace-kit`**); **`docs/maintainers/AGENTS.md`** preamble; **`CONTRIBUTING.md`**; **`TERMS.md`** product vs package entry.
- **`AGENT-CLI-MAP.md`** — **Shell scripts and JSON stdout** (full stdout parse, stderr, **`clientMutationId`**, parse vs **`ok: false`**).
- **Runbook** — **`docs/maintainers/runbooks/improvement-lifecycle-churn-notes.md`** (queue-health “noisy improvement” follow-ups).

### Changed

- **Post-completion transcript hook** — When **`improvement.hooks.afterTaskCompleted`** is **`ingest`**, the spawned child passes **`policyApproval`** from **`WORKSPACE_KIT_POLICY_APPROVAL`** (JSON) plus **`forceGenerate: true`** so **`ingest-transcripts`** syncs and always runs recommendation generation; invalid/missing env falls back to **`sync-transcripts`** with a logged skip reason (**`src/core/transcript-completion-hook.ts`**).
- **Cursor extension** — **`pnpm-workspace.yaml`** adds **`extensions/cursor-workflow-cannon`** as a workspace package; removed nested **`package-lock.json`**; **`ext:compile`** / **`ui:watch`** use **`pnpm --filter cursor-workflow-cannon`**. **`@types/vscode`** is a **root** `devDependency` so `tsc` resolves the **`vscode`** API under pnpm. **CI** runs extension **`check`** + **`compile`** after **`pnpm test`**. Maintainer docs: **`CONTRIBUTING.md`**, extension **`README.md`**, **`docs/e2e.md`**.

## [0.36.0] - 2026-04-01

Phase 36 — policy, integrations, improvement loop, and documentation architecture (**`T491`–`T524`** and related maintainer harnesses).

### Added

- **Agent/machine doc split** — **`.ai/machine-cli-policy.md`**, **`.ai/WORKSPACE-KIT-SESSION.md`**, **`.ai/MACHINE-PLAYBOOKS.md`**, **`.ai/LONG-SESSION-RELOAD.md`**; **`.ai/AGENTS.md`** refs repointed off `docs/maintainers/*` for routine agent operations; root **`AGENTS.md`** and Cursor rules updated accordingly.
- **Policy rehearsal** — **`generate-recommendations`** supports **`dryRun: true`** (skips sync + persistence); trace messages prefixed **`policy-rehearsal`**; ADR **`ADR-policy-rehearsal-dry-run.md`**.
- **`list-tasks` filters** — **`confidenceTier`**, **`blockedReasonCategory`**; ADR **`ADR-blocked-reason-category-v1.md`**.
- **Improvement metadata** — **`metadata.transcriptSourceRelPath`** on transcript-sourced recommendations.
- **Config registry data** — **`src/core/config-registry.json`** loaded by **`config-metadata.ts`** (thin TypeScript wrapper).
- **Maintainer scripts** — **`pnpm run export-evidence-bundle`**, **`playbook-run-steps`**, **`lint-response-templates`** (opt-in env), **`generate-kit-trust-boundary`**.
- **Examples** — **`examples/playbooks/pilot-task-to-main.json`**, **`examples/cross-repo-parity-matrix.mjs`**, **`examples/github-check-sample/`**.
- **Runbook** — **`docs/maintainers/runbooks/ide-kit-status-protocol.md`**.
- **ROADMAP archive** — **`docs/maintainers/ROADMAP-archive.md`**; shortened **`ROADMAP.md`** “Current state”.
- **Ideation doc** — moved to **`docs/exercises/workflow-cannon-feature-ideation.md`**; repo-root **`PLAN.md`** stub pointer.

### Docs

- **FEATURE-MATRIX** orientation header; **TERMS** entries for **`transcriptSourceRelPath`** / **`blockedReasonCategory`**; **module-build-guide** workbook pairing; **POLICY-APPROVAL** rehearsal cross-link; **task-to-main** playbook runner note.

### Task engine note

- **`T494`** (split **`task-engine-internal.ts`** / **`cli.ts`**) was **`cancelled`** in task-engine state for this phase timebox; re-scope as smaller follow-up tasks if still desired.

## [0.35.0] - 2026-04-01

Phase 35 — task engine, queue operations, and planning handoff (**`T507`**, **`T510`**, **`T513`**, **`T520`**, **`T523`**).

### Added

- **`queue-git-alignment`** — Read-only JSON: git HEAD vs latest transition timestamp, optional stale **`in_progress`** hints (**`queue-git-alignment.ts`**); runbook cross-link in **`agent-task-engine-ergonomics.md`**.
- **`replay-queue-snapshot`** — Read-only **`get-next-actions`** replay from inline **`tasks[]`** or **`snapshotRelativePath`**; **`replay-queue-snapshot.ts`**; caveat text for code/snapshot skew.
- **Queue namespace filter** — Optional **`metadata.queueNamespace`**; **`get-next-actions`** / **`get-ready-queue`** / replay accept **`queueNamespace`**; ADR **`ADR-task-queue-namespace.md`**.
- **Maintainer harness** — **`scripts/task-engine-synthetic-load.mjs`** (not **`pnpm test`**) — synthetic tasks + **`list-tasks`** timing tripwire.
- **Planning handoff** — **`planning-workflow.md`** implementation estimate pack (human-owned **`metadata.implementationEstimatePack`**); **`convert-wishlist`** example + **`explain-task-engine-model`** optional field hints.

### Docs / contracts

- **Schemas** — **`task-engine-run-contracts.schema.json`** **`0.35.0`**; **`queueNamespace`** on **`get-next-actions`** / **`get-ready-queue`** responses.
- **Agent CLI map exclusions** — **`queue-git-alignment`**, **`replay-queue-snapshot`**.

## [0.34.0] - 2026-04-01

Phase 34 — Cursor extension and consumer experience (**`T505`**, **`T506`**, **`T511`**, **`T518`**).

### Added

- **`explain-config` facets** — JSON arg **`facet`** (`tasks`, `planning`, `improvement`, `kit`, `modules`, `policy`, `responseTemplates`) returns bounded **`entries[]`** per registered key; mutually exclusive with **`path`** (**`src/core/config-facets.ts`**, **`workspace-config`** module).
- **`dashboard-summary` → `dependencyOverview`** — Active-task dependency subgraph (same edge direction as **`get-dependency-graph`**), optional Mermaid source, **`criticalPathReady`** chain, truncation + perf note when there are many active tasks (**`dashboard-dependency-overview.ts`**).
- **Extension dashboard** — Renders dependency overview + **planning session** resume card (empty/stale copy + **`resumeCli`**); **`docs/e2e.md`** checklist for large queues and **`build-plan`** refresh behavior.

### Changed

- **README** — Consumer quick start adds an explicit read-only first lap (**`doctor`**, **`run`**, **`get-next-actions`**) for **`npx workspace-kit`** installs.

### Docs / contracts

- **Instructions** — **`explain-config.md`**, **`dashboard-summary.md`** updated for facet + **`dependencyOverview`**.
- **Schemas** — **`task-engine-run-contracts.schema.json`** **`packageVersion`** **`0.34.0`**; **`dependencyOverview`** required on **`dashboard-summary`** response contract.

## [0.33.0] - 2026-03-31

Phase 33 — documentation, editor integration, and CLI ergonomics (**`T455`**, **`T459`**, **`T460`**, **`T461`**, **`T462`**, **`T463`**, **`T464`**, **`T469`**).

### Added

- **Scripts** — **`scripts/run-check-stages.mjs`** stages **`pnpm run check`** with labeled steps and failure hints; **`scripts/check-principles-rule-snapshot.mjs`** + **`scripts/fixtures/principles-rule-ids.json`**; **`scripts/check-governance-doc-order.mjs`** + **`scripts/fixtures/governance-doc-order.json`** (AGENTS § Source-of-truth path order).
- **Gates** — **`pnpm run maintainer-gates`** and **`pnpm run pre-merge-gates`** as intention-revealing names; **`phase4-gates`** / **`phase5-gates`** remain aliases.
- **Docs** — README **New contributors** path (≤5 hops to a safe **`run-transition`**); AGENTS **documentation tiers**, **canonical vs mirror**, expanded **`/qt`** warning; **`docs/maintainers/module-build-guide.md`** Cursor rules policy; **`docs/maintainers/DECISIONS.md`** governance/drift decision; **`docs/maintainers/RELEASING.md`** principles edit order + gate names; **`tasks/*.md`** kit-invocation reminder block; consumer cadence **`/qt`** note.

### Changed

- **CLI** — Unknown **`workspace-kit run`** subcommand errors list a capped sample of commands plus discovery hints (**`src/core/module-command-router.ts`**); top-level **`--help`** states command discovery explicitly (**`src/cli.ts`**).
- **Cursor** — **`.cursor/rules/maintainer-delivery-loop.mdc`** slimmed to pointer-first (full loop in **`task-to-main.md`** / **`AGENTS.md`**).
- **Schemas** — **`task-engine-run-contracts.schema.json`** **`packageVersion`** **`0.33.0`**.

## [0.32.0] - 2026-03-31

Phase 32 — architecture boundaries and platform surfaces (**`T456`**, **`T457`**, **`T458`**).

### Added

- **R102 CI** — **`scripts/core-module-layer-allowlist.json`** + **`scripts/check-core-module-layer-allowlist.mjs`**; wired into **`pnpm run check`**.
- **Docs** — **`module-build-guide.md`** escalation path for new core→module edges; **`ARCHITECTURE.md`** Mermaid for planning module vs task-engine persistence; **`TERMS.md`** **Build-plan session file**; **`src/modules/planning/README.md`** “where state lives” table; **`AGENT-CLI-MAP.md`** response-template subsection.

### Changed

- **Response templates** — **`response-template-contract.md`** and **`runbooks/response-templates.md`** match code precedence (manifest default before config default); strict **`response-template-invalid`** / **`response-template-conflict`** messages include resolution source and directive field names (**`src/core/response-template-shaping.ts`**).
- **Tests** — **`test/phase6b-response-templates.test.mjs`** asserts message substrings for strict failures.
- **Schemas** — **`task-engine-run-contracts.schema.json`** **`packageVersion`** **`0.32.0`**.

## [0.31.0] - 2026-03-31

Phase 31 — policy, approvals, and sensitivity (**`T454`**, **`T453`**, **`T468`**).

### Added

- **Manifest** — every **`builtin-run-command-manifest.json`** row declares **`policySensitivity`** (`non-sensitive` | `sensitive` | `sensitive-with-dryrun`); CI enforces consistency with **`policyOperationId`** and doc dry-run rules.
- **Maintainer guide** — **`docs/maintainers/how-to-mark-policy-sensitive-run-command.md`** (how to classify new **`workspace-kit run`** commands).
- **Policy helpers** — repo-relative doc anchors **`POLICY_APPROVAL_TWO_LANES_DOC`**, **`POLICY_APPROVAL_RUN_CANONICAL_DOC`**, wrong-lane copy in **`src/core/policy.ts`**.
- **Tests** — **`test/policy-manifest-sensitivity.test.mjs`** (manifest vs **`isSensitiveModuleCommand`**); Phase 31 wrong-lane denial in **`test/phase11-architectural-followup.test.mjs`**.

### Changed

- **`workspace-kit run`** — clearer **`policy-denied`** when **`WORKSPACE_KIT_POLICY_APPROVAL`** is set but JSON **`policyApproval`** is missing on a sensitive command; shorter invalid/missing messages with links to the two-lane table.
- **`workspace-kit doctor`** — when env approval is set, prints a one-line reminder that it does not apply to **`run`**.
- **Documentation** — **`POLICY-APPROVAL.md`** canonical approval section; **`AGENT-CLI-MAP.md`** two-lane subsection; **`CLI-VISUAL-GUIDE.md`** wrong-lane recovery; **`AGENTS.md`** pointer; **`cli.ts`** config/init denial text uses two-lane anchor.
- **Schemas** — **`task-engine-run-contracts.schema.json`** **`packageVersion`** **`0.31.0`**.

## [0.30.0] - 2026-03-31

Phase 30 — persistence, packaging, and task-store evolution (**`T450`–`T452`**, **`T466`**, **`T467`**).

### Added

- **ADR** — **`docs/maintainers/ADR-native-sqlite-consumer-distribution.md`**, **`ADR-task-store-sqlite-document-model.md`**, **`ADR-task-store-schemaversion-policy.md`**.
- **Runbooks** — **`docs/maintainers/runbooks/native-sqlite-consumer-install.md`**, **`docs/maintainers/runbooks/task-persistence-operator.md`**.
- **Task Engine** — **`task-store-migration.ts`**: accept **`schemaVersion` `2`** on read (no-op forward label); normalize to **`1`** for runtime and JSON save.
- **CLI** — **`workspace-kit doctor`**: dynamic **`better-sqlite3`** import when **`tasks.persistenceBackend`** is **`sqlite`** (clearer failure when the native addon cannot load); post-pass lines for effective persistence backend and canonical paths.

### Changed

- **Documentation** — Wishlist workflow runbook (**which id to create**), **TERMS**, **README**, **AGENT-CLI-MAP**, **AGENTS** (native SQLite pointer), **consumer cadence** runbook (persistence map link), **task-engine workbook** (persistence + schema policy).
- **Schemas** — **`schemas/task-engine-run-contracts.schema.json`** `packageVersion` const aligned with **`package.json`** (**`0.30.0`**).

## [0.29.0] - 2026-03-31

Phase 28 — maintainer and agent operability: read-only **`queue-health`** audit, canonical **`kit.currentPhaseNumber`** / **`kit.currentPhaseLabel`** config keys (with **`workspace-kit doctor`** mismatch detection vs **`workspace-kit-status.yaml`**), optional **`phaseKey`** on tasks, **`list-tasks`** **`phaseKey`** filter and **`includeQueueHints`**, short **`wk`** bin alias alongside **`workspace-kit`**, and glossary/README cross-links disambiguating **planning module (CLI)** vs **planning persistence (task engine)** (**`T392`**, **`T443`–**`T449`**).

### Added

- **Task Engine** — **`workspace-kit run queue-health '{}'`**: ready-queue phase alignment + unmet **`dependsOn`** on **`ready`** tasks in one JSON payload.
- **Task Engine** — **`list-tasks`**: optional **`includeQueueHints`**, **`phaseKey`** filter, and optional **`TaskEntity.phaseKey`** on create/update.
- **Config** — **`kit.currentPhaseNumber`**, **`kit.currentPhaseLabel`** (maintainer; documented in generated **`CONFIG.md`**).
- **CLI** — Published **`wk`** bin (same **`dist/cli.js`** as **`workspace-kit`**).

### Documentation

- **`docs/maintainers/AGENT-CLI-MAP.md`** — Queue health / consistency section; Tier C examples include **`queue-health`**.
- **`docs/maintainers/TERMS.md`**, **`src/modules/planning/README.md`**, **`src/modules/task-engine/README.md`** — Planning vs persistence disambiguation + **`phaseKey`** term.
- **README** / **`docs/maintainers/README.md`** — Clone flow uses **`pnpm run wk …`** (root **`package.json`** **`wk`** script → **`dist/cli.js`**) because `pnpm exec` does not resolve the workspace package’s own bins; use **`pnpm run wk run <cmd> '<json>'`** for module commands (avoid **`pnpm run wk -- run …`**, which forwards a literal `--`). Published installs use **`wk`** / **`workspace-kit`** on `PATH`.

## [0.28.0] - 2026-03-31

Phase 27 — transcript improvement execution closeout: nine **`ready`** **`imp-*`** items addressed via maintainer runbook **`docs/maintainers/runbooks/agent-task-engine-ergonomics.md`** (Git vs task-engine completion, read-only kit inspection, planning vs execution queue, improvement listing, product vs implementation maps, task-engine public **`index.ts`** surface, **`agent-behavior`** soft layer vs policy/principles, extension thin client vs CLI). ROADMAP + FEATURE-MATRIX milestone rows aligned.

### Documentation

- **`docs/maintainers/runbooks/agent-task-engine-ergonomics.md`** — Phase 27 ergonomics runbook with transcript **`evidenceKey`** verification table.
- **`docs/maintainers/AGENT-CLI-MAP.md`** — Optional session opener clarifies **`suggestedNext`** vs **`get-task`**.
- **`docs/maintainers/AGENTS.md`** — Links the new runbook from long-session / discovery context.

## [0.27.0] - 2026-03-31

Phase 26 — module platform + improvement execution closeout (**`T388`**, **`T389`**, **`T391`**, **`T393`**, **`T440`–`T442`**, **`T390`**); transcript hook / policy ergonomics (**`imp-c584f0e206c404`**, **`imp-df7ebd9967433c`**); sensitive-run denial messaging already explicit for malformed **`policyApproval`** (**`imp-5dc1ffa28ccdc3`**).

### Added

- **Contracts** — **`builtin-run-command-manifest.json`** (+ **`builtin-run-command-manifest.ts`**): canonical shipped `workspace-kit run` commands (instruction file, optional **`policyOperationId`**, optional **`defaultResponseTemplateId`**); consumed by module registrations, **`src/core/policy.ts`**, response-template resolution, and CI check scripts.
- **Task Engine** — **`mutation-utils.ts`**: shared idempotency, metadata path, and wishlist conversion helpers used by **`task-engine-internal.ts`** (smaller dispatch module).
- **Task Engine** — **`demote`** transition on **`run-transition`**: **`ready` → `proposed`** (return work to triage without **`cancel`**).

### Fixed

- **Pre-release / package scripts** — `scripts/pre-release-transcript-hook.mjs` and `scripts/run-transcript-cli.mjs` merge **`WORKSPACE_KIT_POLICY_APPROVAL`** JSON into **`ingest-transcripts`** CLI args as **`policyApproval`** so headless ingest matches maintainer intent (the `run` path does not read that env var directly).

### Documentation

- **Maintainer workbooks** — Transcript baseline: improvement lifecycle + triage/demote pointers; cadence **`decision`** operator matrix. Task-engine workbook: SQLite-default persistence, **`demote`** in transition table, state diagram note.
- **`src/modules/task-engine/README.md`** — Persistence, layout (`mutation-utils`), and lifecycle cross-links aligned with shipped behavior.
- **`docs/maintainers/ARCHITECTURE.md`** — Default module bundle includes **`agent-behavior`**; builtin run commands and policy bindings are sourced from **`builtin-run-command-manifest.json`**; layering section cross-links **`.ai/module-build.md`** rule **R102** and facade exceptions.
- **`docs/maintainers/module-build-guide.md`** — Explicit **shipped selective re-exports** snapshot under barrel policy.
- **`T390`** — **`src/README.md`** documents **R102** vs approved **`core`** facades; **`.ai/ARCHITECTURE.md`** task-store refs align with SQLite default + JSON opt-out; documentation template Related-docs validation avoids duplicate task-store paths.
- **`docs/maintainers/AGENTS.md`** — Native **`better-sqlite3`** portability / rebuild guidance (postinstall **`ensure-native-sqlite.mjs`**).
- **`POLICY-APPROVAL.md`**, **`RELEASING.md`**, **`runbooks/cursor-transcript-automation.md`**, **`runbooks/transcript-ingestion-operations.md`** — env → JSON bridging for **`pre-release-transcript-hook`** and **`pnpm run transcript:ingest`**.

## [0.26.0] - 2026-03-30

### Fixed (maintainer / CI)

- **Parity runner** — `scripts/run-parity.mjs` fixture `npm install` timeout raised (60s → 300s) so native `better-sqlite3` builds on cold GitHub Actions runners do not abort **Publish NPM** during the parity step.

### Documentation

- **Agent playbooks / direction sets** (`T433`–`T439`) — TERMS + `docs/maintainers/playbooks/` (README, pilot `phase-closeout-and-release`), `AGENTS.md` discovery table + optional requestable `.cursor/rules/playbook-phase-closeout.mdc`, `tasks/phase-closeout.md` `/qt` template, `runbooks/agent-playbooks.md`; FEATURE-MATRIX + ROADMAP Phase 25 closeout.
- **CLI visual guide** — `docs/maintainers/CLI-VISUAL-GUIDE.md` (ASCII topology + Mermaid: top-level commands, agent decision flow, approval lanes, default module router). Linked from README, `AGENTS.md`, `AGENT-CLI-MAP.md`, `ARCHITECTURE.md`; machine ref in `.ai/AGENTS.md`.

## [0.25.0] - 2026-03-30

### Changed

- **Breaking:** `tasks.persistenceBackend` now defaults to **`sqlite`** (was `json`). New kit defaults include `tasks.sqliteDatabaseRelativePath`, `tasks.wishlistStoreRelativePath`, and `persistenceBackend` in `KIT_CONFIG_DEFAULTS`. Operators upgrading from JSON-only stores must run **`workspace-kit run migrate-task-persistence`** with `direction: "json-to-sqlite"` or set **`tasks.persistenceBackend: "json"`** to remain on files. **`workspace-kit doctor`** continues to fail when SQLite is selected and the database file is missing.
- **Agent-behavior:** When using SQLite, if the `agent-behavior` module row is absent, load falls back to `.workspace-kit/agent-behavior/state.json` once (parity with improvement operational state file fallback).

### Documentation

- ADR: `docs/maintainers/ADR-sqlite-default-persistence.md`. Updates to `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `ADR-task-sqlite-persistence.md`, task-engine `config.md` / `migrate-task-persistence` instruction.

## [0.24.0] - 2026-03-30

Phase 24 — unified task intake (`T425`–`T432`): wishlist ideation is **`wishlist_intake`** tasks (`T###`); optional `metadata.legacyWishlistId` for migrated `W###` provenance; one-time **`migrate-wishlist-intake`**; SQLite planning can drop the legacy wishlist JSON column; improvement **operational** state reads/writes the unified SQLite module-state row when `tasks.persistenceBackend` is `sqlite`.

### Added

- **`wishlist_intake` task type** with metadata intake fields and `get-next-actions` / `get-ready-queue` exclusion from execution suggestions.
- **`migrate-wishlist-intake`** command — migrates legacy wishlist rows into tasks and shrinks SQLite planning schema when applicable.
- **Improvement state in unified DB** — `loadImprovementState` / `saveImprovementState` use `workspace_module_state` for module id `improvement` when SQLite task persistence is enabled (file fallback retained).

### Changed

- **Breaking**: `create-wishlist` without `id` allocates a **`T###`** task; `planning` `build-plan` wishlist finalize returns `taskId` / `wishlistId` as that **`T###`**. `convert-wishlist` accepts **`wishlistTaskId`** (`T###`) or legacy **`wishlistId`** (`W###` when provenance exists).
- **SQLite planning**: new databases use **task-only** `workspace_planning_state`; legacy dual-column rows remain readable until migration.

### Migration

- After upgrade, run `workspace-kit run migrate-wishlist-intake '{}'` once per workspace (use `dryRun: true` first). See ADR `docs/maintainers/ADR-unified-task-store-wishlist-and-improvement-state.md`.

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
