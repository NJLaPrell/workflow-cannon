# Workflow Cannon Roadmap

Long-range plan and decision log for the Workflow Cannon package and maintainer workflow.

<!-- GENERATED: do not hand-edit. Source: `src/modules/documentation/data/roadmap-data.json`, `roadmap-phase-sections.md`, `feature-taxonomy.json`. Regenerate: `pnpm run wk run generate-document '{"documentType":"ROADMAP.md"}'`. -->

## Scope

- This repository is the canonical home for Workflow Cannon package work.
- The legacy source repository is treated as an external consumer and parity fixture, not as the source of kit implementation.

## Current state

- **Completed phases 0–35** — per-phase narrative is archived in **[`ROADMAP-archive.md`](./ROADMAP-archive.md)** so this file stays short; release evidence and the detailed phase plan below remain here.
- **Phase 41 (relational SQLite task store)** shipped as **`v0.41.0`** — **`T540`–`T545`**: ADR, **`task_engine_tasks`** + envelope columns, **`SqliteDualPlanningStore`** row persistence, **`sqlite-blob-to-relational`** migration, doctor/runbooks/CI parity; see **`docs/maintainers/CHANGELOG.md`** and **[`ADR-relational-sqlite-task-store.md`](./ADR-relational-sqlite-task-store.md)**.
- **Phase 42 (maintainer workspace phase snapshot)** shipped as **`v0.42.0`** — **`T546`**, **`T547`**: **`update-workspace-phase-snapshot`**, doctor remediation, maintainer/agent docs; **`task-engine`** **`0.8.0`** in **`compatibility-matrix.json`**.
- **Phase 43 (platform and maintainability refactors)** shipped as **`v0.43.0`** — **`T548`–`T555`**: SQLite migration runbook, task-engine / CLI decomposition, doc canon + invocation guard, policy registry alignment, extension **`dashboard-summary`** shared types, **`assign-task-phase`** / **`clear-task-phase`**; **`task-engine`** **`0.9.0`** in **`compatibility-matrix.json`**.
- **Phase 44 (planning generation + extension Tasks DnD + next-actions deps)** shipped as **`v0.44.0`** — **`T571`**, **`T557`–`T559`**, **`T573`–`T577`**: SQLite **`planning_generation`** (**`user_version` 3**), optional **`expectedPlanningGeneration`** on mutating commands, **`planningGeneration`** on reads, dependency-aware **`get-next-actions`**, Cursor extension Tasks tree drag-and-drop + **`tasks-tree-dnd.md`**; ADR **`ADR-planning-generation-optimistic-concurrency.md`**; **`task-engine`** **`0.10.0`** in **`compatibility-matrix.json`**.
- **Phase 45 (planningGenerationPolicy + tests + extension + audit + idempotency docs)** shipped as **`v0.45.0`** — **`T578`–`T584`**: config **`tasks.planningGenerationPolicy`** (**`off`** / **`warn`** / **`require`**), **`planning-generation-required`**, doctor line, read payloads include **`planningGenerationPolicy`**, maintainer **`.workspace-kit/config.json`** uses **`require`**, Cursor dashboard + DnD pass **`expectedPlanningGeneration`**, improvement **`generate-recommendations`** / planning **`build-plan`** gates, persisted-config validation for **`tasks.strictValidation`** + **`planningGenerationPolicy`**, ADR appendix (**`T580`**) + **`AGENT-CLI-MAP`** / runbook updates (**`T579`**); **`task-engine`** **`0.11.0`** in **`compatibility-matrix.json`**.
- **Phase 46 (roadmap data generation + task features)** shipped as **`v0.46.0`** — **`T591`–`T598`**: JSON Schema–validated **`roadmap-data.json`** / **`feature-taxonomy.json`**, deterministic **`ROADMAP.md`** + **`FEATURE-TAXONOMY.md`** generation, CI validation + ROADMAP drift gate; relational **`features_json`** (**`user_version` 4**), **`create-task`** / **`update-task`** / **`list-tasks`** **`features`** filter; **`task-engine`** **`0.12.0`**, **`documentation`** **`0.4.0`** in **`compatibility-matrix.json`**.
- **Phase 47 (agent guidance profile)** shipped as **`v0.47.0`** — **`T585`–`T590`**: ADR **`ADR-agent-guidance-profile-rpg-party-v1.md`**, **`kit.agentGuidance.*`** config keys, **`resolve-agent-guidance`** / **`set-agent-guidance`**, **`resolve-behavior-profile`** **`agentGuidance.advisoryModulation`**, dashboard tier card; **`workspace-config`** **`0.5.0`**, **`task-engine`** **`0.13.0`**, **`agent-behavior`** **`0.2.0`** in **`compatibility-matrix.json`**.
- **Phase 48 (wishlist intake agent workflow)** shipped as **`v0.48.0`** — **`T604`–`T607`**: maintainer playbook **`wishlist-intake-to-execution`**, **`list-wishlist`** / **`get-wishlist`** instruction alignment (unified SQLite intake), requestable Cursor rule **`.cursor/rules/playbook-wishlist-intake-to-execution.mdc`**, discovery updates in **`AGENTS.md`**, **`playbooks/README.md`**, **`agent-playbooks.md`**, **`.ai/MACHINE-PLAYBOOKS.md`**.
- **Phase 36 (policy, integrations, improvement loop, documentation architecture)** shipped as **`v0.36.0`** — see **`docs/maintainers/CHANGELOG.md`** and task-engine `phaseKey` **36** completion.
- **Phase 37 (maintainer onboarding, shell JSON guidance, improvement churn closure, dashboard terminal parity)** shipped as **`v0.37.0`** — see **`docs/maintainers/CHANGELOG.md`** and task-engine `phaseKey` **37** completion (`imp-*` slice).
- **Maintainer snapshot** — `docs/maintainers/data/workspace-kit-status.yaml` (`current_kit_phase`, `next_agent_actions`).
- **Execution queue** — canonical task-engine store (default `.workspace-kit/tasks/workspace-kit.db`; JSON opt-out `.workspace-kit/tasks/state.json`); use `pnpm run wk run list-tasks` / `get-next-actions` rather than inferring phase from prose alone.
- **Product / feature inventory** — **`docs/maintainers/FEATURE-MATRIX.md`**.
- Historical extraction and first-publish milestones remain recorded below as provenance.

## Product feature taxonomy

Stable **slugs** for task ↔ feature mapping (see [`FEATURE-TAXONOMY.md`](./FEATURE-TAXONOMY.md) for usage).

| Category | Slug | Feature | Covers |
| --- | --- | --- | --- |
| Task engine & queue | `task-schema` | Task schema & envelopes | IDs, types, phase labels, priority, scope, acceptance criteria |
| Task engine & queue | `task-lifecycle` | Lifecycle transitions | Status machine, demotions, transition evidence |
| Task engine & queue | `task-guards` | Guards & validation | State validity, dependency checks, policy hooks on transitions |
| Task engine & queue | `task-dependencies` | Dependencies & unblock | dependsOn, blocked → ready cascades |
| Task engine & queue | `next-actions` | Next-actions & queue intelligence | get-next-actions, blocking analysis, ordering, queue namespaces |
| Task engine & queue | `task-mutations` | Task mutations & history | create/update, transition logs, introspection commands |
| Persistence & planning store | `task-persistence` | Task persistence backends | SQLite blob vs relational rows, dual-planning stores |
| Persistence & planning store | `store-migrations` | Migrations & recovery | user_version, migration commands, operator recovery |
| Persistence & planning store | `planning-concurrency` | Planning generation & concurrency | planningGeneration, expectedPlanningGeneration, idempotency |
| Config, policy & trust | `config-model` | Config model & resolution | Registry, precedence, explain/resolve, generated CONFIG docs |
| Config, policy & trust | `config-cli` | Config CLI & layers | Project/user layers, validation, safe writes, mutation evidence |
| Config, policy & trust | `policy-registry` | Sensitive operations & policy registry | Gated ops, extension from effective config, CLI tiering |
| Config, policy & trust | `approvals` | Approvals & decision records | Decisions on recommendations and sensitive flows |
| Config, policy & trust | `policy-traces` | Policy traces & versioning | Trace schema, upgrade notes, audit output |
| Improvement loop & signals | `recommendations` | Recommendation generation | generate-recommendations, cursors, cadence |
| Improvement loop & signals | `evidence-dedupe` | Evidence & deduplication | evidenceKey, provenance, confidence/heuristics |
| Improvement loop & signals | `improvement-triage` | Improvement backlog & triage | proposed → ready, churn signals, maintainer rubrics |
| Transcripts & automation | `transcript-sync` | Transcript sync & privacy | Paths, redaction, storage boundaries |
| Transcripts & automation | `automation-hooks` | Editor & CI automation hooks | Cursor/VS Code tasks, optional hooks |
| CLI, modules & agent surfaces | `module-platform` | Command router & module platform | Enable/disable, dispatch, startup contracts |
| CLI, modules & agent surfaces | `instructions` | Instructions & machine operability | instructions/*.md, JSON shapes, agent-first flows |
| CLI, modules & agent surfaces | `response-templates` | Response templates | Registry, advisory enforcement, result shaping |
| CLI, modules & agent surfaces | `agent-behavior` | Agent behavior profiles | Resolve/interview behavior (advisory; not permission) |
| Docs, playbooks & maintainer UX | `doc-generation` | Documentation generation | document-project, template validation, .ai pairing |
| Docs, playbooks & maintainer UX | `playbooks` | Playbooks, runbooks, TERMS | Direction sets, ops procedures, glossary alignment |
| Extension & human visibility | `cursor-extension` | Cursor extension & dashboard | Tasks UI, DnD, dashboard-summary, human-visible store fields |
| Release, quality & consumers | `doctor-diagnostics` | Doctor & diagnostics | wk doctor, persistence map, phase snapshot alignment |
| Release, quality & consumers | `ci-guards` | Check pipeline & CI gates | pnpm run check, instruction coverage, contract guards |
| Release, quality & consumers | `release-versioning` | Release & versioning | Tags, changelog, phase closeout evidence |
| Release, quality & consumers | `consumer-parity` | Consumer parity & compatibility | Compatibility matrix, packaged checks, native SQLite consumer |

## Phase plan and release cadence

Each phase ends with a GitHub release. Phases are sequential unless explicitly re-planned.

For a product-facing view of features by phase, see `docs/maintainers/FEATURE-MATRIX.md`.

### Phase 48 - Wishlist intake agent workflow -> GitHub release `v0.48.0` (COMPLETE)

- **Primary scope:** **`T604`–`T607`** — playbook **`wishlist-intake-to-execution.md`** composes **`wishlist-workflow.md`**, **`convert-wishlist`**, **`AGENT-CLI-MAP`**; instruction docs **`list-wishlist`** / **`get-wishlist`** match unified SQLite persistence; requestable **`.cursor/rules/playbook-wishlist-intake-to-execution.mdc`**; register playbook id in maintainer + machine indexes.
- **Outcome:** Agents have an ordered flow to rank **`wishlist_intake`**, ask **now vs delay**, clarify scope, pick a target **`phaseKey`**, and run **`convert-wishlist`** with **`expectedPlanningGeneration`** when **`planningGenerationPolicy`** is **`require`**.
- **Exit signals:**
  - Playbook + rule + indexes list stable id **`wishlist-intake-to-execution`** without contradicting **`wishlist-workflow.md`**.
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`** pass on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 47 - Agent guidance profile (RPG party) -> GitHub release `v0.47.0` (COMPLETE)

- **Primary scope:** **`T585`–`T590`** — design + ADR (**`T585`**); config registry + validation (**`T586`**); CLI **`resolve`** for effective tier (**`T587`**); onboarding write path (**`T588`**); **`agent-behavior`** advisory integration (**`T589`**); extension + **`FEATURE-MATRIX`** / runbook (**`T590`**).
- **Outcome:** Users pick a **guidance tier** at onboarding (fun labels with descriptions); stored value drives **more or less** explanation, check-ins, and directing questions in advisory surfaces. Stable enum and **`profileSetId`** (e.g. **`rpg_party_v1`**) decouple product copy from behavior logic.
- **Exit signals:**
  - Tier persisted and validated; default safe for existing workspaces.
  - Agents can read effective guidance via documented JSON command (**`T587`**).
  - Onboarding path sets tier without hand-editing config (**`T588`**).
  - **`pnpm run build`**, **`check`**, **`test`** pass on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 46 - Roadmap data generation + task features -> GitHub release `v0.46.0`

- **Primary scope:** **`T591`–`T598`** — JSON Schema for **`roadmap-data.json`** / **`feature-taxonomy.json`**; deterministic **`ROADMAP.md`** + **`FEATURE-TAXONOMY.md`**; CI drift gate; relational **`features_json`** (**`user_version` 4**); **`create-task`** / **`update-task`** / **`list-tasks`** **`features`**; taxonomy slug advisory warnings; extension/dashboard optional **`features`** on summary rows.
- **Outcome:** Maintainers edit data under **`src/modules/documentation/data/`** and regenerate markdown; tasks carry optional feature slugs for filtering and reporting.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`** pass on the release tag; maintainer evidence per **`RELEASING.md`**.

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

### Phase 7 - Architectural hardening -> GitHub release `v0.9.0` (COMPLETE)

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

### Phase 8 - Improvement backlog triage -> GitHub release `v0.10.0`

- Primary scope: improvement tasks `imp-2cf5d881b81f9a`, `imp-3dc9374451b3c0`, `imp-b9d8408715de51`, `imp-201911c9c4461a`, `imp-ab362ef4e1f99e`, `imp-c14c4955833730`, `imp-fb31f5fc2694d3`, `imp-43397766ef243b`, `imp-7f9e65fad74b0b` (see `.workspace-kit/tasks/state.json` for full acceptance criteria).
- Outcome: operator-actionable policy denials for `workspace-kit run`, maintainer runbooks (approval surfaces, transcript triggers, first-run validation, agent report template), README/AGENTS entrypoints, FEATURE-MATRIX + architectural review alignment, optional task-state JSON Schema for editors.
- Exit signals:
  - All listed `imp-*` items are **`completed`** in task-engine state with release evidence recorded below.
  - `pnpm run build`, `check`, `test`, `parity`, and `phase5-gates` pass on the release tag.

### Phase 9 - Interactive policy UX and response-template enforcement -> GitHub release `v0.11.0`

- Primary scope: **`T283`** interactive command-scoped first-use approval (`WORKSPACE_KIT_INTERACTIVE_APPROVAL`, TTY or `readStdinLine` test hook; session grant on “Allow for session”); **`T284`** strict **`responseTemplates.enforcementMode`** (unknown resolved template id + explicit/directive conflict).
- Outcome: safer operator ergonomics without silent bypass; strict template enforcement for CI-style governance.
- Exit signals:
  - `T283` and `T284` are **`completed`** in task-engine state; `pnpm run build`, `check`, `test`, `parity` pass; docs/runbooks updated; released with Phase 10 as **`v0.11.0`**.

### Phase 10 - Agent/CLI parity -> GitHub release `v0.11.0`

- Primary scope: **`T285`–`T291`** — canonical Agent CLI map; CLI-first **`AGENTS.md`** / **`.ai/AGENTS.md`**; always-applied Cursor rule; **`tasks/*.md`** template persistence labels; `doctor` / bare `run` discovery output; multi-turn non-TTY session documentation; optional advisory check for suspicious `state.json` edits.
- Outcome: agents can answer “what do I run?” from maintainer docs and CLI output; fewer chat-only “approvals” and hand-edited task state.
- Exit signals:
  - Phase 10 tasks are **`completed`** in task-engine state; gates green on the release tag; **`docs/maintainers/AGENT-CLI-MAP.md`** linked from policy and AGENTS entrypoints.

### Phase 11 - Architectural review follow-up -> GitHub release `v0.12.0` (COMPLETE)

- Primary scope: **`T292`–`T295`**.
- Outcome: closes architectural review follow-ups by hardening policy/session test coverage, documenting and testing persistence concurrency semantics, adding release-time doc-consistency checklist steps, and auditing runtime-path assumptions.
- Exit signals:
  - `T292`–`T295` are **`completed`** in task-engine state.
  - `pnpm run build`, `check`, `test`, and `parity` pass.
  - Maintainer docs include explicit concurrency semantics and pre-release doc consistency sweep guidance.

### Phase 12 - Cursor native UI (thin client) -> GitHub release `v0.13.0` (COMPLETE)

- Primary scope: **`T296`–`T310`**.
- Outcome: extension-backed thin UI for workspace health/tasks/config powered by stable `workspace-kit run` JSON contracts, with security and test coverage.
- Exit signals:
  - Extension dashboard/tasks/config flows consume kit contracts without raw task-state scraping for aggregates.
  - Security/trust and policy UX requirements are documented and tested.
  - Extension unit/integration/manual-E2E evidence is captured for release readiness.

### Phase 13 - Task Engine lifecycle tightening -> GitHub release `v0.14.0` (COMPLETE)

- Primary scope: **`T311`–`T318`**.
- Outcome: canonical task CRUD/dependency/history/summary command surfaces, non-destructive archival behavior, and a planning-to-task bridge with provenance.
- Exit signals:
  - New Task Engine lifecycle mutation commands are available and instruction-documented.
  - Dashboard/query surfaces consume dedicated summary/history contracts.
  - Archived task exclusion defaults are enforced for active queue/summary operations.
  - Task Engine lifecycle-tightening behavior is test-covered.

### Phase 14 - Wishlist intake and conversion -> GitHub release `v0.15.0` (COMPLETE)

- Primary scope: **`T319`–`T323`**.
- Outcome: high-level ideas are captured as strict **Wishlist** entities in a separate namespace, excluded from execution planning surfaces, and converted into actionable tasks only through an explicit decomposition command that auto-closes the source Wishlist item.
- Exit signals:
  - Wishlist intake enforces required fields (`title`, `problemStatement`, `expectedOutcome`, `impact`, `constraints`, `successSignals`, `requestor`, `evidenceRef`).
  - Wishlist entities cannot be assigned phase values and do not appear in `get-next-actions` / ready-queue planning outputs.
  - Conversion command requires decomposition directions, creates canonical tasks with provenance links, and auto-closes the source Wishlist item as converted.
  - Workflow and command contracts are documented with integration/e2e test coverage.

### Phase 15 - Task and wishlist SQLite persistence -> GitHub release `v0.16.0` (COMPLETE)

- Primary scope: **`T324`–`T334`**.
- Outcome: optional SQLite-backed persistence for Task Engine and wishlist (single DB file storing both JSON documents), offline migration, atomic wishlist conversion on SQLite, and documented ADR (`docs/maintainers/ADR-task-sqlite-persistence.md`). Default remains JSON.
- Exit signals:
  - `T324`–`T334` are **`completed`** in task-engine state; `pnpm run build`, `check`, `test`, `parity`, and planning/release gates pass on the release tag.
  - `migrate-task-persistence` and `tasks.persistenceBackend` / `tasks.sqliteDatabaseRelativePath` are documented in task-engine config and maintainer changelog.

### Phase 16 - Maintenance and stability -> GitHub release `v0.17.0` (COMPLETE)

- Primary scope: **`T335`–`T344`** (engine + extension). Extension follow-up plan: **`docs/maintainers/plans/extension-dashboard-parity-plan.md`**.
- Outcome: a more trustworthy, documented, and automatable Task Engine surface—typed and versioned contracts, predictable validation and errors, better listing for agents, idempotent writes for retries, a single explainer for the execution model, optional strict persistence checks, shared vocabulary in TERMS, and a Cursor UI that stays fresh under SQLite and surfaces full `dashboard-summary` data, with **`list-tasks` filter wiring** after **`T337`**.
- Exit signals:
  - **`T335`–`T344`** are **`completed`** in task-engine state; `pnpm run build`, `check`, `test`, `parity`, and planning/release gates pass on the release tag.
  - Maintainer-facing docs (`AGENT-CLI-MAP`, `TERMS`, instructions) reflect new commands, filters, and validation behavior without contradicting the workflow contract.
  - Extension: SQLite-backed workspaces get auto-refresh when the planning DB changes; dashboard shows wishlist/blocked/ready-queue summary fields from `dashboard-summary`.

### Phase 17 - Planning module guided workflows -> GitHub release `v0.18.0` (COMPLETE)

- Primary scope: **`T345`–`T350`**.
- Outcome: a CLI-first planning workflow module that guides operators through context-adaptive interviews, enforces critical-unknown completion safety by default, and emits wishlist-only artifacts for downstream decomposition.
- Exit signals:
  - **`T345`–`T350`** are **`completed`** in task-engine state.
  - `pnpm run build`, `check`, `test`, `parity`, `check-release-metadata`, `phase5-gates`, and `check-planning-consistency` pass on the release tag.
  - Maintainer docs (`AGENT-CLI-MAP`, planning runbook, module instructions) align with command behavior and config defaults.

### Phase 18 - Module platform and state consolidation -> GitHub release `v0.19.0` (COMPLETE in-repo)

- Primary scope: **`T351`–`T365`** across three tracks.
- **Track A — Planning engine agent orchestration hardening** (`T351`–`T355`): explicit planning output mode contracts (wishlist/tasks/response), strict adaptive follow-up gating, task-output mode from planning flow, effort/risk/ordering scoring hints, and normalized planning response schemas with hardened docs/tests.
- **Track B — Module pattern cleanup** (`T356`–`T359`): centralize module enrollment into a single barrel, replace `onCommand` if-chains with handler map dispatch, extract shared planning domain from `task-engine` into `core/`, and remove unused lifecycle hooks from the `WorkflowModule` contract. See `docs/maintainers/MODULE-CLEANUP-REVIEW.md` for full analysis.
- **Track C — Unified state consolidation** (`T360`–`T365`): implement a single SQLite state DB in core with module schema registration, migrate existing JSON state (task-engine and improvement) into the unified DB, add export-on-commit JSON snapshot for git-tracked state diffs and resync-to-commit, add CLI commands for module state queries (AI discoverability), and remove `state.md` files in favor of enforced schema registration.
- Dependency structure: Tracks A and B start in parallel. Track C depends on Track B completion (`T358` specifically). Within each track, tasks are sequenced by declared `dependsOn`.
- Outcome: planning module is agent-orchestration-ready with structured output contracts; module internals are consistent, boundary-enforced, and scalable; runtime state is consolidated into a queryable, transactional, git-snapshotted SQLite DB with enforced module schemas replacing disconnected documentation.
- Exit signals:
  - **`T351`–`T365`** are **`completed`** in task-engine state.
  - `pnpm run build`, `check`, `test`, `parity`, `check-release-metadata`, `phase5-gates`, and `check-planning-consistency` pass on the release tag.
  - No module imports directly from a sibling module (boundary enforcement).
  - `workspace-kit run get-module-state` returns structured state for all registered modules.
  - `state export` / `state import` round-trips produce identical output.
  - Module-build documentation (`.ai/module-build.md`, `docs/maintainers/module-build-guide.md`) reflects the new state and handler patterns.

### Phase 19 - Documentation module v2 -> GitHub release `v0.20.0` (COMPLETE in-repo)

- Primary scope: **`T366`–`T376`** — documentation module schema upgrade and runtime decomposition. Planning artifact: **`W6`**.
- **Schema v2** (`T366`): rewrite `documentation-schema.md` for fully-keyed fields, consolidated prefixes (`cmd`/`command` unify to `command`), new `example` record type, required `why` on `rule`, typed `ref` with `type`/`anchor`/`label`/`status`. `meta` line uses `schema=base.v2`.
- **Types and parser** (`T367`–`T368`): `NormalizedDocument` typed graph, `ViewModelDefinition` types, extracted `parser.ts` with keyed-only `parseAiRecordLine`.
- **Validator** (`T369`): extracted `validator.ts` enforcing v2 required fields, `why` on rules, `ref.type` enum, `example.for` cross-references, and profile-specific required record sets.
- **Normalizer** (`T370`): `normalizer.ts` producing typed `NormalizedDocument` from parsed records — the boundary between raw text and typed objects.
- **View models and renderer** (`T371`–`T372`): `views/` directory with ~15 `.view.yaml` files replacing prose templates; `renderer.ts` with deterministic named rendering functions (`rule_table`, `command_reference`, `brief_summary`, etc.) that produce markdown from typed inputs only.
- **Runtime rewire** (`T373`): slim `runtime.ts` to orchestration — config loading, file I/O, wiring parser+validator+normalizer+renderer. `generateDocument` reads `.ai/` source, parses, validates, normalizes, renders via view model. `generateAllDocuments` iterates view models not templates.
- **Hard migration** (`T374`): rewrite all 17 `.ai/` docs to v2 keyed format.
- **Tests and docs** (`T375`–`T376`): rewrite `documentation-runtime.test.mjs` for v2 components; update module `RULES.md`, `README.md`, instructions, and version bump.
- Dependency structure: `T366` is root → `T367` → `T368` → `T369` → `T370` → `T371`/`T372` → `T373`. `T374` depends on `T366`+`T369`. `T375` depends on `T373`+`T374`. `T376` depends on `T373`+`T375`.
- Constraints: all code changes contained within `src/modules/documentation/` module boundary. Hard migration (no dual v1/v2 support). Templates kept for rollback but deprecated. No fact SPO triples or separate profile schema files. Renderers are functions, not a plugin framework.
- Outcome: deterministic, view-model-driven documentation rendering from fully-keyed canonical records, with a decomposed runtime (parser, validator, normalizer, renderer) and consistent v2 format across all `.ai/` docs.
- Exit signals:
  - **`T366`–`T376`** are **`completed`** in task-engine state.
  - `pnpm run build`, `check`, `test`, `parity`, `check-release-metadata`, `phase5-gates`, and `check-planning-consistency` pass on the release tag.
  - All 17 `.ai/` files parse and validate under v2 schema.
  - `generate-document` and `document-project` produce deterministic human docs from canonical records via view models.
  - `runtime.ts` is under 300 lines with all logic in dedicated files.

### Phase 20 - Maintainer platform and documentation alignment -> GitHub release `v0.21.0` (COMPLETE)

- Primary scope (shipped): **`T388`**, **`T389`–`T393`**.
- **Command metadata** (`T388`): single typed command manifest to replace scattered command metadata (improvement slice; aligns with handler extraction work).
- **Module structure** (`T389`–`T393`): `src/modules/README` vs shipped registry; core↔modules layering notes in ARCHITECTURE/`src/README`; slim task-engine `index.ts` post-command extraction; planning module vs planning persistence disambiguation; `src/modules/index.ts` barrel export policy.
- **Deferred / closed (not shipped under these ids):** hygiene **`T394`–`T397`**, extension cockpit **`T398`–`T402`**, optional task-engine ergonomics **`T415`–`T419`** — **cancelled** in task-engine state **2026-03-28**.
- Outcome: contributor-facing docs and module boundaries match shipped code; fewer stale enrollment or instruction surfaces; clearer export and hook contracts.
- Exit signals:
  - **`T388`–`T393`** are **`completed`** in task-engine state; deferred ids above are **`cancelled`**.
  - `pnpm run build`, `check`, and `test` pass on the release tag.
  - No contradiction between TERMS, module-build canon, and implemented `WorkflowModule` contract.

### Phase 21 - Agent reliability and planning dashboard -> GitHub release `v0.22.0` (COMPLETE)

- Primary scope: **`T404`–`T409`**, **`T410`–`T414`**.
- **Agent context reliability** (`T404`–`T409`): requestable Cursor rule globs; long-session reload ritual in `AGENTS.md`; slim always-on rules to pointer-first prose; **`tasks/*.md`** template closure reminders; optional stronger task-state integrity checks; maintainer session hygiene for long threads.
- **Planning dashboard** (`T410`–`T414`): persist in-flight `build-plan` context for dashboard signals; aggregate planning visibility into `dashboard-summary`; extension dashboard panel + active-context refresh; planning quick actions from dashboard; maintainer docs and extension parity plan alignment.
- Outcome: agents re-anchor on canon and CLI under long context; operators see planning health and shortcuts from the extension without breaking the thin-client model.
- Exit signals:
  - Listed tasks are **`completed`** in task-engine state.
  - `pnpm run build`, `check`, `test`, and extension compile (`pnpm run ext:compile` or documented equivalent) pass where extension tasks apply.
  - `dashboard-summary` contract and planning context paths are documented for extension consumers.

### Phase 24 - Unified task intake and improvement operational state -> GitHub release `v0.24.0` (COMPLETE)

- **Decision record:** `docs/maintainers/ADR-unified-task-store-wishlist-and-improvement-state.md`.
- **Primary scope:** **`T425`–`T432`**.
- **Wishlist → tasks (Option B):** drop `W###` after migration; new tasks only as `T###` with stable provenance metadata (e.g. `legacyWishlistId`).
- **Persistence:** one-time migration removes the separate wishlist store / SQLite `wishlist_store_json` usage; **no** long-term dual-read of legacy wishlist artifacts.
- **Improvement:** operational ingest state (cursors, retries, etc.) lives in a **dedicated logical document** in the unified store; **not** modeled as ordinary task rows. Human-facing improvement work remains `type: "improvement"` tasks where applicable.
- **Dependency structure:** `T425` → `T426` → `T427` / `T428` in parallel; `T429` after `T425`+`T427`; `T430` after `T427`; `T431` after `T428`–`T430`; `T432` after `T431`.
- **Exit signals:**
  - **`T425`–`T432`** are **`completed`** in task-engine state (merged **PR #69**, released **`v0.24.0`**).
  - `pnpm run build`, `check`, `test`, and `parity` pass on the release tag; extension compile where dashboard surfaces change.
  - Doctor and **`migrate-wishlist-intake`** align with tasks-backed wishlist intake; changelog documents breaking id/persistence changes.

### Phase 25 - Agent playbooks and direction sets -> GitHub release `v0.26.0` (COMPLETE)

- **Primary scope:** **`T433`–`T439`**.
- **Outcome:** Operators and agents can open **named playbooks** that **link and order** steps against existing canon (`RELEASING.md`, delivery loop / branching rules, `AGENT-CLI-MAP.md`, `POLICY-APPROVAL.md`) instead of copying long procedural text. Discovery via **`AGENTS.md`**, **`tasks/*.md`**, runbook, and optional requestable Cursor rule.
- **Dependency structure:** `T433` → `T434` → `T435` / `T436` in parallel where unblocked; `T437` after `T435`; `T438` after `T434`+`T435`; **`T439`** after **`T434`–`T438`** (closeout + matrix/roadmap completion wording).
- **Exit signals:**
  - **`T433`–`T439`** are **`completed`** in task-engine state; released **`v0.26.0`**.
  - `pnpm run build`, `check`, `test`, and `parity` pass on the release tag.
  - Pilot playbook and index are discoverable from **`docs/maintainers/AGENTS.md`** without contradicting the workflow contract (`TERMS.md`, maintainer-delivery-loop expectations).

### Phase 26 - Module platform and improvement execution -> GitHub release `v0.27.0` (COMPLETE)

- **Primary scope:** **`T388`**, **`T389`**, **`T391`**, **`T393`**, **`T390`**; workbook **`T440`–`T442`**; **transcript-backed `imp-*`** triaged and executed where promoted to **`ready`** (remaining **`proposed`** backlog rolls forward to Phase 27).
- **Outcome:** Module README and boundary docs stay honest with the tree; **command manifest** wiring matches shipped commands where required; **task-engine** exposes a deliberate minimal public surface; **`src/modules` barrel** policy is enforced consistently; pre-release / **`transcript:ingest`** helpers forward **`policyApproval`** correctly; maintainer docs cover **R102** layering exceptions and native SQLite portability.
- **Dependency structure:** Maintainer delivery loop + `improvement-triage-top-three` for **`proposed` → `ready`** promotion.
- **Exit signals:**
  - Phase **26** primary and promoted **`ready`** work is **`completed`** in task-engine state; remaining transcript **`imp-*`** items stay **`proposed`** for Phase 27 triage.
  - `pnpm run build`, `check`, `test`, and `parity` pass on the **`v0.27.0`** release tag.
  - ROADMAP, FEATURE-MATRIX, and **`docs/maintainers/data/workspace-kit-status.yaml`** reflect phase closeout and release evidence.

### Phase 27 - Transcript improvement execution -> GitHub release `v0.28.0` (COMPLETE)

- **Primary scope:** Nine **`ready`** transcript improvements: **`imp-5ba2f6a0c3bd4a`**, **`imp-6a07b608c1b752`**, **`imp-3bf93773a8c983`**, **`imp-a7dcdec79a791b`**, **`imp-190189d4b01bc1`**, **`imp-d3d2643f55fd43`**, **`imp-4cf9c424e5bfb2`**, **`imp-f39584e6613337`**, **`imp-d8ed5fa0b6c093`**. (Deferred **`workspace-kit`** work **`T392`**, **`T443`–`T449`** was accepted to **`ready`** under **Phase 28** maintainer triage **2026-03-31** with updated phase string and **`dependsOn`** chain.)
- **Outcome:** Maintainer runbook **`docs/maintainers/runbooks/agent-task-engine-ergonomics.md`** documents Git vs task-state boundaries, read-only kit inspection, planning vs execution queues, improvement listing, product vs implementation maps, task-engine **`index.ts`** public surface, soft (**`agent-behavior`**) vs hard (policy/principles) layers, and extension vs CLI — each tied to transcript **`evidenceKey`** rows for verification. FEATURE-MATRIX Phase 27 milestone row stays aligned.
- **Exit signals:**
  - Listed **`imp-*`** items are **`completed`** in task-engine state with release evidence recorded below.
  - `pnpm run build`, `check`, `test`, `parity`, and `phase5-gates` pass on the **`v0.28.0`** release tag.

## Recorded decisions

| Decision | Choice |
| --- | --- |
| Wishlist ids and persistence (Phase 24) | Option B: migrate to `T###` + `metadata.legacyWishlistId`; remove dedicated wishlist store after one-time migration; see ADR `ADR-unified-task-store-wishlist-and-improvement-state.md` |
| Improvement pipeline state | Separate module-state document in unified storage; not normal `tasks[]` rows |
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
- Phase 7 / `v0.9.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23622990943`
- Phase 8 / `v0.10.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23624912236`
- Phase 9-10 / `v0.11.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23628501468`
- Phase 11 / `v0.12.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23635032123`
- Phase 12 / `v0.13.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23635471927`
- Phase 13 / `v0.14.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23650389235`
- Phase 14 / `v0.15.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23656475480`
- Phase 15 / `v0.16.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23658822630`
- Patch **`v0.16.1`** (doctor SQLite validation + persisted `tasks.*` SQLite keys): publish workflow `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23659070618`
- Phase 16 / `v0.17.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23667632451`
- Phase 17 / `v0.18.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23671207437`
- Phase 20 / `v0.21.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.21.0`
- Phase 24 / `v0.24.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.24.0`
- Phase 24 / `v0.24.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23758351442`
- Phase 25 / `v0.26.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.26.0`
- Phase 25 / `v0.26.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23768654868`
- Phase 26 / `v0.27.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.27.0`
- Phase 26 / `v0.27.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23823720798`
- Phase 27 / `v0.28.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.28.0`
- Phase 27 / `v0.28.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23825952328`
- Phase 28 / `v0.29.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.29.0`
- Phase 28 / `v0.29.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23826775242`
- Phase 33 / `v0.33.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.33.0`
- Phase 33 / `v0.33.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23829185551`
- Phase 34 / `v0.34.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.34.0`
- Phase 34 / `v0.34.0` npm publish: manual **`Publish NPM`** workflow (`publish-npm.yml`) after tag — not tag-triggered
- Phase 35 / `v0.35.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.35.0`
- Phase 35 / `v0.35.0` npm publish: manual **`Publish NPM`** workflow (`publish-npm.yml`) after tag — not tag-triggered
- Phase 36 / `v0.36.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.36.0`
- Phase 36 / `v0.36.0` npm publish: manual **`Publish NPM`** workflow (`publish-npm.yml`) after tag — not tag-triggered
- Phase 37 / `v0.37.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.37.0`
- Phase 37 / `v0.37.0` npm publish: manual **`Publish NPM`** workflow (`publish-npm.yml`) after tag — not tag-triggered
- Phase 41 / `v0.41.0` publish workflow run: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23919642520`
- Phase 42 / `v0.42.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.42.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23920361117`
- Phase 47 / `v0.47.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.47.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23931954622`
- npm package: `https://www.npmjs.com/package/@workflow-cannon/workspace-kit`
