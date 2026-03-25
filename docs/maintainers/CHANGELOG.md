# Changelog

All notable changes to `@workflow-cannon/workspace-kit` are documented in this file.

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
- **Maintainer docs** — `docs/maintainers/config-policy-matrix.md`, `task-engine-cutover-checklist.md`, `task-engine-cutover.md` (aligned with `phase2-config-policy-workbook.md`).

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
- **Module commands** — `run-transition`, `get-task`, `list-tasks`, `get-ready-queue`, `get-next-actions`, `import-tasks`, `generate-tasks-md` exposed through the module command router and `workspace-kit run`.
- **TASKS.md bridge** — One-time `import-tasks` from legacy markdown; `generate-tasks-md` produces a read-only human view aligned with maintainer task format.
- **Next-action suggestions** — Priority-sorted ready queue with blocking-chain context for agent workflows.
- **Design workbook** — `docs/maintainers/task-engine-workbook.md` capturing schema, transition graph, guards, persistence, and error taxonomy.

### Changed

- Task-engine module registration now provides full `onCommand` implementation and expanded instruction entries.

### Migration notes

- Existing workflows that only used documentation and core CLI commands are unaffected.
- To adopt the engine, run `import-tasks` once if migrating from hand-maintained `docs/maintainers/TASKS.md`, then use transitions and regenerate the markdown view as needed.
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
