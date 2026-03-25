# Changelog

All notable changes to `@workflow-cannon/workspace-kit` are documented in this file.

## [0.3.0] - 2026-03-25

Phase 1 (Task Engine core) release. Adds a canonical task lifecycle, file-backed persistence, module commands, and generated TASKS.md.

### Added

- **Task Engine module** — Six-state lifecycle (`proposed`, `ready`, `in_progress`, `blocked`, `completed`, `cancelled`), allowed-transition map, `TransitionValidator` with built-in `state-validity` and `dependency-check` guards, and optional custom guards.
- **Persistence** — `TaskStore` at `.workspace-kit/tasks/state.json` (schema version 1), atomic save, transition log.
- **Transition runtime** — `TransitionService` with `run-transition`, dependency enforcement, auto-unblock of dependents when dependencies complete, and structured `TransitionEvidence` per transition.
- **Module commands** — `get-task`, `list-tasks`, `get-ready-queue`, `import-tasks`, `generate-tasks-md`, `get-next-actions` (plus `run-transition`), wired through `workspace-kit run`.
- **TASKS.md import and generation** — One-time markdown import; generated read-only TASKS.md from engine state.
- **Next-action suggestions** — Priority-sorted ready queue, suggested next task, state summary, blocking analysis.
- **Design workbook** — `docs/maintainers/task-engine-workbook.md` (binding Phase 1 contract).
- **Exports** — Task engine types, store, service, guards, and helpers from package `modules` entry.

### Changed

- **Task engine registration** — Module version `0.3.0`; seven instruction entries with backing markdown files.
- **Tests** — New `test/task-engine.test.mjs`; router/CLI expectations updated for implemented task-engine commands.

### Migration notes

- **New runtime state** — First use creates `.workspace-kit/tasks/` when importing or transitioning. Existing hand-edited `docs/maintainers/TASKS.md` can be imported once via `import-tasks`; thereafter prefer `generate-tasks-md` for the human view.
- **CLI** — `workspace-kit run run-transition` without JSON args now returns structured `invalid-task-schema` (exit code 1) instead of `command-not-implemented` (exit 3).

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
