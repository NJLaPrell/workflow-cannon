# Workflow Cannon Roadmap

Long-range plan and decision log for the Workflow Cannon package and maintainer workflow.

## Scope

- This repository is the canonical home for Workflow Cannon package work.
- The legacy source repository is treated as an external consumer and parity fixture, not as the source of kit implementation.

## Current state

- Project tracking has been reset for the split repository baseline.
- **Phase 0 (foundation) is COMPLETE.** All primary and supporting tasks are done.
- Completed Phase 0 slices: `T178`, `T179`, `T180`, `T181`, `T182`, `T183`, `T196`, `T197`, `T198`, `T206`, `T207`, `T208`, `T209`, `T210`, `T211`, `T212`, `T213`.
- **Phase 1 (Task Engine core) is COMPLETE** and ships as **`v0.3.0`**. Completed slices: `T199`, `T184`, `T185`, `T186`, `T217`.
- **Phase 2 (configuration and policy base) is COMPLETE** and ships as **`v0.4.0`**. Completed slices: `T218`, `T187`, `T200`, `T188`, `T201`, `T189`.
- **Phase 2b is COMPLETE** and ships as **`v0.4.1`** (`T219`–`T220`, `T228`–`T237`).
- **Phase 3 (Enhancement loop MVP) is COMPLETE** in-repo and ships as **`v0.5.0`** (`T190`–`T192`, `T202`–`T203`).
- **Phase 4 (Runtime scale and ecosystem) is COMPLETE** in-repo and ships as **`v0.6.0`** (`T193`–`T195`, `T204`–`T205`, `T238`–`T242`).
- **Phase 5 (Transcript intelligence automation) is COMPLETE** in-repo and ships as **`v0.7.0`** for the initial automation slice (`T244`, `T245`, `T246`, `T247`, `T248`, `T259`).
- **Phase 6 (Automation hardening and response templates)** for **`v0.8.0`**: tracks **6a**–**6c** are **COMPLETE in-repo** (`T249`-`T258`, `T260`-`T266`, `T271`-`T274`); improvement recommendation item `imp-2cf5d881b81f9a` remains proposed.
- **Phase 7 (Architectural hardening)** for **`v0.9.0`** is **COMPLETE in-repo** across **`T275`-`T282`** (documentation/canon fixes, package identity alignment, CLI decomposition, config/runtime hardening, governance-surface cleanup).
- Historical extraction and first-publish milestones remain recorded below as provenance.

## Phase plan and release cadence

Each phase ends with a GitHub release. Phases are sequential unless explicitly re-planned.

For a product-facing view of features by phase, see `docs/maintainers/FEATURE-MATRIX.md`.

### Phase 0 - Foundation hardening -> GitHub release `v0.2.0`

- Primary scope: `T178` to `T183`, plus completed foundation slices `T206` to `T212` and hardening follow-up `T213`.
- Outcome: reliable release gates, consumer parity confidence, and machine-readable parity evidence.
- Exit signals:
  - Release/readiness gates and parity checks are reproducible.
  - Consumer regression checks are release-blocking in CI.
  - Parity evidence artifacts are generated and retained.

### Phase 1 - Task Engine core -> GitHub release `v0.3.0`

- Primary scope: `T184` to `T186` (Task Engine core delivery).
- Outcome: canonical task runtime contract that later modules build on.
- Exit signals:
  - Core task schema/lifecycle stable and documented.
  - Execution state transitions are deterministic and test-covered.

### Phase 2 - Configuration and policy base -> GitHub release `v0.4.0`

- Primary scope: `T218` (workbook), `T187` (config registry), `T200` (config–policy matrix), `T188` (policy baseline), `T201` (local cutover checklist), `T189` (maintainer runbook).
- Outcome: deterministic layered config with agent-first explain paths, policy-governed sensitive operations with traces, documented **local** task-engine cutover (no packaged migration runtime in `v0.4.0`).
- Exit signals:
  - Layered config precedence is explicit, tested, and explainable via `workspace-kit run`.
  - Policy and approval gates enforce on the baseline sensitive operations; traces are machine-readable.
  - Maintainer cutover checklist and runbook exist; optional local rehearsal evidence documented.

### Phase 2b - Config policy hardening + UX / exposure -> GitHub release `v0.4.1` (COMPLETE)

- Primary scope: **`T219`–`T220`** (validation, `resolve-config`, versioned traces, config-driven sensitive ops) and **`T228`–`T237`** (CLI `config` command group, persisted project/user layers, metadata contract, explain/guardrails, generated CONFIG docs, integration tests, optional interactive edit, exposure model, mutation evidence).
- Outcome: stricter config validation and agent-first full effective-config resolution; versioned policy traces and tested sensitive-op extensions; end-user config surfaces that route through the typed registry with safe writes, metadata-driven explain/docs, and audit-friendly mutation records—without weakening default fail-closed posture for undeclared writes.
- Exit signals:
  - Invalid workspace config fails fast with stable, path-qualified errors; resolve output for agents is deterministic and tested.
  - Policy traces carry an explicit schema/version marker and documented reader upgrade notes.
  - Sensitive-operation extensions from effective config are covered by integration tests.
  - `workspace-kit config` list/get/set/unset/explain/validate (and optional `edit`) use canonical resolution and reject invalid mutations before persistence; integration tests and generated `.ai/CONFIG.md` + `docs/maintainers/CONFIG.md` stay aligned with metadata.

### Phase 3 - Enhancement loop MVP -> GitHub release `v0.5.0` (COMPLETE in-repo)

- Primary scope: `T190` to `T192`, with supporting design slices `T202` (heuristic confidence + admission rules) and `T203` (lineage event contract).
- Outcome: evidence-driven **improvement** work is logged as **Task Engine** tasks (`type="improvement"`) and reviewed through a human-governed loop: ingest signals from agent transcripts, git diffs between release tags, policy traces, config mutation evidence, and task-transition evidence; on-demand `generate-recommendations` with an incremental cursor; decisions recorded via the **`approvals`** module; deterministic **evidence-key** dedupe; heuristic confidence; end-to-end **lineage** (recommendation → decision → applied change) with correlation to policy/config traces where available.
- Exit signals:
  - Recommendations appear as actionable task-engine tasks with evidence references, heuristic confidence, and stable `evidenceKey` dedupe across runs.
  - Human decisions are recorded via `approvals`, idempotent where required, and replayable from persisted artifacts.
  - Provenance is traceable recommendation → decision → applied change, with optional linkage into policy traces and config mutation records.

### Phase 4 - Runtime scale and ecosystem -> GitHub release `v0.6.0` (COMPLETE)

- Primary scope: `T193` to `T195`, with support slices `T204`/`T205` and enforcement/operability expansions `T238` to `T242` (compatibility gates + matrix schema, evidence lifecycle controls, release-channel operational mapping, planning-doc consistency guard).
- Outcome: extension-ready and operationally robust platform with fail-closed compatibility and release-channel enforcement.
- Exit signals:
  - Extension/module compatibility controls are enforced in runtime and CI.
  - Operational SLO/supportability controls are active with diagnostics evidence output.
  - Upgrade compatibility guarantees are documented and tested across channels.

### Phase 5 - Transcript intelligence automation -> GitHub release `v0.7.0` (COMPLETE initial slice)

- Primary scope: `T244`, `T245`, `T246`, `T247`, `T248`, `T259`.
- Outcome: manual-first transcript sync and recommendation ingestion UX with explicit cadence/config contracts, rollout-safe design baseline, and maintainers-first operational guidance.
- Baseline artifact: `docs/maintainers/workbooks/transcript-automation-baseline.md`.
- Exit signals:
  - Transcript sync and one-shot ingest command surfaces are implementation-ready from a locked design baseline.
  - Phase 5 rules/docs define event-driven frequent recommendation generation with bounded overhead and no cron requirement for baseline users.
  - Configuration and observability contracts are consistent across module config, workspace config, and runtime command surfaces.

### Phase 6 - Automation hardening and response templates -> GitHub release `v0.8.0` (implementation complete in-repo)

- **Phase 6a — Transcript automation hardening** — primary scope: `T249` to `T258` (**COMPLETE in-repo**). Outcome: bounded frequent runs, autodiscovery, idempotency/dedupe diagnostics, operator status, policy UX for recurring generation, scale/resilience tests, retry queue, ops runbook, privacy/redaction, optional pre-release ingest hook. Runbook: `docs/maintainers/runbooks/transcript-ingestion-operations.md`.
- **Phase 6b — Response template advisory** — primary scope: `T260` to `T266` (**COMPLETE in-repo**). Outcome: advisory response-template contracts, registry, CLI shaping, instruction mapping, config surfaces, observability, tests + maintainer runbook. Contract: `docs/maintainers/response-template-contract.md`; runbook: `docs/maintainers/runbooks/response-templates.md`.
- **Phase 6c — Cursor-native transcript automation** — primary scope: `T271` to `T274` (**COMPLETE in-repo**). Outcome: `package.json` scripts, `.vscode` folder-open sync tasks, maintainer runbook, optional non-blocking post-`completed` transcript sync hook. Runbook: `docs/maintainers/runbooks/cursor-transcript-automation.md`.
- Cross-cutting: active improvement recommendation item `imp-2cf5d881b81f9a` (proposed; policy friction for `generate-recommendations`).
- Combined outcome: hardened transcript automation at higher run frequency/scale with stronger resilience/privacy controls, advisory response-template ergonomics, and editor-native automation that copy-first syncs transcripts before analysis where applicable.
- Phase decisions locked:
  - Release strategy: single release train (`v0.8.0`).
  - Approval UX: configurable, default first-use prompt per sensitive command with `Deny` / `Allow` / `Allow for this session`, and command-scoped session reuse when selected.
  - Response template enforcement: configurable with advisory-only default.
- Exit signals:
  - Frequent transcript sync/ingest operations are bounded, resilient, and diagnosable with stable status surfaces.
  - Privacy/redaction and retry behavior are deterministic and test-covered.
  - Response-template registry, advisory integration, and maintainership workflow are documented, test-covered, and compatible with existing command result semantics.

### Phase 7 - Architectural hardening -> GitHub release `v0.9.0` (COMPLETE in-repo)

- Primary scope: `T275` to `T282`.
- Outcome: reduced architectural and documentation drift, clearer canonical surfaces, and a more maintainable runtime orchestration path for future phases.
- Focus areas:
  - Documentation/index and source-of-truth consistency hardening.
  - Package identity/changelog canon alignment.
  - CLI decomposition and config/runtime maintainability improvements.
  - Governance/policy surface canonicalization and ADR hygiene.
- Exit signals:
  - `T275`-`T282` are complete with updated tests/docs where applicable.
  - Canonical-vs-derived governance/documentation surfaces are explicit and stable.
  - Core runtime hardening changes preserve deterministic behavior and release gate compatibility.

## Recorded decisions

| Decision | Choice |
| --- | --- |
| Project and repository name | Workflow Cannon (`workflow-cannon`) |
| Package name and scope | `@workflow-cannon/workspace-kit` |
| Extraction history strategy | `git subtree split` from `packages/workspace-kit` during cutover |
| Copilot vs Cursor directives model | Keep one profile and maintain both instruction surfaces |
| Upgrade merge strategy | Safe overwrite for kit-owned paths with backup + diff evidence |

## Execution evidence snapshot

- Source-repo freeze commit: `65797d888629d017f3538bd793c5e7cd781edf7d`
- Split commit: `5a1f7038255a2c83e0e51ace07ea0d95a327574c`
- First publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23463225397`
- Phase 1 / `v0.3.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23559535382`
- Phase 2 / `v0.4.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23561237541`
- Phase 4 / `v0.6.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23604173215`
- Phase 5 / `v0.7.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23610374625`
- Phase 6 / `v0.8.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23617262478`
- npm package: `https://www.npmjs.com/package/@workflow-cannon/workspace-kit`
