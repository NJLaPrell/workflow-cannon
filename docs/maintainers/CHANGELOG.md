# Changelog

All notable changes to `@workflow-cannon/workspace-kit` are documented in this file.

`CHANGELOG.md` at the repository root is pointer-only and must not diverge from this canonical history.

**Strategy:** Canonical history lives **here** (`docs/maintainers/CHANGELOG.md`). The root file is a pointer only. GitHub Releases should paste or link the same sections for each tag.

## [Unreleased]

## [1.0.12] - 2026-07-20

Patch — **Phase 151 Dashboard CAE Library** (file-first Library on the Dashboard CAE tab: browse/open/create/duplicate/reveal without webview body editing).

### Changed

- **Library list reshape** — Dashboard CAE Artifacts band reframed as Library listing `cae.*` + `workspace.*` with type chips; Open-in-editor only; no primary markdown textarea or Hide Default / Remove Override stubs (T100871, PR #803).
- **Identity-only Create/Duplicate** — Library create/duplicate use a minimal identity drawer (type/id/title/slug) and auto-open the workspace artifact file on success; no activation side effects (T100872, PR #804).
- **Reveal + soft empty-state** — Row Reveal highlights the artifact file; folder Reveal targets `.ai/cae/artifacts/` (type subfolder when filtered and present); locked browse copy plus remediation hints; doctor adds an informational line when `adminMutations` is off (T100873, PR #805).
- **Library regression coverage** — Tests lock Library framing, absent stubs/textarea, Create/Reveal intents, and locked empty-state strings; post-v1 rebind/hide/override named only as out-of-scope markers (T100874, PR #806).

### Migration

- No CLI, package API, or MCP tool-name changes. Operators edit guidance bodies in the editor under `.ai/cae/artifacts/`, not in the Dashboard CAE webview.

## [1.0.11] - 2026-07-13

Patch — **Phase 149 Hard-merge Ideas into Planning** (Planning is the sole registered module owning Ideas capture and the full IdeaPlan lifecycle; frozen command names / `ideas.persist` / sync domain `ideas` / MCP tool names).

### Changed

- **IdeaPlan kernel under Planning** — types, storage, status machine, schema guards, and unified review/accept live in `planning/idea-plan/` (T100861).
- **Idea CRUD + brainstorm under Planning** — handlers relocated to `planning/idea-row/` and `planning/brainstorm/`; Ideas thin shell removed later in the phase (T100862).
- **Shared Planning dispatcher** — all former Ideas + Planning commands route through one dispatcher with dual-registration shim during cutover (T100863).
- **Merge contract gates** — golden-path, standalone PlanArtifact, and MCP planner smoke assert frozen codes/tool names and empty/first-run behavior (T100864).
- **Instruction docs migrated** — former Ideas instruction markdown now under `planning/instructions/`; MCP sourceRefs and playbooks retargeted (T100865).
- **MCP/dashboard/extension retarget** — planner enablement and dashboard barrels use Planning authority (T100866).
- **Registry cutover** — all 28 commands register under `moduleId: planning`; `ideas` removed from `defaultRegistryModules` with config alias + doctor deprecation warning (T100867).
- **Unified IdeaPlan default-on** — dashboard unified path is default; emergency kill-switch via `IDEAS_UNIFIED_MODEL_ENABLED=0` or VS Code `workflowCannon.ideas.unifiedModelEnabled: false` (T100869).
- **Ideas module shell deleted** — Planning owns Ideas lifecycle end-to-end; no separate Ideas WorkflowModule remains (T100870).

### Fixed / verified

- **Ideas git-sync contract** — domain id `ideas`, `planning.idea.*` kinds, and frozen `command.moduleId: "ideas"` documented and covered by contract tests post-cutover (T100868).

### Migration

- Operators who previously disabled only the `ideas` module: `modules.disabled: ["ideas"]` now aliases to Planning with a doctor deprecation warning — disable Planning (or use documented kill-switches) intentionally.
- No command-name, argv, opId, storage-path, or MCP tool-name changes in this release.

## [1.0.10] - 2026-07-10

Patch — **Dashboard UX polish** (post–Phase 148 mid-stream ship from `main`: Ideas drawer, startup timeout fix, Replit visual pass, plan/idea list polish, false Agent Activity idle).

### Added

- **New Idea drawer** — Ideas section uses a Phase Notes-style header button that opens create-idea in the shared drawer modal instead of an always-visible inline form (PR #781).

### Changed

- **Dashboard visual consistency** — card expansion defaults, callout styling for pending decisions, focus-visible keyboard navigation, and CSS-variable color/font alignment across dashboard/config/status webviews (PR #782).
- **Plans list rollups** — render as `ID - Title` with description underneath; expanded cards no longer duplicate title/description/status; rollup summaries use a pointer cursor (PR #783).
- **Ideas rows** — match Wishlist `dash-row` chrome; remove drag-sort handle and stray `open` status tag (PR #783).
- **Phase 109 skill-pack backlog** — retarget first-party skill-pack epic to unphased after draining the Phase 109 bucket (PR #779).

### Fixed

- **Startup timeout false positive** — hydrated dashboard no longer wiped by the webview shell probe after a successful first paint (PR #780).
- **False Agent Activity “active”** — parent transcript mtime no longer classified as orchestrator `working_task`; idle-only boards show the empty state (PR #783).
- **Task-state snapshot pointer** — rollback empty `snap-2026-06-30` manifest pointer to a valid snapshot for hydrate safety.

## [1.0.9] - 2026-07-10

Patch — **Phase 148 Agent Bug Reporting** (Tier C `file-bug-report`, `wc-bug-report` skill, host-agnostic spawn adapters, advisory CAE nudges, critical-path tests).

### Added

- **agent-bug-reporting WorkflowModule** — module registration, config, and instruction surface for agent-filed proposed improvements (T100855).
- **`file-bug-report` (Tier C)** — creates `improvement@proposed` with rich evidence metadata, planningGeneration one-shot under `require`, and `evidenceKey`/`clientMutationId` dedupe; fail-closed for ready/non-improvement (T100856).
- **`wc-bug-report` skill pack** — dual-install discoverable skill with parent fire-and-forget spawn contract, structured handoff, cheap `composer-2.5` child filing, and CLI fallback (T100857).
- **wc-bug-reporter seed + host adapters** — Cursor + CLI spawn adapters; Antigravity / VS Code Copilot stub contracts; runbook for host-agnostic filing (T100858).
- **CAE advisory do activations** — nudge spawn `wc-bug-reporter` / `file-bug-report` on WC failure and agent friction without ready/release powers (T100859).
- **Critical-path tests and disable docs** — empty/first-run filing coverage, module-disable → `unknown-command` / create-task fallback path documented (T100860).

## [1.0.8] - 2026-07-09

Patch — **Phase 146 Dashboard Loading & Sync (first paint)** (single startup owner, CLI-primary cold bootstrap, quiet service promote, SLA/empty/fallback coverage).

### Added

- **DashboardStartupController** — single owner for cold-start shell paint, bootstrap, and webview boot/ready/timeout/refresh with one in-flight promise (T100843).
- **CLI-primary cold bootstrap** — `BootstrapSnapshotAdapter` hydrates overview from session cache / store / `dashboard-bootstrap-slices` without waiting on dashboard-service health (T100844).
- **Quiet post-paint service promote** — promote to healthy service after first paint via section patches only; never restart startup or wipe a usable overview (T100845).
- **Cold-path first-paint SLA tests** — deterministic stubbed tests prove usable overview within 3s when the service is cold (T100846).
- **Empty / first-run cold-path coverage** — zero-count and fresh-workspace overview paints without a stuck loading shell (T100847).
- **Promote fallback and disable toggle** — failed promote keeps CLI overview; `dashboard.postPaintPromote: false` disables quiet promote without forcing `cli-polling` (T100848).

## [1.0.7] - 2026-07-09

Patch — **Phase 132 User Simulation Harness** (deterministic Complete & Release scenarios with persona evaluators).

### Added

- **User simulation harness** — `scripts/agent-flow-harness.mjs` runs CLI, MCP, and MCP-fallback scenarios without real AI calls.
- **Persona and scenario libraries** — JSON Schema validation, PM + expert personas, empty/completed/active-work scenarios.
- **Evaluators** — state, UX, response, and efficiency evaluators with byte metrics and command-sequence checks.
- **Simulation reports** — dry-run improvement/defect payloads traceable to scenario, persona, and step.
- **Orchestration profiles** — `AGENT_ORCHESTRATION_PROFILES.md` and `AGENT_ORCHESTRATION_CONTRACTS.md` (Director / Scout roles).

## [1.0.6] - 2026-07-09

Patch — **Phase 144 planner-chat adoption and build-plan sunset** (remove legacy planning interview; ship planner MCP skill pack and golden-path coverage).

### Added

- **wc-planner-chat skill pack** — documents five v1 planner MCP read tools with CLI fallbacks (`.cursor/skills/` and `.claude/skills/`).
- **Planner golden-path integration test** — `get-planner-flow-status` → draft → review → accept → finalize dryRun contract coverage.
- **build-plan consumer inventory** — maintainer runbook auditing all in-repo `build-plan` consumers before removal.

### Changed

- **Dashboard planning wizard** — static removal notice; **Plan this** / planner-chat is the supported path.
- **I011 dogfood** — planner tools exercised against the I011 IdeaPlan artifact lifecycle.

### Removed

- **`build-plan` CLI command** — legacy planning interview handler, instruction stub, and manifest registration removed after deprecation shim window.

## [1.0.5] - 2026-07-09

## [1.0.4] - 2026-07-08

## [1.0.3] - 2026-07-02

Patch — **Phase 140 Unified IdeaPlan document model** (single envelope for idea → brainstorm → plan → review → accept → deliver).

### Added

- **Unified IdeaPlan document types and storage ADR** — six state machine enums, envelope types, and file-based artifact pattern for idea-to-delivery tracking.
- **State schemas** — `brainstorming`, `idea`, `planning`, `reviewed`, `accepted`, and `delivered` with progressive validation fixtures.
- **Brainstorming lifecycle** — `start-brainstorm-session`, `update-brainstorm-session`, and `complete-brainstorm` with scoring engine and session synthesis.
- **Delivery check** — `check-delivery-status` transitions accepted ideas to delivered when linked tasks complete; dashboard Check delivery button.
- **Planning module adaptation** — `draft-plan-artifact`, `start-idea-planning`, `review-plan-artifact`, `accept-plan-artifact`, and `finalize-plan-to-phase` operate on unified IdeaPlan documents.
- **Plan document generation** — `generate-plan-document` writes rendered markdown; hooked into all four planning lifecycle commands.
- **Dashboard** — Brainstorm and Plan buttons on idea cards; Brainstorming rollup with scoring display and session history in detail panels.
- **Migration** — `migrate-ideas-to-unified-document` promotes legacy Ideas and PlanArtifact rows with dry-run and pre-write snapshot safety.
- **Feature flag** — gates new UI; legacy UI rendered when flag is off.

### Changed

- Review/accept plan artifact commands now use unified document `plan` section within the existing artifact file (no new standalone artifact identities).
- Dashboard summary projection exposes `brainstorm.synthesis` fields for brainstorming-state ideas.
- Planner-chat playbook and instruction files reference the unified model.

## [1.0.2] - 2026-06-30

Patch — **Phase 139 Idea planning system** (end-to-end idea → plan → review → finalize → task drafts, with dashboard lifecycle UI and canonical session commands).

### Added

- **`start-idea-planning`** and **`update-idea-planning-session`** commands — bootstrap/resume planning chat sessions, enforce allowed transitions, and persist `draft_ready` / `completed` lifecycle state.
- Planning Agent contract and planner-chat playbook updates with locked decisions for idea-originated planning.
- Dashboard **Plan this** wiring to `start-idea-planning` with idempotency checks and lifecycle row actions (plan card, WBS preview, finalize preview).
- PlanArtifact draft linking as `activeDraftPlanArtifact`, version immutability, accept/review gates, and acceptance promotion to `linkedPlanArtifact`.
- Finalize pipeline — WBS → task drafts with two-pass dependency resolution and idempotent persist.
- Generation retry, error normalization, audit trail, and invariant tests for the planning path.
- SQLite schema v39 — human-gate task statuses (`awaiting_review`, `awaiting_policy_approval`, `awaiting_external_decision`).
- Phase 139 baseline health report at `docs/maintainers/data/phase-139-baseline-health.md`.

### Changed

- Legacy planning path demoted in favor of the idea-planning command surface.
- Canonical task-state event applier now **replaces** `metadata` on whole-map `task.updated` events (fixes stale `deliveryEvidence` after waiver-only updates).

### Fixed

- Task-state projection hydration no longer retains removed metadata keys when operators clear delivery evidence in favor of a delivery waiver.

## [1.0.1] - 2026-06-24

## [1.0.0] - 2026-06-23

Major — **Phase 117 Wishlist removal** (retire wishlist ideation surface; migrate operators to Ideas + planner-chat).

### Breaking

- **Wishlist module and CLI verbs removed** — `add-wishlist`, `list-wishlist`, `get-wishlist`, `update-wishlist`, `convert-wishlist`, `migrate-wishlist-intake`, and related dashboard wishlist hydration controls are gone. Use **Ideas** (`create-idea`, `list-ideas`, planner-chat playbooks) for ideation instead.
- **`wishlist_intake` task rows discarded on upgrade** — SQLite migration drops legacy wishlist-intake tasks and clears stale wishlist build-plan session state. **Back up `.workspace-kit/tasks/workspace-kit.db` (or your configured planning SQLite path) before upgrading.**
- **Docs, schemas, and agent surfaces repointed** — wishlist playbooks, prompts, Cursor rules, CLI snippets, and contract defs removed; canon now references Ideas and planner-chat workflows.

### Removed

- Wishlist command module, persistence store, and dashboard wishlist slice wiring.
- Wishlist intake conversion path from build-plan (default output is tasks-only).

### Migration

1. Export or note any open wishlist items you still need — they are not preserved across upgrade.
2. Copy `.workspace-kit/tasks/workspace-kit.db` to a safe backup path.
3. Upgrade to **v1.0.0**, run `pnpm exec wk doctor`, and capture new ideation via Ideas (`create-idea`) or planner-chat as needed.

## [0.99.29] - 2026-06-22

## [0.99.28] - 2026-06-05

Patch — **Phase 130 Dashboard performance and delivery history** (lighter dashboard projections, coalesced refresh/hydration, terminal-task lazy loading, wishlist opt-in controls, delivery-history projection, and dashboard UX polish).

### Added

- Lightweight dashboard overview and task-state projection builders for faster startup and targeted refresh work.
- `dashboard-terminal-tasks` alongside the existing terminal-row readout so the dashboard can lazy-load completed and cancelled task history without broad queue reads.
- Phase delivery history projection and persistence updates wired into dashboard/task-engine read surfaces.
- Dashboard summary controls for optional wishlist hydration plus performance tracing hooks for targeted diagnostics.

### Changed

- Cursor dashboard refresh now uses coalesced background hydration, granular slice invalidation, improved pause/watchdog tracking, and more stable sticky/flex layout behavior.
- Dashboard queue and system-status rendering now prefer narrower projections, idempotent DOM reconciliation, and explicit source tracking/logging for summary calls.
- `build-vsix.sh` release packaging flow now resolves the repo root more defensively and ensures the install step runs from the correct directory context.

### Fixed

- Dashboard expand/collapse state now survives refreshes instead of resetting during live updates.
- Dashboard terminal task loading uses explicit SQL count/query paths to avoid heavy history reads during normal startup.

## [0.99.27] - 2026-06-04

Patch — **Phase 131 Packet-first release orchestration** (bounded phase orchestration packets, JSON-first worker starts and handoffs, release-state/closeout packets, dashboard Complete & Release guardrails, and packet-flow regression evidence).

### Added

- `phase-release-orchestration-state` / `phase-drain-delta` packet-first closeout flow with generation-aware refresh guidance and bounded evidence refs.
- `phase-release-state` read-only packet for release readiness, publish safety, completed phase task evidence, and next release commands.
- `release-closeout-result` read-only command for placeholder-free final release summaries backed by concrete release notes, follow-up scan, and command refs.
- Phase 131 packet-flow simulation artifact proving dashboard-launched closeout stays on packet-first refs and falls back safely on stale or mismatched evidence.
- JSON-first worker handoff guidance for `agent-execution-packet`, `submit-assignment-handoff`, and `assignment-reconciliation-preflight`.

### Changed

- Cursor Complete & Release prompt now starts from an explicit scoped `phase-release-orchestration-state` command, uses packet-first worker starts, and keeps concrete fallback and rollback guardrails.
- Task-engine run-command contract and agent CLI snippets include the final closeout result packet.
- Agent execution packets now surface deterministic model tier, ownership boundaries, validation commands, handoff refs, stop conditions, and compact guidance cards.

## [0.99.26] - 2026-06-03

Patch — **Phase 129 Agent Activity Board** (multi-agent live activity projection, renderer, polling, freshness, details, and regression fixtures).

### Added

- Multi-lease Agent Activity projection with task title/status/phase enrichment, custom agent metadata parsing, and contract coverage.
- Cursor dashboard Agent Activity Board with status chips, attention sorting, freshness/stale labels, expandable row details, and deterministic render fixtures.
- Activity-slice refresh path, polling integration, command-boundary activity hooks, and event-stream compatibility for future service updates.

### Fixed

- Dashboard agent activity rendering excludes expired rows from active/attention sections while preserving stale rows as visible attention signals.
- Agent-facing activity guidance documents useful structured details keys and TTL/heartbeat expectations.

## [0.99.25] - 2026-06-02

Patch — **Phase 128 Complete & Release** (agent orchestration docs/prompts/tests, dashboard activity summary wiring, and canonical task-state schema repair for planning events).

### Added

- Agent orchestration activity, profile, and release-checklist runbooks and associated dashboard activity summary wiring.
- Happy-path and blocked-worker E2E coverage for the orchestration flow.

### Fixed

- Canonical task-state schema validation now admits planning event kinds on `workflow-cannon/task-state`, unblocking phase delivery preflight.

## [0.99.24] - 2026-05-31

Patch — **Phase 126 Agent Orchestration Foundation** (contracts and design gates; documentation-only deliverables).

### Added

- Agent orchestration design artifact pack: inventory, architecture, contracts/schemas/fixtures, commands, policy, profiles, handoff v2 rubric, activity lifecycle, dashboard projection contract, test strategy, and compatibility notes (`AGENT_ORCHESTRATION_*.md`).
- Handoff v2 golden fixtures under `fixtures/agent-orchestration/handoff-v2/`.
- JSON Schema fixtures under `schemas/agent-orchestration/`.

### Fixed

- `persist-planning-execution-drafts` publishes canonical `task.created` events under `git-event-log` authority (T100634).
- Rich-create canonical publish no longer duplicates `clientMutationId` across paired `task.created` + `task.updated` events.

## [0.99.23] - 2026-05-30

Patch — **Phase 125 Pluggable sync backends** (canonical backend interface, Git and local-only adapters, backend selection, conformance harness, task-sync CLI names).

### Added

- `CanonicalStateSyncBackend` interface and backend-agnostic contract types (T100616).
- `GitEventLogBackend` wrapping existing git task-state publish/hydrate/status paths (T100617).
- `LocalOnlyBackend` for offline/tests without a Git repository (T100619).
- Hosted API backend contract design (ADR + wire types) (T100620).
- `tasks.canonicalBackend` selection config; doctor and dashboard report active backend (T100618).
- Shared backend conformance test harness for Git and local-only backends (T100621).
- Preferred `task-sync-*` CLI command names with `task-state-*` recovery aliases (T100622).

### Changed

- Outbox publisher and task-state runtimes route through the sync backend interface where applicable.

## [0.99.22] - 2026-05-30

Patch — **Phase 124 Local dashboard service mode** (service contracts, sync worker, SSE, closeout gates).

### Added

- Versioned `runtime-service` and `task-sync-status` wire contracts with `/status`, `/task-sync/status`, and `/task-sync/flush` service routes (T100609).
- Dashboard service process lifecycle commands with stale pid recovery (T100610).
- Dashboard snapshot store last-good fallback on slice refresh errors (T100611).
- Cursor extension `ServiceDashboardDataSource` with auto/service/cli-polling modes and data-source indicator (T100612).
- In-service background task-sync worker: outbox polling, hydrate schedule, pause/resume/flush (T100613).
- SSE event stream for dashboard slice updates and task-sync status changes with extension reconnect (T100614).
- `phase-delivery-preflight` service-mode gates for outbox drained, sync posture, and conflict rows (T100615).

### Changed

- Phase closeout playbook documents service sync gate alongside outbox drained check.

## [0.99.21] - 2026-05-30

Patch — **Phase 123 Local-first outbox sync** (canonical event outbox, background publisher, sync posture).

### Added

- SQLite v30 `kit_canonical_event_outbox` schema and repository API for idempotent canonical event enqueue.
- `tasks.canonicalPublishQueue` mode: mutations enqueue locally when Git is unavailable; background batch publisher to `workflow-cannon/task-state`.
- Sync posture on `task-state-status` / dashboard (outbox pending/failed/conflict counts).

### Changed

- Agent runbooks: `task-state-hydrate` / `task-state-publish` documented as recovery/admin paths only; closeout requires outbox drained or explicit waiver.

## [0.99.20] - 2026-05-30

Patch — **Phase 122 Dashboard Option 2** (warm read service + extension auto mode).

### Added

- Kit dashboard read service (`src/services/dashboard-service/`) — HTTP/SSE, SQLite snapshot store, tiered watchers, lifecycle commands.
- `dashboard.dataSource` config: `cli-polling` | `service` | `auto` (default `auto`). Updated to prioritize warm service when healthy (Task T8).
- Extension `DashboardReadPathCoordinator`, mode badge, restart service / CLI override commands.
- `/health` per-slice observability; `scripts/bench-dashboard-service.mjs`; Option 2 acceptance tests.

### Changed

- Dashboard extension prefers warm service when healthy; falls back to Option 1 CLI pollers without clearing last-good slice data.


## [0.99.19] - 2026-05-30

Patch — **Phase 121 Dashboard Option 1** (state store + targeted pollers; replaces monolithic 45s refresh).

### Added

- `.ai/runbooks/dashboard-data-map.md` — machine dashboard slice → source → UI map.
- Extension `DashboardDataStore`, slice registry, `DashboardPollerCoordinator`, load trace, and freshness labels per section.
- Kit `build-dashboard-base` projection builders so `dashboard-summary` overview skips queue rollup work at build time.
- Acceptance tests: `dashboard-data-store`, `dashboard-pollers`, `dashboard-option1-acceptance`.

### Changed

- `DashboardViewProvider` renders from store snapshots; critical/queue/ops/status poll groups replace the global 45s `pushNow` interval.
- Mutations pause pollers, mark affected slices stale, and `refreshSlicesNow` on success.


## [0.99.18] - 2026-05-29

Patch — **Phase 118 closeout** (dashboard phase-roster sync; CI optimization scope cancelled).

### Added

- Dashboard phase roster honors canonical SQLite workspace phase when `currentKitPhase` is unset (cross-workstation sync).

### Changed

- Phase 118 CI optimization tasks (T100559–T100569) cancelled: skip-aware CI stack deferred; delivery focus was planning-sync closeout on main at 0.99.17.


## [0.99.17] - 2026-05-29

Patch — **Phase 120 planning domain git sync** (extends Phase 119 stream with phase journal, ideas, module state, and domain toggles).

### Added

- `planning.phase_note.*` and `planning.phase_note_suggestion.*` events with publish hooks on phase journal mutators.
- `planning.idea.created` and `planning.idea.updated` (with `removed: true` for deletes) on idea commands.
- `planning.module_state.updated` for allowlisted modules (`improvement`, `agent-behavior`, `planning-build-session`) with schema-version OCC.
- `planning.canonicalSync.domains` config to gate publish/hydrate per domain (defaults to all Phase 119+120 domains under git-event-log).
- Integration tests: dual-worktree convergence for phase notes, ideas, and module state (`test/planning-git-sync-phase120-integration.test.mjs`).

### Changed

- Hydrate/rebuild respects enabled planning sync domains; disabled domains skip publish and SQLite overwrite.


## [0.99.16] - 2026-05-29

Patch — **Phase 119 planning git sync** (`planning.*` events on `workflow-cannon/task-state`).

### Added

- `planning.phase_catalog.upserted`, `planning.phase_catalog.removed`, and `planning.workspace_status.updated` event kinds sharing the canonical git stream with `task.*` lifecycle events.
- Unified hydrate/rebuild applies planning projections into `kit_phase_catalog` and `kit_workspace_status` in stream sequence order.
- Canonical publish hooks for `upsert-phase-catalog-entry` and `update-workspace-status` under `git-event-log` authority.
- `planning-state-migrate-baseline` command to seed genesis planning events from local SQLite.

### Changed

- `task-state-hydrate` and `rebuild-task-state-cache` replay planning and task events in a single admission/replay pass.

## [0.99.15] - 2026-05-28

Patch - **Phase 116 Planner-chat provenance closeout** (idea provenance, planner-chat playbook/prompt seed, and CAE registry coverage).

### Added

- PlanArtifact provenance now accepts `sourceIdeaId` and `previousPlanArtifacts` so Ideas-to-plan workflows can preserve their originating idea and superseded plan artifacts.
- Planner-chat playbook guidance and a reusable dashboard prompt builder seed idea context, provenance requirements, and policy references for chat-driven draft planning.
- CAE registry seed coverage for the planner-chat playbook keeps the Ideas-to-plan workflow discoverable as a shipped artifact.

### Changed

- Draft PlanArtifact persistence coverage now round-trips idea provenance fields through the artifact store.
- Dashboard Ideas planning prompts now have a structured shared builder ready for host wiring instead of ad hoc inline prompt text.

## [0.99.14] - 2026-05-28

Patch - **Phase 116 Dashboard Complete & Release** (Ideas planner-chat resume, PlanArtifact dashboard lifecycle wiring, and closeout E2E coverage).

### Added

- Dashboard Ideas rows can open planner-chat for a selected idea, persist a resumable planning-chat session, and show Resume planning when that session is active.
- PlanArtifact dashboard controls now wire Review, Accept, and Finalize through the host-side `wk run` paths with dashboard policy approval and current-phase targeting.
- Dashboard PlanArtifact regression coverage for happy path, blocker rejection, matching active resume sessions, and zero raw CLI prompt assertions.

### Changed

- Accept and finalize flows refresh planning generation before mutating so dashboard actions stay aligned with the task engine projection.
- Phase 116 task delivery evidence now covers the full dashboard completion sequence through PRs #537-#541.

## [0.99.13] - 2026-05-27

Patch - **Phase 116 Ideas module foundation** (SQLite-backed idea records and task-state closeout repair).

### Added

- `ideas` module registration and capability surface for the default Workflow Cannon module bundle.
- Kit SQLite migration v29 with the `workflow_ideas` table for DB-backed idea capture (`I###` ids, title/note/status ordering, plan artifact links, and provenance history JSON).
- `schemas/idea.schema.json` plus schema and SQLite migration tests for the Ideas scaffold.

### Fixed

- Repaired Phase 116/117 task phase assignments after the planner-created batch lost row-level phase placement, allowing Phase 116 closeout readiness to reflect the real queue state.
- Snapshot-backed task-state verification and release-gate stability fixes carried forward from the Phase 116 closeout path.

## [0.99.12] - 2026-05-27

Patch - **Phase 110 planner closeout** (PlanArtifact lifecycle, dashboard actions, release gates).

### Added

- PlanArtifact CLI golden-path coverage for draft, review, accept, finalize preview, finalize persist, and ready-task output.
- Explicit PlanArtifact fixture CI gate via `test:plan-artifact-fixtures` and the `PlanArtifact fixture gate` CI step.
- Planner traceability and full-test-sweep closeout artifacts for release evidence.

### Changed

- Dashboard PlanArtifact lifecycle controls now support reviewed, accepted, finalized, blocked, and open-question states with policy-tier wiring.
- `build-plan` task output recommends the PlanArtifact flow as an additive next step while preserving compatibility.
- README planner guidance now points phase-scoped work toward reviewed, accepted, and finalized PlanArtifacts.

## [0.99.11] - 2026-05-27

Patch — **Phase 115 git canonical task state** (event log authority, snapshot/tail hydrate, publish admission).

### Added

- `tasks.canonicalAuthority`: `git-event-log` with `workflow-cannon/task-state` branch, bootstrap snapshot, and JSONL event segments.
- Commands: `task-state-snapshot`, `task-state-compact`, `task-state-migrate-baseline`, `task-state-hydrate`; doctor shadow compare when git authority is active.
- Remote projection reads seed lifecycle admission from bootstrap snapshot; guard results stripped to schema shape on publish.

### Changed

- `run-transition`, `create-task`, and `update-task` publish canonical events then hydrate SQLite projection; `sync-task-store-after-merge` marked legacy.
- Phase 115 execution tasks T100509–T100527 completed (batch delivery PR #467).

## [0.99.8] - 2026-05-26

Patch — **Phase 113 dashboard intent coordinator** (snapshot-driven drawer UX, mutation holds, lazy-load merge).

### Added

- `DashboardCoordinator` with `SideEffectBus`, drawer intents (`drawer.submit` / `drawer.cancel`), and `wcHostSnapshot` applier in the webview.
- `handleAcceptProposedDrawerSubmit` with snapshot progress and coordinator-driven toasts.
- `.ai/adrs/ADR-dashboard-intent-snapshot-v1.md` (R1–R3 intent/snapshot contract).

### Changed

- Drawer submit/cancel route through `coordinator.dispatch`; refresh defers while `coordinator.isMutationActive()` with `refreshBusy` on host snapshot.
- Removed legacy `wcDrawerProgress` / `wcDrawerValidation` / `wcDrawerClose` and `dashboardDrawerSubmitInFlight`; drawer UX is snapshot-only.
- Merged Phase 108 shell-first lazy dashboard hydration with Phase 113 coordinator locks (light section refresh + host snapshot refresh busy).

## [0.99.7] - 2026-05-26

Patch — **Phase 108 dashboard lazy loading** (shell-first paint, split hydration, regression gates).

### Added

- Dashboard shell paints synchronously before the first `dashboard-summary` read; overview projection uses `skipHeavyFetches` so CAE and phase journal CLI work defer until tab activation.
- Lazy queue phase buckets load rows on expand with cursor pagination; secondary tabs hydrate via `dashboardTabActivated` / `wcSectionPatch`.
- Targeted section invalidation after mutations (light watcher refresh patches visible sections; hidden sections mark stale).
- `dashboard-lazy-regression-gates.test.mjs` and split `scripts/bench-dashboard-refresh.mjs` paths (overview / queue / full / secondary block).

### Changed

- Manual Refresh still runs full reconciliation; kit watcher uses light invalidation instead of monolithic `pushUpdate` for routine mutations.

## [0.99.6] - 2026-05-25

Patch — **Back-to-back Accept drawer submit** no longer hangs on Accepting.

### Fixed

- `notifyAfterDrawerClosed` runs toast notifications fire-and-forget so `dashboardDrawerSubmitInFlight` releases before the user can submit the next Accept.
- Assign failure path uses the same close-then-notify pattern instead of awaiting error toasts inside the submit critical section.
- CommandClient lane drain sets `laneDrainAgain` when work arrives during an in-flight drain.

## [0.99.5] - 2026-05-25

Patch — **Phase backfill assign** and **preempted refresh dashboard stability**.

### Fixed

- `assign-task-phase` and `upsert-phase-catalog-entry` accept numeric phase keys before workspace current kit phase by default; set `kit.phaseLadder.blockBeforeCurrent: true` to restore forward-only ladder enforcement.
- Preempted in-flight `dashboard-summary` refresh (SIGTERM during Accept) maps to `extension-refresh-paused` instead of `extension-json-parse`; dashboard keeps last good paint.

## [0.99.4] - 2026-05-24

Hotfix — **Dashboard back-to-back Accept** no longer hangs on the second proposed task.

### Fixed

- CommandClient preempts in-flight `dashboard-summary` refresh when a mutation (`run-transition`, etc.) enqueues, so consecutive Accept drawer submits are not blocked behind a running refresh CLI.
- Post-submit dashboard refresh is fire-and-forget so the drawer handler releases before the next accept opens.
- Reset webview `drawerSubmitInFlight` when the drawer reopens.

## [0.99.3] - 2026-05-24

Phase 113 — **Dashboard queue and drawer hardening** (mutation/refresh lanes, refresh controller, drawer session, webview client extraction).

### Added

- CommandClient mutation vs refresh lanes with keyed refresh coalescing.
- `DashboardRefreshController` — single owner for dashboard-summary refresh scheduling.
- Drawer session state machine with `wcDrawerState` snapshots to the webview.
- `dashboard-webview-client.ts` — extracted, tested dashboard sidebar bootstrap.
- `notifyAfterDrawerClosed` lifecycle helper; regression tests for queue starvation and submit-lock leaks.

### Changed

- Accept / Accept All no longer starve behind overlapping `dashboard-summary` refresh backlog.
- Workflow Cannon output channel tracing for kit runs and dashboard scheduling.

## [0.99.2] - 2026-05-22

Phase 107 — **Dashboard policy rationale UX** (routine auto-rationale, elevated explainers, machine docs).

### Added

- Dashboard policy tier matrix and `buildDashboardPolicyApproval` (routine vs elevated paths).
- Per-path elevated policy explainer copy in Dashboard drawers (batch accept, rewind, critical dismiss, team/subagent governance).
- `.ai/DASHBOARD-POLICY-UX.md` — operator QA checklist and illustrative policy trace samples.

### Changed

- Routine Dashboard mutations auto-fill structured `policyApproval.rationale`; elevated paths require operator text.
- `.ai/POLICY-APPROVAL.md` and `.ai/AGENT-CLI-MAP.md` document Dashboard vs CLI/agent approval lanes.

## [0.99.1] - 2026-05-19

Phase 106 — **Extension config in dashboard** (shared config webview, typed editors, Config tab shell, mutation/reload UX).

### Added

- `load-config-key-rows`, `groupConfigRows`, and typed config editors (`pickEditorKind`) in the Workflow Cannon extension.
- `config-mutation-result` for reload/policy errors; shared `config-webview-client` and `config-host`; thin `ConfigViewProvider`.
- Dashboard Config tab: `renderConfigPanelShellHtml`, `DashboardViewProvider` postMessage bridge and poke refresh.
- `render-explain-config` quick settings and explain layers; loading/retry UX.
- Tests: expanded `render-config.test.mjs`, `dashboard-config-tab.test.mjs`, `extension-config-copy.test.mjs`.

### Changed

- Config panel rendering split into sectioned `render-config` module; README documents extension config surfaces.

## [0.99.0] - 2026-05-19

Phase 104 — **CAE signals, operator CLI, release semver** (agent failure context, phase-journal activations, last-run output, semver proposal at closeout).

### Added

- `get-last-output` — read latest `kit_run_log` output for a command (operator/agent forensics).
- `propose-release-version` — semver bump recommendation from completed phase tasks (R200-semver).
- CAE `agentSignals` on evaluation context and `agentFailureSignal` activation conditions.
- Activation `cae.activation.review.agent-failure-improvement-discovery`.

### Changed

- Phase-journal CAE activations no longer hard-scoped to `phaseKey: 79`.
- `update-task` run-args schema uses `additionalProperties: false` with remediation hints on validation errors.
- Phase closeout playbook documents `propose-release-version` before tagging.

## [0.98.0] - 2026-05-19

Phase 103 — **Release, quality & consumers** (delivery evidence harvest, release readouts, tiered CI, release diff allowlist).

### Added

- `harvest-delivery-evidence` — preview/apply `metadata.deliveryEvidence` from git and GitHub PR signals.
- `wait-for-pr-checks` — headless poll for PR check conclusions (for agent delivery loops).
- `release-status` — one-shot git/npm/GitHub + phase snapshot readout.
- `derive-validations` / `derive-publish-artifacts` — fragments for incremental `release-evidence-manifest` assembly (`merge` / `fromFile`).
- `scripts/check-release-diff-shape.mjs` — release-prep diff allowlist gate (`RELEASE_DIFF_ENFORCE` on phase closeout).
- `.ai/CI-TIERS.md` — documents fast PR tier vs full push tier in `.github/workflows/ci.yml`.

### Changed

- CI: pull requests run fast `test` job only; push to `main` / `release/*` adds `release-readiness` and `parity`.
- Playbooks: phase journal on task `complete`, headless CI wait (§5a), maintainer delivery evidence steps.

## [0.97.0] - 2026-05-19

Phase 102 — **Persistence & planning store** (SQLite-first module state, audit tables, run invocation evidence, task-store git hygiene).

### Added

- `install-git-hooks` / `uninstall-git-hooks` and `src/core/git-policy-hooks.ts` for maintainer delivery policy hooks.
- `sync-task-store-after-merge` with `expectedPlanningGeneration` guard; doctor check `task-store-git-divergence`.
- SQLite tables `kit_approval_decisions`, `kit_skill_apply_audit`, `kit_policy_traces`, `kit_session_grants`, `kit_run_log` (planning DB **user_version** through **27**).
- `list-session-grants` (approvals module); improvement state schema **v4** with `lastIngestedPolicyTraceId`.
- Interview and build-plan sessions persisted in `workspace_module_state` (`agent-behavior-interview`, `planning-build-session`).
- Every `wk run` JSON response includes `invocationId`; `--output-file` writes the same envelope to disk.
- Arch mismatch remediation helper `formatArchMismatchRemediation()` and lazy `better-sqlite3` load path.

### Changed

- Improvement and agent-behavior sidecars migrate into `workspace_module_state` (SQLite module state).
- `kit_run_log` ring buffer (default 200 rows) with redacted args/response for operator forensics.

## [0.96.0] - 2026-05-19

Phase 101 — **Improvement loop & signals** (agent ergonomics for discovery, validation, dedupe, and batch lifecycle).

### Added

- `report-defect` — file proposed improvements from in-loop agent defect reports.
- Task intent wrappers: `block-task`, `pause-task`, `unblock-task`, `demote-task`, `accept-improvement`, `reject-improvement`.
- `batch-transition` — dry-run and apply for ordered lifecycle transition batches.
- `recommend-validation` — prioritized validation commands and delivery-evidence hints from task features and touched paths.
- `improvement-dedupe-explain` — similarity clusters, evidenceKey overlap, lineage, and triage guidance for proposed improvements.
- `improvement-workflow-summary` — transcript pipeline status, scout entry points, pending churn/proposals, and privacy-safe next steps.
- CAE activation `cae.activation.review.run-transition-improvement-discovery` for improvement-discovery review flows.

## [0.95.0] - 2026-05-18

Phase 100 — **Extension & human visibility** (dashboard operator surfaces + bounded agent phase JSON).

### Added

- Cursor dashboard: **Team Assignments**, **Subagent Registry**, **Task Checkpoints** recovery, **Policy Approval Inbox** cards with input drawers and playbook chat prompts.
- `phase-focus-dashboard` command and `AgentPhaseFocusDashboard` v1 contract; optional `dashboard-summary` `includePhaseFocus` and `agent-bootstrap` `projection: "phaseFocus"`.
- Shared **CAE Guidance** webview CSS module; dashboard Guidance stylesheet regression coverage.
- Dashboard phase journal stats, human-gates rollup, and past-phase notes slices.

### Changed

- `dashboard-summary` schema version **7** (`agentStatus`, approval queue, team/subagent/checkpoint rollups).

## [0.94.0] - 2026-05-18

Phase 99 — **Docs, playbooks & maintainer UX** (CLI discovery, PR integrity, project memory).

### Added

- `wk run --list-commands` / `list-commands` alias and `discovery` hints on CLI error envelopes.
- `pre-merge-gates` check `check-pr-history-rewritten` (`pr-history-rewritten`) when a PR head diverges from the latest approving review commit.
- **project-memory** module: `list-memory`, `write-memory`, `approve-memory`, `prune-memory`, `explain-memory-precedence`; optional root `CANNON.md` index.

### Changed

- Maintainer delivery loop and phase-closeout playbook: prefer follow-up commits over amend+force-push after review.

## [0.93.0] - 2026-05-18

Phase 98 — **Config, policy & trust** (agent CLI ergonomics).

### Added

- Agent-safe remediation links (`.ai/` primary paths; maintainer mirrors in `docAnchors`).
- `completion-preflight` command with copy-paste remediation before `run-transition complete`.
- First-class human-gate task statuses (`awaiting_review`, `awaiting_policy_approval`, `awaiting_external_decision`).
- Policy-aware `agent-mutation-plan` argv validation (`readyRun.argvValid`).

### Changed

- `.ai/AGENT-CLI-MAP.md` documents shell-safe JSON argv patterns for agents.

## [0.92.0] - 2026-05-18

Phase 97 — **Dashboard UX polish** (Cursor extension Overview/Queue surfaces).

### Added

- Dashboard **Phase Readiness** card: collapsed header + score badge; click to expand checks and pending decisions.
- VSIX install helper script for local extension deployment.

### Changed

- **Phase Roster** table: Phase and Status columns shrink to content; Deliverables column uses remaining width.
- Phase notes rendering, queue task action layout, and guidance authoring embed consistency improvements.

### Notes

- Open execution backlog from wishlist conversion (**T100321**, **T100322**) deferred to **phase 98** for closeout; no kit CLI behavior changes in this cut beyond dashboard extension UX.

## [0.91.1] - 2026-05-16

Post-**0.91.0** patch: lands the deferred **`release/phase-95` → `main`** integration (dashboard/planning slices, conflict reconciliation) plus follow-up CI and extension test fixes shipped after the **0.91.0** npm cut.

### Added

- (Integration) Phase 95 dashboard and task-engine behavior that had remained on the phase integration branch until merged to **`main`**.

### Changed

- CI: extend **`.ai` → `docs` coverage** ledger for newly referenced machine sources.
- Extension tests: **`pickNodeExecutable`** coverage uses a real repo root probe for native **`better-sqlite3`** resolution.

### Notes

- Consumers already on **0.91.0** who only need Phase 96 doc/runtime work may stay; this patch is for parity with **`main`** after the phase-95 merge and associated hardening.

## [0.91.0] - 2026-05-16

Phase 96 — **Documentation organization, governance gates, and Node 23-friendly runtime contract**. Ships maintainer doc inventory/lifecycle work, CI gates for documentation ledger + deletion evidence, `.ai` → `docs` governance repair runbook, and relaxes stamped-runtime Node checks so **Node 22+** (including **23**) passes `doctor` when `engines` allows it.

### Added

- Documentation lifecycle taxonomy + maintainer structure normalization; repo-root Markdown allowlist; **`documentation-ledger.v1.json`** inventory; **`pnpm run check:doc-lifecycle`** / ledger drift gate (T100194–T100196, T100199).
- **`documentation-deletion-register.v1.json`** + **`pnpm run check:documentation-deletion-register`**; removed orphan root JSON export dumps with evidence (T100200).
- **`.ai/runbooks/documentation-governance-checks.md`** (mirrored) + **`doc-governance-stages`** CI wiring; CONTRIBUTING / lifecycle / session pointers (T100201).
- Agent discoverability: `.ai` umbrella hub + workbook index (T100198).

### Changed

- Runtime contract / doctor: stamped Node major must be **>= 22** (no longer exactly **22**); `package.json` **`engines.node`** is **`>=22 <24`**; postinstall **`assertRequiredNodeMajor`** uses the same minimum rule (T100320).

### Removed

- Stray root-level JSON export dumps (`dashboard_out.json`, `dashboard_summary.json`, `tasks.json`) per the deletion register (T100200).

### Notes

- **Migration:** if you relied on `engines` rejecting Node 23, update local Node or tooling to match **`>=22 <24`**. CI default remains Node **22** (`.nvmrc`).


## [0.90.0] - 2026-05-14

Phase 95 — **Dashboard Phase Roster polish, phase deliverables editing groundwork, and native SQLite guardrails**. Ships the dashboard/status Phase Roster label cleanup, deliverables mutation plumbing, stricter single-task start ownership, and fail-fast native SQLite architecture checks for arm64 macOS reliability.

### Added

- Task engine / dashboard: `upsert-phase-catalog-entry` accepts actor/client mutation metadata for phase Deliverables updates, with dashboard message handling and planning-generation retry support.
- Task engine: single-task start guard blocks starting unrelated tasks while another task is already `in_progress`, with machine playbook repair guidance for accidental bulk starts.
- Native SQLite: `scripts/check-native-binding-arch.mjs`, postinstall fail-fast architecture checks, `native-binding-arch-mismatch` task-engine error surfacing, and doctor architecture status output.

### Changed

- Cursor dashboard/status UI labels now use **Phase Roster** and **Deliverables** consistently.
- Dashboard placement and copy for agent/profile/status phase cards were tightened across Phase 95 slices.

### Notes

- Migration impact: consumers on macOS arm64 with x64/Rosetta-built `better-sqlite3` bindings now receive an explicit mismatch error and should run `pnpm rebuild better-sqlite3` under a host-architecture Node runtime.

## [0.89.0] - 2026-05-13

Phase 94 — **Phase closeout readiness and delivery evidence enforcement**. Ships stricter task completion evidence defaults, a phase closeout readiness command, preflight integration for unfinished and stranded work findings, and docs/tests/contracts for release closeout guardrails.

### Added

- Task engine: `phase-closeout-readiness` reports unfinished phase-scoped tasks before release closeout.
- Task engine: stranded-work detection in `phase-delivery-preflight` compares completed task evidence/touched files against the phase integration branch and blocks local-only implementation drift.
- CLI/contracts: run-contract schema, pilot snapshot, command snippets, instruction docs, and router coverage for the new readiness command.

### Changed

- Delivery evidence completion enforcement now defaults to `enforce`, while explicit `advisory` and `off` configuration modes remain available.
- `phase-delivery-preflight` now embeds closeout readiness and stranded-work findings, so delivery evidence alone is not treated as sufficient phase closeout proof.
- `update-task` validates `metadata.deliveryEvidence` at write time and returns structured `invalid-evidence` remediation for malformed payloads.

### Notes

- Migration impact: phased execution tasks now need valid `metadata.deliveryEvidence`, `metadata.deliveryWaiver`, or an explicit local/non-shipping exemption before completion under the default configuration.

## [0.88.0] - 2026-05-12

Phase 93 — **Runtime contract hardening and lease coordination UX**. Ships stamped runtime launcher validation across doctor, upgrade, and drift-check flows; end-to-end runtime contract regression coverage for Node 22/native SQLite behavior; extension lease status/actions; bounded lease wait support; and suspect lease checkout drift detection for branch, HEAD, worktree path, and dirty manifest changes.

### Added

- Runtime contract: stamped `.workspace-kit/runtime.json` and launcher validation surfaces in doctor, upgrade, and drift-check flows, with clearer remediation for missing or stale runtime artifacts.
- Tests: runtime contract end-to-end coverage for stamped launcher execution, poisoned PATH / bad `.nvmrc`, missing runtime stamp, deleted Node, and native SQLite load failures.
- Cursor extension: lease status bar/actions for claim, heartbeat, release, recover stale, and inspect/status workflows, with renderer coverage for lease states.
- Task engine: opt-in bounded `waitForLease` behavior with low-frequency polling, timeout payloads, holder details, and read-only fallback guidance.
- Coordination: stable suspect lease flags for active lease branch, HEAD, worktree path, and dirty manifest drift, surfaced through `workspace-edit-status`, `workspace-coordination-status`, dashboard system status, and extension rendering.

### Changed

- Release/diagnostic flows now treat packaged runtime artifacts as first-class contract evidence rather than relying on ambient shell state.
- Coordination posture precedence is deterministic when dirty workspace, dirty task DB, active lease, stale lease, and suspect lease signals coexist.

## [0.87.2] - 2026-05-12

Phase 92 — **Workspace edit lease core commands**. Adds `claim-workspace-edit-lease`, `heartbeat-workspace-edit-lease`, `release-workspace-edit-lease`, and read-only `workspace-edit-status` (JSON lease under `$GIT_COMMON_DIR/workflow-cannon/leases/workspace-edit.json`, atomic writes, stale recovery, structured deny payloads with alternatives).

### Added

- Task engine: workspace edit lease commands + policy operation `task-engine.workspace-edit-lease`.
- Tests: `test/workspace-edit-lease.test.mjs`.

## [0.87.1] - 2026-05-11

Phase 91 follow-up — **Guidance sidebar CAE confirmations via dashboard drawers**. The Guidance webview sidebar uses the same drawer UX as the dashboard Guidance panel for acknowledgements, shadow feedback, and registry-version mutations (rationale + actor), with Escape/overlay dismissal and client-side validation before submit.

### Added

- Cursor extension: `GuidanceViewProvider` drawer wiring for ack / shadow feedback / registry mutations; drawer specs and validators in `dashboard-input-drawer`.
- Tests: `dashboard-input-drawer` coverage for guidance ack and registry-version drawer specs.

## [0.87.0] - 2026-05-12

Phase 90 — **Workspace coordination readout and list-tasks intake schema alignment**. Ships read-only `workspace-coordination-status` (git + `GIT_COMMON_DIR` lease slice), `dashboard-summary.systemStatus.coordination`, compact `workspaceCoordination` on `agent-bootstrap`, Cursor status bar + Status tab coordination card, temp-repo coordination tests, and pilot JSON schema support for `list-tasks` **`includeTaskIntake`** (contracts, snapshot, CLI snippets, regression tests) so agent instructions match runtime validation.

### Added

- Task engine / CLI: `workspace-coordination-status` command and `WorkspaceCoordinationStatusV1` contract.
- `dashboard-summary`: optional `systemStatus.coordination` embedding; `agent-bootstrap`: `workspaceCoordination` posture pointer.
- Cursor extension: status bar shows `WC <posture> · rdy N`; Status dashboard **Coordination** card when data is present.
- Tests: `test/workspace-coordination-status.test.mjs` for non-repo, clean main, feature branch, detached HEAD, dirty tree, dirty task DB, stale/active lease files.

### Fixed

- `list-tasks`: `includeTaskIntake` was implemented in the handler but rejected by pilot run-args JSON Schema; `contractListTasks` and pilot snapshot/snippets aligned with runtime.

## [0.86.0] - 2026-05-11

Phase 89 — **Dashboard phase notes and first-run init UX closeout**. Ships the Cursor dashboard phase-notes surface for browse/add/follow-up/convert workflows, chat-guided phase-note discovery, first-run attach documentation hardening, partial-attach doctor remediation, preview-only `wk detach --dry-run`, init/start integration coverage, an install/attach runbook, first-run doc string drift guard, `INIT_PLAN.md` historical disposition, and FEATURE-MATRIX / ADR polish for safe ownership preview.

### Added

- Cursor extension: phase-notes dashboard surface with add, follow-up, dismiss, convert, and chat entry paths.
- Chat prompts: guided phase-notes discovery prompt wiring for operator follow-up flows.
- CLI: preview-only `wk detach --dry-run` / JSON ownership plan output without deleting files.
- Maintainer runbook: install/attach Workflow Cannon flow covering first-run, ownership, SQLite, starter tasks, repair/force/dry-run, approvals, native SQLite, and `refresh-context`.
- Release gates: fast offline `check-init-first-run-docs` guard wired into maintainer gates.

### Changed

- `doctor` remediation now prioritizes `wk init` repair guidance for partial attach states.
- Init/start integration tests cover empty workspace attach, no-starter SQLite persistence, approvals, status output, re-init preservation, and force repair behavior.
- `INIT_PLAN.md` is marked as a historical program backlog; the ADR and task engine are canonical for current behavior and execution state.
- The first-run init ADR and FEATURE-MATRIX now describe current preview-only detach behavior accurately.

## [0.85.0] - 2026-05-11

Phase 88 — **Phase catalog in planning SQLite, list/upsert commands, and dashboard phase roster**. Ships `kit_phase_catalog` with deterministic ordering merged with workspace current/next phase keys, task-engine commands `list-phase-catalog` and `upsert-phase-catalog-entry` (planning-generation hygiene + assign-task-phase-style guards), Cursor dashboard **Phase roster** with optional short descriptions and **Register future phase**, status-tab roster alignment, `KIT_SQLITE_USER_VERSION` **23** aligned with migrations, run-contract schema registration for the new commands, and `compatibility-matrix.json` task-engine **0.23.0**.

### Added

- Planning SQLite: `kit_phase_catalog` table and migration from user version **22 → 23**.
- Task engine: `list-phase-catalog`, `upsert-phase-catalog-entry`; phase catalog store and dashboard `phaseCatalog` on `dashboard-summary`.
- Cursor extension: phase roster card, register-phase flow, phase key suggestions from catalog.

### Changed

- `KIT_SQLITE_USER_VERSION` now **23** to match `migrateKitSqliteSchema` (fixes drift where migrations advanced without bumping the exported constant).
- `schemas/task-engine-run-contracts.schema.json`: register `list-phase-catalog` and `upsert-phase-catalog-entry`.
- Maintainer data: `compatibility-matrix.json` task-engine version **0.23.0** (matches `task-engine-internal`).

## [0.84.0] - 2026-05-10

Phase 87 — **Future phase scheduling for assignments, dashboard phase journal, wishlist patch parity, and intake canon**. Ships workspace phase scheduling metadata for queue health and `assign-task-phase` (current vs future buckets), Cursor dashboard integration for `list-phase-notes` / `get-phase-context` with dismiss / convert / persist flows and proposal acceptance routed through phase QuickPick plus `assign-task-phase`, `update-wishlist` schema alignment for `patch` vs `updates`, and canon updates under `.ai/AGENTS.md` / agent routing for backlog machine snapshots.

### Added

- Task engine: `workspacePhaseScheduling` and related queue/dashboard surfaces for leading-digit phase targets relative to workspace current phase (`get-next-actions`, `dashboard-summary`, `assign-task-phase`, `queue-health`).
- Cursor extension: Overview **Phase notes** card with kit-backed **Dismiss**, **Convert**, **Persist convertible suggestions**; proposed **Accept** / **Accept All** prompts for target phase then `run-transition` + `assign-task-phase`.

### Changed

- `update-wishlist`: JSON schema documents `patch` as an alias for `updates` (contracts + handler parity).
- Maintainer/agent canon: AGENTS backlog exception for machine snapshots under `docs/maintainers/data/` when no `.ai/` equivalent exists.

## [0.83.0] - 2026-05-10

Phase 85 — **First-run init UX, dashboard phase reassignment, and operator README alignment**. Ships `workspace-kit init` (detect → plan → apply → SQLite → starter task → doctor validation), `refresh-context` for profile regeneration, `wk start` for quick status, Cursor dashboard wiring for `assign-task-phase` with richer phase suggestions and accessibility on phase controls, execution-queue scope footnote on the Ready Execution rollup, and README quick start ordering (**install → init → doctor → start**) plus CLI regression tests for `init --dry-run` / `--json`. Includes ADR **`ADR-workspace-kit-init-first-run-v1`**.

### Added

- CLI **`init`** with **`--dry-run`**, **`--json`**, **`--yes`**, **`--approval-rationale`**, **`--no-starter-task`**; detection/plan/apply modules and SQLite bootstrap via existing planning preparation.
- CLI **`refresh-context`** (formerly overloaded **`init`** behavior) requiring an existing profile.
- CLI **`start`** for a concise post-init status line.
- **`doctor`** remediation surfaces **`workspace-kit init`** for unattached repos (instead of steering first-run users to **`upgrade`** alone).
- Cursor extension: phase reassignment flow, expanded phase key suggestions from dashboard summaries, **`wc-ready-scope-note`** on Ready Execution when the queue is empty.

### Changed

- Generated **README** quick start documents non-interactive approval options and puts **`init`** before **`doctor`**.

## [0.82.0] - 2026-05-08

Phase 84 — **CAE guidance authoring surfaces, workspace artifact lifecycle, and guidance-pack operator UX**. This release extends CAE workspace authoring (templates, validation, duplicate-from-workspace), workspace artifact integrity scanning, archive and hard-delete for retired artifacts, guidance reconciliation with export and dry-run checkpoints, compound guidance scope rows with preview coercion, and the Cursor extension Guidance panel (portability tab, bulk activations, preview matrix). Parity wiring registers the CAE guidance authoring recovery runbook in the maintainer coverage map.

### Added

- Workspace artifact templates with markdown validation and duplicate-from-workspace flows for CAE authoring.
- Workspace artifact integrity scanning for orphan paths and broken references.
- Archive and hard-delete flows for retired workspace artifact files.
- Compound guidance scope AND rows with preview coercion for safer operator edits.
- Cursor extension: Guidance portability tab, bulk activations UI, and preview matrix for concurrent guidance rows.
- Maintainer runbook mirror and coverage-map entry for CAE guidance authoring recovery.

### Changed

- CAE guidance pack workflows surface reconcile defaults with export and dry-run operator checkpoints.

## [0.81.0] - 2026-05-06

Phase 80/81 — **Agent presentation policy and WC Agent status workflow**. This release adds a configurable, safety-bounded presentation policy for agent-visible communication and the WC Agent status banner/activity workflow for dashboard and operator visibility.

### Added

- Phase 80 agent presentation policy: new `agentPresentation.*` config keys, resolved `resolve-agent-guidance` / `dashboard-summary` policy metadata, always-applied Cursor rule sync for visible work-log/rationale/technicality/final-answer detail, CAE scoped presentation Guidance examples, and safety tests that keep private reasoning undisclosed while preserving blockers, approvals, destructive-action warnings, verification failures, and residual-risk reporting.
- Phase 81 WC Agent status banner workflow: `dashboard-summary.agentStatus`, derived task/planning/delegation status, expiring live activity leases, explicit `set-agent-activity` / `clear-agent-activity` commands, PR/release/approval/validation label mappings, and Cursor dashboard Complete & Release activity recording.

### Changed

- Response-template shaping can project bounded `data.presentation.agentPresentation` metadata when command payloads already include resolved policy; generated Cursor rules remain the early chat instruction mechanism and response templates remain output metadata.

## [0.79.2] - 2026-05-05

Hotfix for the **`0.79.1`** attached-workspace package file allowlist.

### Fixed

- The npm package file allowlist now uses a recursive module instruction glob, ensuring built-in instruction markdown files are included by `npm publish`, not only by local `pnpm pack` dry-runs.

## [0.79.1] - 2026-05-05

Hotfix for attached workspaces upgrading to **`0.79.0`**.

### Fixed

- Installed package runs now resolve built-in module instruction contracts from the package root instead of the attached project root, fixing `workspace-kit doctor` failures such as missing `src/modules/workspace-config/instructions/explain-config.md` in consumer projects.
- The npm package now includes every built-in module `config.md` and `instructions/` directory required by module contract validation.

## [0.79.0] - 2026-05-05

Phase 79 — **Cursor status dashboard, Phase Journal CAE activation, and native SQLite runtime hardening**. This release adds a richer `dashboard-summary` status payload and Cursor editor status dashboard, phase-scoped CAE guidance for Phase Journal workflows, Node version markers for Workflow Cannon development, and first-class `better-sqlite3` diagnostics/recovery for mixed Node architecture setups.

### Added

- Cursor extension status dashboard: command palette entry, singleton editor WebviewPanel, themed status rendering, debounced kit-state refresh, README coverage, and render tests.
- `dashboard-summary` `systemStatus` fields for phase/workspace health, doctor issues, module posture, CAE lines, identity, and SQLite planning-store details.
- CAE Phase Journal operator artifact and Phase 79 activations for journal-oriented `wk run` workflows.
- Native SQLite diagnostics: reusable classifier for architecture mismatch, ABI mismatch, missing binding, toolchain failure, and generic native load errors.
- `setup:dev` package script plus `.nvmrc` / `.node-version` Node 22 markers for architecture-safe development setup.

### Changed

- `workspace-kit doctor` now prints native SQLite runtime identity (`node`, version, arch, platform, ABI) and points to the recovery runbook.
- `postinstall` native SQLite recovery logs the active runtime/install root and attempts rebuilds for known recoverable `better-sqlite3` load failures.
- Cursor extension Node selection now considers configured Node paths, `WORKSPACE_KIT_NODE`, workspace Node version markers via nvm, common install paths, and PATH, then reports candidate diagnostics when native SQLite cannot load.
- Native SQLite runbooks now document Apple Silicon arm64/Rosetta x64 recovery and rebuild flow.

## [0.78.0] - 2026-05-04

Phase 78 — **Phase journal MVP through golden integration** (`PHASE_JOURNAL.md`, SQLite **`phase_notes`** / **`phase_note_task_suggestions`**, commands **`add-phase-note`** through **`convert-phase-note-to-task`**, bounded **`phaseJournal`** on **`agent-session-snapshot`** and **`phaseContext`** on **`get-next-actions`**, **`run-transition`** **`phaseNotes`**, retention + secret guard + critical-note policy, agent read contracts). **`T100040`** adds a CI golden integration test for the journal example workflow; **`T100027`** fixes **`generate-document`** so the AI surface defaults to **preserve** (no accidental stub overwrite of **`.ai/README.md`** / **`chat_feature|`** sources).

### Added

- Phase journal store, migrations, projections, and task-engine command surface (see **`PHASE_JOURNAL.md`** and **`tasks/phase-journal-phase78-batch*.json`**).
- **`schemas/agent-phase-journal-read-contract.v1.json`** and runtime contract wiring for agent-facing payloads.
- Golden integration test **`PHASE_JOURNAL example workflow — golden integration (T100040)`** in **`test/task-engine.test.mjs`**; **`CONTRIBUTING.md`** pointer for how to run it.

### Changed

- **`generate-document`**: default **`overwriteAi`** is **`false`** when neither **`overwriteAi`** nor **`overwrite`** is set, matching **`document-project`** batch behavior (**`T100027`**).

## [0.77.0] - 2026-04-30

Phase 77 — **Megamodule refactor execution (REF-001–REF-010)**: planning SQLite kernel in `core/state/kit-sqlite/planning-sqlite-kernel.ts` with stable `workspace-kit-sqlite` barrel; **REF-004** sibling-import CI gate and core `task-skill-validation`; **REF-005** planning `build-plan` helpers extracted; **REF-007** CLI `run-helpers` (`peelRunArgv`, `policyDeniedBody`); **REF-008** config metadata registry access split; **REF-009** `adapters/` re-exports kit SQLite open path (direction C); **REF-010** additive `package.json` `exports["./modules"]`; **REF-006** CAE kit-SQLite implementation under `core/cae/persistence/` with shim re-export. Execution tasks **T100017–T100026** and linked proposal specs under `tasks/refactor-proposals/`.

### Added

- **`@workflow-cannon/workspace-kit/modules`** export mapping to `dist/modules/index.js` (`defaultRegistryModules` and module barrel).
- **`src/core/state/kit-sqlite/planning-sqlite-kernel.ts`**: canonical `user_version` / migration ladder; compatibility barrel in `workspace-kit-sqlite.ts`.
- **`scripts/check-module-sibling-imports.mjs`** plus allowlist for **REF-004** module import hygiene.

### Changed

- **Planning** `build-plan`: interview helpers moved to `build-plan-output-helpers.ts` / `build-plan-execution-drafts.ts`.
- **CLI** `wk run`: argv peel + policy denial body live in `src/cli/run-helpers.ts`.
- **Config**: `config/metadata/access.ts` holds registry JSON accessors; `config-metadata.ts` keeps validators + re-exports.
- **CAE**: `cae-kit-sqlite` implementation path is `core/cae/persistence/` (public import path unchanged).
- **`adapters/index.ts`**: re-exports `prepareKitSqliteDatabase` / `readKitSqliteUserVersion` (and related) from the kit SQLite kernel; **`src/README.md`** layering copy aligned.

## [0.76.0] - 2026-04-29

Phase 76 — **Agent CLI ergonomics + token efficiency**: task-engine **`list-tasks`** discovery (`id` / `ids` / `idPrefix`, `limit`, `nextCursor`), **`create-task`** **`allocateId`**, **`apply-task-batch`**, dry-run on create/update paths, planning-generation error payloads with remediation; slim **`AGENT-CLI-MAP`** + **`.ai/agent-cli-snippets/`**, instruction **agent capsules** (CI), **`.ai/TERMS.index.json`**, runbooks/ADRs README → **`HUB.md`** routing; **`wk run --json`** (`run-command-catalog`), **`wk doctor --json`**, richer **`policy-denied`** (`readCommandSuggestion`); **`agent-bootstrap`** **`cliFootguns`**; instruction-surface rows include **`jsonApprovalRequired`** / **`policyOperationId`** when built with **`effectiveConfig`**. Improvement batch **T100000–T100006** included.

### Added

- **`workspace-kit run --json`**: stable catalog JSON for agents (no subcommand); default text menu unchanged.
- **`workspace-kit doctor --json`**: single JSON envelope for contract pass/fail (distinct from **`--agent-instruction-surface`**).
- **`policy-denied`** responses: **`argvTemplateJson`**, schema-only and per-command snippet path hints.
- **`agent-bootstrap`**: structured **`cliFootguns`** (invoke, **`pnpm`**, policy lanes, planning gen, discovery).
- Instruction catalog: optional **`jsonApprovalRequired`** + **`policyOperationId`** on rows when **`effectiveConfig`** is supplied.

### Changed

- **`.ai/WORKSPACE-KIT-SESSION.md`** and top-level **`--help`**: bootstrap bullets for JSON doctor/run and snippet index.

## [0.75.0] - 2026-04-29

Phase 75 — **Guidance authoring pipeline + maintainer delivery ergonomics**: product-shaped **Guidance** scope builder (**`T1000`**), real draft **impact preview** (**`T1001`**), **blast-radius / activation-readiness** summaries (**`T1002`**), and a dashboard **authoring wizard** in the Cursor extension (**`T1003`**). Maintainer/agent loop improvements: **`maintainerDelivery`** hints on **`agent-session-snapshot`** / **`get-next-actions`**, **`doctor --delivery-loop`** / **`--delivery-loop-strict`**, CAE **`cae-guidance-preview`** advisory on dirty protected branches, **`apply-task-batch`**, **`list-tasks`** pagination optimizations, slim **`AGENT-CLI-MAP`** with **`.ai/agent-cli-snippets/`**, instruction agent capsules, **`.ai/TERMS.index.json`**, and doc routing hub checks.

### Added

- Guidance **scope builder**, **draft impact preview**, **enforcement / blast-radius readiness** contracts, and extension **guidance wizard** flows tied to shipped phase tasks **`T1000`–`T1003`**.
- **`maintainerDelivery`** v1 hints; optional task metadata **`maintainerDeliveryProfile`** / **`requiresPhaseBranch`**.
- **`doctor --delivery-loop`** / **`--delivery-loop-strict`**; CAE synthetic maintainer-delivery advisory card on guidance preview when gated.
- **`apply-task-batch`**; **`list-tasks`** stable cursor pagination; generated per-command CLI snippet JSON under **`.ai/agent-cli-snippets/`** with repository check scripts.

### Changed

- **`.ai/AGENT-CLI-MAP.md`** split vs **`.ai/AGENT-CLI-MAP.extended.md`**; **`.ai/WORKSPACE-KIT-SESSION.md`** and **`.cursor/rules/maintainer-delivery-loop.mdc`** aligned with delivery-loop discipline.

## [0.72.0] - 2026-04-27

Phase 72 — **Phase-control ergonomics** (**`T942`–`T946`**): SQLite-first workspace phase control with **`set-current-phase`**, read-only **`phase-status`** for canonical phase / drift / task counts, explicit next-phase task creation options on **`persist-planning-execution-drafts`**, reconciled agent guidance for workspace phase authority, and **`update-workspace-phase-snapshot`** demoted to a compatibility shim that updates SQLite/export before legacy YAML.

### Added

- **`set-current-phase`** command for retry-safe, SQLite-first phase rollover with config hint and export verification.
- **`phase-status`** command for read-only canonical phase, drift, export freshness, and optional phase task counts.
- **`persist-planning-execution-drafts`** target phase/status options for explicit next-phase task creation.

### Changed

- Agent guidance now treats **`kit_workspace_status`** as canonical when available and **`kit.currentPhaseNumber`** as a bootstrap / UX hint.
- **`update-workspace-phase-snapshot`** remains compatible but no longer teaches or performs a YAML-first happy path.

## [0.71.0] - 2026-04-26

Phase 71 — **CAE Guidance dashboard MVP** (**`T934`–`T941`**): Guidance view polish for task/workflow picker UX, persisted UI-friendly trace summaries, trace detail panels, structured `commandArgs`, acknowledgement/feedback result cards, conflict and match-reason copy, degraded-state recovery cards, and release-readiness smoke evidence. Kit SQLite bumps to **user_version 14** with additive nullable `cae_trace_snapshots.summary_json`; existing trace rows remain readable through derived-summary fallback.

### Added

- Cursor extension **Guidance** picker flow: ready/in-progress task choices, curated workflow defaults, and manifest-backed workflow search.
- Persisted CAE trace summary metadata for task/workflow labels, family counts, acknowledgement count, conflict count, eval mode, and storage.
- Guidance trace detail panels, conflict cards, per-card match-reason copy, structured `commandArgs`, and friendly acknowledgement/feedback result cards.

### Changed

- `cae-recent-traces` prefers persisted summary metadata and falls back to old trace/bundle JSON for compatibility.
- `.ai/cae/dashboard-guidance-plan.md` records Phase 71 smoke evidence and marks Guidance MVP tracker items complete.

## [0.66.0] - 2026-04-08

Phase 66 — **README tri-surface, agent cold start, planning finalize clarity** (**`T792`–`T805`**): `generate-document` / `document-project` for **`README.md`** also writes **repo-root `README.md`** (agent notice, `title_image` path, link rewrites from maintainer body). New read-only **`workspace-kit run agent-bootstrap`** runs the same contract checks as **`workspace-kit doctor`** then returns the **`agent-session-snapshot`** bundle. **`build-plan`** soft finalize (`planning-ready-with-warnings`) includes **`data.finalizeWarnings`**. Doctor contract path extraction to **`src/cli/doctor-contract-validation.ts`**. Agent rule **A032** and workflow-contract: do not hand-edit module-owned root README; refresh via documentation module.

### Added

- **`agent-bootstrap`** command (manifest, instruction, pilot args schema, run-contracts entry).
- **`finalizeWarnings`** envelope for **`planning-ready-with-warnings`** responses.
- **`overwriteRepoRootReadme`** option and **`buildRepoRootReadmeFromMaintainerBody`** transform helper.

### Changed

- **`templates/README.md`** — expanded from prior root README (maintainer-relative links; chat block uses `<!--DOC_MODULE:CHAT_FEATURES-->`).
- **`.ai/WORKSPACE-KIT-SESSION.md`**, **`.ai/AGENT-CLI-MAP.md`** — document **`agent-bootstrap`** as preferred cold start.
- **`schemas/pilot-run-args.snapshot.json`**, **`schemas/task-engine-run-contracts.schema.json`** — **0.66.0** / new command.

## [0.65.0] - 2026-04-07

Phase 65 — **Dashboard + phase-closeout operator path + policy canon** (**`T784`–`T791`**): Cursor slash **`/complete-phase <N> [approve-release]`** (**.cursor/commands/complete-phase.md**); dashboard **Complete & Release** chat prompt aligned; **`.ai/POLICY-APPROVAL.md`** callout that slash/chat are intent only for Tier A/B **`wk run`**; **`.ai/playbooks/phase-closeout-and-release.md`** §4 pointer; **`.ai/RELEASING.md`** intent **I005**; **`.ai/runbooks/agent-playbooks.md`** + maintainer mirror refreshed for §7 tokens and agent-first paths. Extension **0.1.13** — **`list-approval-queue`** fetched with **`dashboard-summary`**; task rows **View** + tertiary styling; team/subagent rollup parity documented; refresh tooltip + README note on automatic reload.

### Added

- **`.cursor/commands/complete-phase.md`** — phase closeout checklist with **`approve-release`** publish gate.

### Changed

- **`extensions/cursor-workflow-cannon`** — Approvals card live queue; View buttons; refresh copy; README discovery for **`/complete-phase`**.
- **`.ai`** — Policy, phase-closeout, agent-playbooks runbook, RELEASING intent; maintainer playbook mirrors regenerated where applicable.

## [0.64.1] - 2026-04-07

Phase 64 patch — **Effective behavior Cursor rule + collaboration surfaces + maintainer CLI parity** (**`T770`**, **`T773`**, **`T780`**, **`T781`**, **`T782`**, **`T783`**): Tier C **`sync-effective-behavior-cursor-rule`** writes **`.cursor/rules/workflow-cannon-effective-agent-behavior.mdc`** from resolved role × temperament; auto-refresh after common profile / **`set-agent-guidance`** mutators (fail-open); Cursor extension debounces the same command on kit file changes and watches **`.workspace-kit/modules/agent-behavior/config.json`**. Dashboard **Collaboration profiles** quick action + README pointers; **New Plan** chat seed uses **`pnpm exec wk`** and mentions **`list-wishlist`**. Maintainer **`AGENT-CLI-MAP.md`** Tier B copy-paste aligned for **`doc.generate-document`** and **`task-engine.backfill-task-feature-links`** (**`policyApproval`** + **`expectedPlanningGeneration`**). Cursor extension **0.1.12**.

### Added

- **`sync-effective-behavior-cursor-rule`** command + instruction; **`.ai/AGENT-CLI-MAP.md`** Tier C catalog line.

### Changed

- **`agent-behavior`** / **`workspace-config`** — best-effort post-mutation Cursor rule sync.
- **`extensions/cursor-workflow-cannon`** — collaboration hub prefill, planning prompt wording, phase-closeout chat prompt test alignment.

## [0.64.0] - 2026-04-06

Phase 64 — **Task-flow subagent packaging + task-linked checkpoints** (**`T745`–`T751`**): optional Cursor rule/skill for single-task delivery; kit SQLite **`user_version` 9** with **`create-checkpoint`**, **`list-checkpoints`**, **`compare-checkpoint`**, **`rewind-to-checkpoint`**; opt-in **`kit.autoCheckpoint`** before selected `wk run` commands; ADRs **`.ai/adrs/ADR-cursor3-task-flow-subagent-packaging.md`** and **`.ai/adrs/ADR-task-linked-checkpoints-v1.md`**.

### Added

- **`checkpoints` module** — git head/stash checkpoints persisted in **`kit_task_checkpoints`**; stash pathspec excludes **`.workspace-kit/`**; clean/dirty detection ignores kit noise for stash/rewind decisions.
- **`kit.autoCheckpoint.*`** config keys — default off; **`beforeCommands`** includes **`run-transition`** when enabled.
- **`.cursor/rules/playbook-task-flow-subagent.mdc`**, **`.cursor/skills/task-flow-subagent-delivery/SKILL.md`**, pilot notes **`.ai/runbooks/task-flow-subagent-pilot-phase64.md`**.

### Changed

- **`SqliteDualPlanningStore.closeDatabase()`** — optional handle release for same-path reopen (auto-checkpoint + router sequencing).


## [0.63.0] - 2026-04-06

Phase 63 — **Agent canon + wishlist routing** (**`T705`**, **`T708`**): durable **`.ai`** pointers for principal architecture review themes; wishlist intake playbook explicitly separates **agent `.ai` paths** from maintainer-rendered **`docs/maintainers`** mirrors.

### Added

- **`.ai/runbooks/principal-architectural-review-themes.md`** — ranked themes (contracts/schemas, task-engine gravity, extension drift) with anchors.
- **`AGENT-CLI-MAP.md`** — link to the architecture review index runbook.

### Changed

- **`.ai/playbooks/wishlist-intake-to-execution.md`** — **Agent paths vs maintainer-rendered mirrors** callout; queue facts via CLI snapshot commands.
- **`docs/maintainers/data/ai-to-docs-coverage.json`** — map **`.ai/runbooks/principal-architectural-review-themes.md`** for Phase 56 orphan/drift gates.
- **`MACHINE-PLAYBOOKS.md`** — wishlist playbook path note for agents vs generated maintainer copies.

## [0.62.1] - 2026-04-06

Patch — **Phase 62 completion** (**`T707`**, **`T709`**): playbook §**2b** for parallel task chains + ROADMAP coupling; agent ergonomics runbook **§0** natural-language → command exemplar map; **`AGENT-CLI-MAP`** pointer.

### Added

- **`.ai/playbooks/task-to-phase-branch.md`** — parallel chains / cross-link expectations.
- **`.ai/runbooks/agent-task-engine-ergonomics.md`** — exemplar intent → `wk run` table.

## [0.62.0] - 2026-04-06

Phase 62 — **Maintainer operability** (**`T703`–`T704`**, **`T742`–`T744`**): operator-facing **`AGENT-CLI-MAP`** for runtime `wk run` argv, team execution + subagent persistence map, wishlist intake ladder, SQLite failure hints tied to **`native-sqlite-consumer-install.md`**, and explicit **`policyApproval`** recipes for **`doc.generate-document`** and **`task-engine.backfill-task-feature-links`**.

### Added

- **`AGENT-CLI-MAP.md`** — runtime invocation section; team/subagent inspection vs mutate map; wishlist intake ladder pointer.
- **`POLICY-APPROVAL.md`** — copy-paste blocks for **`doc.generate-document`** and **`task-engine.backfill-task-feature-links`**.
- **`doctor`** summary line — team assignment / subagent CLI entrypoints + ADR pointers.
- **`wishlist-workflow.md`** — operator ladder (playbook → commands → surfaces).

### Changed

- **`task-engine`** module **`0.21.0` → `0.22.0`** — doctor / SQLite validation messages cite consumer recovery runbook; **`ensure-native-sqlite.mjs`** stderr points at the same runbook.
- **`generate-document`** / **`backfill-task-feature-links`** instructions — policy / planning-generation notes aligned with **`AGENT-CLI-MAP`**.

## [0.61.0] - 2026-04-05

Phase 61 — **Claude Code plugin platform v1** (**`T684`–`T687`**): ADR + JSON Schema for **`.claude-plugin/plugin.json`**, **`plugins.discoveryRoots`**, read-only **`list-plugins`** / **`inspect-plugin`**, Tier B **`install-plugin`** / **`enable-plugin`** / **`disable-plugin`** (**`plugins.persist`**), kit SQLite **`user_version` 8** + **`kit_plugin_state`**, **`workspace-kit doctor`** plugin summary line, reference fixture under **`docs/examples/claude-plugins/`**, CI **`scripts/ci-plugin-fixture-smoke.mjs`**, maintainer **`AGENT-CLI-MAP`** + run-args waivers for mutators.

### Added

- **`plugins`** module (**`0.1.0`**) — discovery, manifest validation (**`schemas/claude-plugin-manifest.schema.json`**), SQLite enablement; policy **`plugins.persist`**.
- **`docs/maintainers/adrs/ADR-claude-code-plugin-platform-v1.md`** — cited Anthropic baseline + explicit non-goals / gap list.

### Changed

- **`task-engine`** module **`0.20.0` → `0.21.0`**; **`KIT_SQLITE_USER_VERSION` `8`**; **`get-kit-persistence-map`** documents **`kit_plugin_state`**.
- **`task-engine-run-contracts`** / **`pilot-run-args.snapshot.json`** / **`compatibility-matrix.json`** aligned with **`v0.61.0`**.

## [0.60.0] - 2026-04-05

Phase 60 — **architecture / platform follow-through** (**`T689`–`T740`** and split tasks): unified **task-engine** CLI JSON validation via **`schemas/pilot-run-args.snapshot.json`** (all manifest task-engine commands), **`BEGIN IMMEDIATE`** planning SQLite transactions, **`agent-session-snapshot`**, **`get-next-actions`** **`teamExecutionContext`**, **`dashboard-summary` `schemaVersion` 3** + **`subagentRegistry`**, published contract subpaths, maintainer doc corrections (SQLite-only persistence), planning mutator matrix + waivers check.

### Added

- **`workspace-kit run agent-session-snapshot '{}'`** — read-only composed JSON (planning meta, suggested next, queue-health summary, canonical phase / doctor mismatch hints, open team assignments).
- **`schemas/planning-generation-cli-prelude.json`** + CLI prelude for **`planning-generation-required`** on selected mutators when policy is **`require`** (e.g. cross-module **`generate-recommendations`** / **`ingest-transcripts`**).
- **`schemas/run-args-cli-validation-waivers.json`** + **`pnpm run check`** stage for sensitive commands outside task-engine contracts.
- **`docs/maintainers/data/planning-generation-mutators.md`** — operator matrix for planning-generation behavior.
- Package **`exports`**: **`./contracts/agent-session-snapshot-run`**, **`./contracts/next-actions-run`**.

### Changed

- **Pilot run-args** — snapshot covers **all** task-engine commands from **`task-engine-run-contracts.schema.json`**; **`wk run <cmd> --schema-only`** uses snapshot schemas + generated samples.
- **`SqliteDualPlanningStore`** — persist transactions use **`BEGIN IMMEDIATE`** (writer serialization).
- **`get-next-actions`** — additive **`teamExecutionContext`** (open team assignments, read-only).
- **`dashboard-summary`** — **`data.schemaVersion` 3** + **`subagentRegistry`** read-only facet; Cursor extension **0.1.8** renders **Subagent registry** card.
- **`task-engine`** module **`0.19.0` → `0.20.0`**; **`task-engine-run-contracts`** / **`compatibility-matrix.json`** aligned with **`v0.60.0`**.
- **`ARCHITECTURE.md`** — remove stale runnable **`tasks.persistenceBackend: json`** wording; **`README.md`** / **`.ai/WORKSPACE-KIT-SESSION.md`** — **`doctor --agent-instruction-surface`**, **`agent-session-snapshot`**, Tier A/B **`--schema-only`** guidance.

## [0.59.0] - 2026-04-05

Phase 59 — **Improvement Scout** (**`T679`–`T683`**): bounded scout playbook, read-only **`scout-report`**, optional rotation memory, optional ingest **`heuristic_2`**. The earlier Cursor chat prefill track **`T668`–`T670`** remains **`cancelled`**.

### Added

- Playbook **`improvement-scout`** (canonical **`.ai/playbooks`** + maintainer mirror) — primary/adversarial lens catalog, target zones, question stems, evidence floor (≥2 anchors), emit cap, optional scout **`metadata`** keys documented for improvement tasks.
- **`workspace-kit run scout-report`** — non-sensitive JSON rehearsal (`code: scout-report-emitted`); optional **`persistRotation: true`** appends to **`scoutRotationHistory`** (improvement operational state schema **`3`**, FIFO cap **32**).
- Config **`improvement.recommendations.heuristicVersion`** **`1`** (default) or **`2`** — alternate mean-of-signals admission curve; new recommendation rows include **`metadata.heuristicVersion`**.
- Example shape: **`tasks/improvement-scout-proposal.example.md`**.
- Unit tests: **`test/scout-rotation.test.mjs`**, **`test/improvement-heuristic-2.test.mjs`**.

### Changed

- **`improvement`** module **`0.9.1` → `0.10.0`**; **`docs/maintainers/data/compatibility-matrix.json`** updated.
- **`TERMS.md`**, **`AGENT-CLI-MAP`**, **`FEATURE-MATRIX.md`**, roadmap sources + generated **`ROADMAP.md`** / **`.ai/ROADMAP.md`** for Phase 59 closeout; maintainer **`AGENTS.md`** playbook index lists **`improvement-scout`**.

## [0.58.2] - 2026-04-05

Phase 58 visibility — **`dashboard-summary`** surfaces **`kit_team_assignments`** for operators (**`T728`**), plus maintainer doc pipeline / ADR folder hygiene and improvement-task metadata tightening from the prior unreleased train.

### Added

- **`dashboard-summary` `data.schemaVersion` 2** — read-only **`teamExecution`** facet: counts by status, **`topActive`** (up to 15 in-flight rows: assigned / submitted / blocked) with **`executionTaskTitle`** resolved from the task store when the **`T###`** exists. Cursor extension **0.1.7** renders a **Team assignments** card (read-only).
- **Improvement tasks** — **`generate-recommendations`** (and ingest-driven generation) now mint the next **`T###`** id instead of **`imp-*`** hashes; new rows include **`metadata.supportingReasoning`**. **`create-task`** / **`update-task`** require **`metadata.issue`** and **`metadata.supportingReasoning`** for **`type: "improvement"`** except legacy **`imp-<hex>`** rows (may add reasoning on a later update). Playbooks and **`AGENT-CLI-MAP`** updated for problem-report logging and cadence hints.

### Changed

- Maintainer ADRs consolidated under **`docs/maintainers/adrs/`** (imports and cross-links updated). Phase **59** Cursor chat prefill experiments **`T668`–`T670`** **`cancelled`** (**2026-04-04**); roadmap pointer + maintainer status YAML aligned. Maintainer snapshot + **`kit.currentPhaseNumber`** reset to **Phase 58** as current; **`current_kit_phase` / `next_kit_phase` 58**.
- **`task-engine-run-contracts`** / pilot validation metadata aligned with **`v0.58.2`**.
- **`compatibility-matrix.json`** — **`improvement`** module **`0.9.0` → `0.9.1`** (runtime alignment).

## [0.58.1] - 2026-04-04

Phase 58 follow-up — extension dashboard UX (**`T672`–`T673`**) and behavior interview hardening (**`T674`–`T678`**).

### Added

- **`interview-behavior-profile`** — **`action:status`** (read-only resume); **`start`** refuses to wipe an existing session unless **`forceRestart:true`**; **`finalize`** without **`customId`** allocates **`custom:chat-behavior-interview`** (+ numeric suffixes); playbook fingerprint gate in **`pnpm run check`**.
- **Cursor extension `0.1.6`** — Tasks tree + drag-and-drop removed; dashboard uses nested **`<details>`** rollups (closed by default) and **Detail** buttons for task rows / suggested next (opens markdown task detail).

### Changed

- **`.ai/playbooks/workspace-kit-chat-behavior-interview.md`** (+ generated maintainer mirror) — documents **`status`**, safe **`start`**, default finalize path.

## [0.58.0] - 2026-04-04

Phase 58 — **Team execution v1** (**`T665`–`T667`**): supervisor/worker assignment rows + handoff/reconcile contracts in kit SQLite; CLI + runbook; **`get-next-actions`** integration explicitly deferred.

### Added

- **SQLite `user_version` 7** — Table **`kit_team_assignments`** (migration in **`src/core/state/workspace-kit-sqlite.ts`**).
- **`team-execution` module** (`0.1.0`) — **`list-assignments`**; mutating: **`register-assignment`**, **`submit-assignment-handoff`**, **`block-assignment`**, **`reconcile-assignment`**, **`cancel-assignment`** (**`team-execution.persist`**).
- **ADR** — **`docs/maintainers/adrs/ADR-team-execution-v1.md`**; runbook **`docs/maintainers/runbooks/team-execution-supervisor.md`**.
- **`get-kit-persistence-map`** — **`teamExecution`** section + **`workspace_module_state.knownModuleIds`** includes **`team-execution`**.

### Changed

- **Task-engine module** — **`0.19.0`** (persistence map + registry ordering unchanged for consumers except new metadata keys).
- **Maintainer docs** — **`ARCHITECTURE.md`**, **`AGENT-CLI-MAP.md`**, **`src/modules/README.md`**, **`ADR-subagent-registry-v1.md`** (Phase 58 cross-link).

## [0.57.0] - 2026-04-04

Phase 57 — **Native subagents v1** (**`T662`–`T664`**): kit-owned definitions + session/message persistence; Cursor remains execution host.

### Added

- **SQLite `user_version` 6** — Tables **`kit_subagent_definitions`**, **`kit_subagent_sessions`**, **`kit_subagent_messages`** (migration in **`src/core/state/workspace-kit-sqlite.ts`**).
- **`subagents` module** (`0.1.0`) — Commands: **`list-subagents`**, **`get-subagent`**, **`list-subagent-sessions`**, **`get-subagent-session`**, **`register-subagent`**, **`retire-subagent`**, **`spawn-subagent`**, **`message-subagent`**, **`close-subagent-session`**. Mutations use policy operation **`subagents.persist`**.
- **ADR** — **`docs/maintainers/adrs/ADR-subagent-registry-v1.md`**; runbook **`docs/maintainers/runbooks/subagent-registry.md`** (generated from **`.ai/runbooks/subagent-registry.md`**).
- **`get-kit-persistence-map`** — **`subagents`** section documents tables and minimum **`user_version`**.

### Changed (maintainer docs)

- **`roadmap-data.json`** / **`roadmap-phase-sections.md`** + regenerated **`ROADMAP.md`** for **`v0.57.0`** / Phase **58** pointer.
- **`ai-to-docs-coverage.json`** — maps **`.ai/runbooks/subagent-registry.md`** → **`docs/maintainers/runbooks/subagent-registry.md`**.

### Changed (module versions)

- **Task-engine module** — **`0.18.0`** (schema bump); **subagents** — **`0.1.0`** (compatibility matrix).

## [0.56.0] - 2026-04-04

Phase 56 — **Lifecycle hooks** (**`T645`–`T648`**) + **`.ai` → `docs/maintainers/` pipeline** (**`T654`–`T661`**).

### Added

- **Hooks** — ADR **`ADR-agent-task-lifecycle-hooks-v1.md`**; **`kit.lifecycleHooks.*`** (enabled, mode, trace path, handlers); **`KitLifecycleHookBus`** in **`src/core/kit-lifecycle-hooks.ts`**; integration on **`workspace-kit run`** module commands and **`TransitionService`** (transition + task-store persist); runbook **`runbooks/lifecycle-hooks.md`**; reserved **`before-pr-mutation`** / **`after-pr-mutation`** stubs.
- **Docs pipeline** — ADR **`ADR-ai-canonical-maintainer-docs-pipeline.md`**; **`docs/maintainers/data/docs-from-ai-exceptions.yaml`** + **`ai-to-docs-coverage.json`**; **`pnpm run generate-maintainer-docs-from-ai`**; **`check-ai-to-docs-drift`** + **`check-orphan-ai-sources`** in **`pnpm run check`**.

### Changed (maintainer docs)

- Covered **workbooks**, **runbooks**, and **playbooks** under **`docs/maintainers/`** are emitted from **`.ai/`** with a generator banner; **`AGENTS.md`**, **`TERMS.md`**, and **`module-build-guide.md`** updated for the new workflow.

### Changed (module versions)

- **Workspace-config module** — **`0.7.0`**; **task-engine module** — **`0.17.0`** (compatibility matrix).

## [0.55.0] - 2026-04-03

Phase 55 — **GitHub-native invocation** (**`T649`–`T653`**): ADR **`ADR-github-native-invocation.md`**, **`kit.githubInvocation.*`** config + validation, **`src/core/github-invocation.ts`**, reference runner **`tools/github-invocation/run-github-delivery.mjs`**, runbook **`runbooks/github-workflow-cannon-invocation.md`**, sample **`docs/examples/github/workflow-cannon-invocation.sample.yml`**. Wishlist provenance **`T566`**.

### Added

- **Config** — **`kit.githubInvocation.enabled`**, **`allowedRepositories`**, **`eventPlaybookMap`**, **`commentDebounceSeconds`**, **`rateLimitEventsPerHour`** (placeholder), **`planOnlyRunCommands`**, **`sensitiveRunCommands`**; generated **`CONFIG.md`** / **`.ai/CONFIG.md`** updated.
- **Library** — Webhook HMAC-SHA256 verification, slash-command routing, repo allowlist helper, structured audit record builder (exported from **`@workflow-cannon/workspace-kit`**).
- **Runner** — Plan route invokes allowlisted **`workspace-kit run`** subcommands; mutating routes require maintainer-supplied **`WORKSPACE_KIT_GITHUB_RUN_ARGS_JSON`** + **`WORKSPACE_KIT_GITHUB_RUN_POLICY_APPROVAL`** (no comment-as-approval).

### Changed (maintainer docs)

- **`POLICY-APPROVAL.md`**, **`RELEASING.md`**, **`AGENT-CLI-MAP.md`** — GitHub runner policy cross-links.

### Changed (module version)

- **Workspace-config module** — **`0.6.0`** (compatibility matrix).

## [0.54.0] - 2026-04-04

Phase 54 — **skill packs v1** (**`T640`–`T644`**): Claude Code–shaped **`.claude/skills/<id>/SKILL.md`** discovery, optional **`workspace-kit-skill.json`** sidecar (JSON Schema), **`list-skills`** / **`inspect-skill`** / **`apply-skill`** / **`recommend-skills`**, task **`metadata.skillIds`** validation, shipped sample **`.claude/skills/sample-wc-skill/`**, ADR **`ADR-skill-packs-v1.md`**.

### Added

- **Skills module** — **`0.1.0`**: discovery via **`skills.discoveryRoots`** (default **`.claude/skills`**); read commands **`list-skills`**, **`inspect-skill`**, **`recommend-skills`**; **`apply-skill`** with default preview (**`options.dryRun`** true) and optional **`recordAudit`** append to **`.workspace-kit/evidence/skill-apply-audit.jsonl`** when **`dryRun`**: false (policy **Tier B**, **`skills.apply-skill`**).
- **Schema** — **`schemas/skill-pack-manifest.schema.json`**; fixture **`scripts/fixtures/skill-pack-manifest-min.json`**.
- **Task engine** — Validates **`metadata.skillIds`** on **`create-task`** / **`update-task`** when the skills module is enabled (**`unknown-skill-id`**, **`invalid-task-skill-ids`**).

### Changed (module version)

- **Task-engine module** — **`0.16.0`**; **skills module** — **`0.1.0`** (compatibility matrix).

## [0.53.0] - 2026-04-04

Phase 53 — **relational feature registry** (**`T630`–`T639`**): SQLite taxonomy tables, authoritative **`task_engine_task_features`** junction, registry-aware task CRUD and **`list-tasks`** filters, maintainer backfill/export commands, doc generation from the planning DB when present, and CI-stable committed **`ROADMAP.md`** / **`FEATURE-TAXONOMY.md`** via **`WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY`**.

### Added

- **ADR** — **`docs/maintainers/adrs/ADR-relational-feature-registry.md`** (Path A, junction Option 1).
- **SQLite** — **`user_version` 5**: **`task_engine_components`**, **`task_engine_features`**, **`task_engine_task_features`**; **`PRAGMA foreign_keys = ON`** on kit SQLite opens; idempotent migration + seed from **`feature-taxonomy.json`**.
- **Task engine** — **`list-components`**, **`list-features`**, **`backfill-task-feature-links`**, **`export-feature-taxonomy-json`**; **`list-tasks`** filters **`featureId`** / **`componentId`**; error code **`unknown-feature-id`** for invalid feature slugs on execution tasks.
- **Documentation** — Roadmap / feature-taxonomy rendering can load taxonomy from the planning database; set **`WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY=1`** when regenerating committed maintainer markdown so **`pnpm run check`** matches CI (JSON sources) when a local planning DB exists.
- **Extension contract** — Optional **`featureDetails`** on **`dashboard-summary`** task rows (shared **`@workflow-cannon/workspace-kit/contracts/dashboard-summary-run`**).

### Changed

- **Persistence** — Task feature links authoritative in the junction; legacy **`features_json`** cleared on persist when the registry is active; reads merge junction + legacy for transition windows.
- **Run contracts / pilot** — Schema **`0.53.0`**; pilot snapshot includes **`list-features`** and extended **`list-tasks`** / **`contractListFeatures`**.

### Changed (module version)

- **Task-engine module** — **`0.15.0`**; **documentation module** — **`0.5.0`** (compatibility matrix).

## [0.52.0] - 2026-04-03

Phase 52 — **agent/human CLI ergonomics** (**`T624`–`T629`**): stable failure **`remediation`** metadata, doctor **`errorRemediationCatalog`**, pilot **`--schema-only`** JSON Schema + **`sampleArgs`**, extension + visual guide cross-links.

### Added

- **CLI JSON** — Optional **`remediation`** on `workspace-kit run` failures: **`instructionPath`** (repo-relative `src/modules/.../instructions/*.md`) and **`docPath`** (`docs/maintainers/...`); **`policy-denied`** also sets **`remediation.docPath`** (legacy **`remediationDoc`** unchanged). Router **`unknown-command`** now returns structured JSON on stdout (exit **1**) with remediation hints.
- **`doctor --agent-instruction-surface`** — Payload includes **`errorRemediationCatalog`** (stable `code` → paths). ADR: **`docs/maintainers/adrs/ADR-cli-error-remediation-contract.md`**.
- **Pilot human affordance** — **`workspace-kit run <command> --schema-only`** for **`run-transition`**, **`create-task`**, **`update-task`**, **`dashboard-summary`** → **`code: "run-args-schema"`** with bundled schema + **`sampleArgs`**. Plan: **`docs/maintainers/plans/phase-52-human-cli-affordances.md`**.
- **Maintainer docs** — **`AGENT-CLI-MAP.md`** recovery subsection; **`CLI-VISUAL-GUIDE.md`**; extension **`README`** operator note.

### Changed

- **Planning consistency script** — Treats shipped **`Phase 4 / v0.6.0` publish** evidence in **`ROADMAP.md`** as **Completed** (aligns with archived phase narrative).

### Changed (module version)

- **Task-engine module** — **`0.14.1`** (compatibility matrix).

## [0.51.0] - 2026-04-03

Phase 51 — **task-engine internal layout** (**`T621`–`T623`**): README map plus colocation under **`persistence/`**, **`wishlist/`**, **`dashboard/`**, and **`queue/`** (behavior-identical; public exports unchanged via **`index.ts`** / **`src/core/planning/`**).

### Changed

- **Task-engine module** — Source files grouped by domain; import paths and maintainer doc links updated (**`TERMS.md`**, ADRs, instruction implementation paths, core allowlist).

## [0.50.0] - 2026-04-03

Phase 50 — **T600 pilot: runtime `run` JSON args validation** (**`T616`–`T620`**).

### Added

- **CLI** — Pilot validation before module dispatch for **`run-transition`**, **`dashboard-summary`**, **`create-task`**, **`update-task`**: AJV against merged args schema; failures return **`invalid-run-args`** with **`details.errors`** (JSON Pointer–friendly paths). When **`tasks.planningGenerationPolicy`** is **`require`**, pilot mutators without **`expectedPlanningGeneration`** fail early with **`planning-generation-required`**.
- **Schemas** — **`schemas/pilot-run-args.snapshot.json`** (extracted args for pilot commands + package version pin); **`scripts/check-pilot-run-args-snapshot.mjs`** and **`scripts/refresh-pilot-run-args-snapshot.mjs`**; new **`pnpm run check`** stage **`pilot-run-args-snapshot`**.
- **Run contracts** — **`task-engine-run-contracts.schema.json`**: **`taskId`** patterns include improvements **`imp-*`**; optional **`expectedPlanningGeneration`** on **`run-transition`** / **`create-task`** / **`update-task`** args; optional **`config`** / **`actor`** on those args and on **`dashboard-summary`** args.

### Docs

- **`docs/maintainers/adrs/ADR-runtime-run-args-validation-pilot.md`**, **`module-build-guide.md`** (pilot extension), **`persisted-artifacts-and-cli-inventory.md`**.

### Changed

- **Task-engine module** — **`0.14.0`** (compatibility matrix).

## [0.49.0] - 2026-04-03

Phase 49 — **extension dashboard agent handoff + maintainer inventory** (**`T608`–`T613`**).

### Added

- **Maintainer inventory** — **`docs/maintainers/data/persisted-artifacts-and-cli-inventory.md`**: schemas, kit persistence, compatibility/status data, extension-critical **`wk run`** commands, enforcement hooks; linked from **`ARCHITECTURE.md`** with update triggers.
- **Cursor extension** — Dashboard **Proposed · improvements** / **Proposed · execution** rows: **Accept** (**`run-transition`** **`accept`** with modal rationale + **`expectedPlanningGeneration`** when required) and **Chat** (Composer seeds for **`improvement-triage-top-three`** and **`task-to-main`** playbooks). Command palette: **Prefill Chat — Improvement Triage**, **Prefill Chat — Task to Main**. Tasks tree context menu on open wishlist rows → same wishlist intake prefill as Dashboard **Chat**.
- **Docs** — Extension **`README`** (prefill mechanism and fallbacks); **`docs/maintainers/runbooks/agent-task-engine-ergonomics.md`** § Extension dashboard → **Chat prefill**.

### Changed

- **Extension** package **`cursor-workflow-cannon`** **0.1.5** (shared **`run-transition-with-approval`** helper, **`playbook-chat-prompts`** module).

## [0.48.0] - 2026-04-03

Phase 48 — **wishlist intake agent workflow** (**`T604`–`T607`**).

### Added

- **Playbook** — **`docs/maintainers/playbooks/wishlist-intake-to-execution.md`** (id **`wishlist-intake-to-execution`**): rank **`wishlist_intake`**, operator **now vs delay**, scope clarification, target **`phaseKey`**, **`convert-wishlist`** with planning-generation hygiene; links **`TERMS.md`** / **`wishlist-workflow.md`** for id spaces.
- **Cursor** — requestable **`.cursor/rules/playbook-wishlist-intake-to-execution.mdc`**.

### Changed

- **Task-engine instructions** — **`list-wishlist.md`**, **`get-wishlist.md`** describe unified SQLite (or JSON task document) persistence; legacy **`.workspace-kit/wishlist/state.json`** called out as migration-only.
- **Discovery** — **`docs/maintainers/playbooks/README.md`**, **`AGENTS.md`**, **`runbooks/agent-playbooks.md`**, **`.ai/MACHINE-PLAYBOOKS.md`** register the new playbook id.

## [0.47.0] - 2026-04-02

Phase 47 — **agent guidance profile (RPG party v1)** (**`T585`–`T590`**).

### Added

- **Design** — **`docs/maintainers/adrs/ADR-agent-guidance-profile-rpg-party-v1.md`** (frozen tier catalog NPC → BBEG, storage keys, advisory boundary).
- **Config** — **`kit.agentGuidance.profileSetId`**, **`kit.agentGuidance.tier`** (1–5), **`kit.agentGuidance.displayLabel`**; validation in persisted project/user config.
- **CLI** — **`resolve-agent-guidance`**, **`set-agent-guidance`** (optional **`interactive:true`**).
- **Agent behavior** — **`resolve-behavior-profile`** includes **`data.agentGuidance`** with **`advisoryModulation`** (tier × explanation verbosity).
- **Task engine / extension** — **`dashboard-summary`** **`agentGuidance`** summary; dashboard webview shows tier + label.
- **Docs** — **`docs/maintainers/runbooks/agent-guidance-onboarding.md`**, **`FEATURE-MATRIX`**, **`AGENT-CLI-MAP`**; task-engine run contract requires **`agentGuidance`** on dashboard payload.

### Changed

- **Workspace-config module** — **`0.5.0`** (compatibility matrix).
- **Task-engine module** — **`0.13.0`** (compatibility matrix).
- **Agent-behavior module** — **`0.2.0`** (registration version).

## [0.46.0] - 2026-04-02

Phase 46 — **roadmap data generation**, **feature taxonomy docs**, **task `features` persistence** (**`T591`–`T598`**).

### Added

- **Documentation data** — JSON Schema for **`roadmap-data.json`** and **`feature-taxonomy.json`** (`src/modules/documentation/schemas/*.schema.json`); runtime validation (`data-schema-validate.ts`, **`ajv`** dependency).
- **Deterministic maintainer docs** — **`docs/maintainers/ROADMAP.md`** and **`FEATURE-TAXONOMY.md`** assembled from data + **`roadmap-phase-sections.md`** (`roadmap-render.ts`); **`generate-document`** / **`document-project`** paths; new view **`feature-taxonomy.view.yaml`**.
- **CI / check** — **`scripts/check-documentation-data.mjs`** (validate JSON + drift gate vs committed markdown); stage in **`pnpm run check`**.
- **Task engine** — optional **`features`** string array on **`TaskEntity`**; relational column **`features_json`**; kit SQLite **`user_version` 4**; **`create-task`** / **`update-task`** accept **`features`**; **`list-tasks`** filter **`features`** (OR semantics); advisory warnings for unknown taxonomy slugs; **`dashboard-summary`** / extension types include optional **`features`** on task rows.

### Changed

- **Documentation module** — **`0.4.0`** (compatibility matrix).
- **Task engine module** — **`0.12.0`** (compatibility matrix).

### Docs

- **`AGENT-CLI-MAP.md`**, **`list-tasks.md`**, **`create-task.md`**, **`update-task.md`**, **`module-build-guide.md`**, **`RELEASING.md`**, **`RULES.md`**, **`FEATURE-MATRIX.md`**.

## [0.45.0] - 2026-04-02

Phase 45 — **`planningGenerationPolicy`**, tests, extension UX, maintainer doc lap (**`T578`–`T584`**).

### Added

- **`tasks.planningGenerationPolicy`** — **`off`** (published default), **`warn`** (advisory **`planningGenerationPolicyWarnings`** on mutating success JSON), **`require`** (omit **`expectedPlanningGeneration`** → **`planning-generation-required`**). Registered in **`config-registry.json`** and **`validatePersistedConfigDocument`**.
- **Read payloads** — **`planningGenerationPolicy`** on **`list-tasks`**, **`get-task`**, **`get-next-actions`**, **`get-ready-queue`**, **`dashboard-summary`** (extension contract **`DashboardSummaryData`**).
- **Doctor** — prints effective planning generation policy after persistence summary lines.
- **Extension** — dashboard **Planning generation** card; caches token from **`list-tasks`** / **`dashboard-summary`**; Tasks DnD + palette **`run-transition`** pass **`expectedPlanningGeneration`** when policy is **`require`**.

### Changed

- **Task engine** — module **`0.11.0`**; mutating commands (task-engine, wishlist, planning persist paths, improvement **`generate-recommendations`**) enforce policy; idempotent **`clientMutationId`** replays skip **`require`** (no re-persist).
- **Maintainer repo** — **`.workspace-kit/config.json`** sets **`tasks.planningGenerationPolicy": "require"`** for strong consistency.

### Docs

- **`ADR-planning-generation-optimistic-concurrency.md`** — policy + **`T580`** appendix; **`AGENT-CLI-MAP.md`** planning section; **`task-persistence-operator.md`**; **`run-transition.md`**.

## [0.44.0] - 2026-04-02

Phase 44 — **planning-store optimistic concurrency**, **dependency-aware `get-next-actions`**, **Cursor extension Tasks tree DnD** (`T571`, `T557`–`T559`, `T573`–`T577`).

### Added

- **SQLite `planning_generation`** — kit migration **`user_version` 3**; monotonic counter on `workspace_planning_state`; optional JSON **`expectedPlanningGeneration`** on mutating task-engine / wishlist / planning paths; mismatch → **`planning-generation-mismatch`**.
- **Read surfaces** — **`planningGeneration`** on **`get-task`**, **`list-tasks`**, **`get-ready-queue`**, **`get-next-actions`**, **`dashboard-summary`**, and successful mutation payloads where applicable.
- **`get-next-actions`** — **`suggestedNext`** is never a ready task blocked by incomplete **`dependsOn`**; dependency-blocked ready tasks sort after runnable ready work (same priority + id tie-breaks within each segment).
- **Extension** — Tasks sidebar **drag-and-drop** for `T###` rows (phase folders → **`assign-task-phase`** / **`clear-task-phase`**; status groups → **`run-transition`** with policy prompt). Design: **`extensions/cursor-workflow-cannon/docs/tasks-tree-dnd.md`**.

### Docs

- **ADR** — **`docs/maintainers/adrs/ADR-planning-generation-optimistic-concurrency.md`**.
- **Task Engine** — **`get-next-actions.md`**, **`run-transition.md`** (optional **`expectedPlanningGeneration`**).

### Changed

- **Kit SQLite** — **`KIT_SQLITE_USER_VERSION`** **3**; **`migrateToTaskOnlyTableSchema`** preserves **`planning_generation`** when recreating `workspace_planning_state`.

## [0.43.0] - 2026-04-02

Phase 43 — **platform and maintainability refactors** (`T548`–`T555`).

### Added

- **`assign-task-phase`** / **`clear-task-phase`** — narrow phase mutations with instructions and tests; maintainer script **`scripts/apply-ready-task-phase-buckets.mjs`** now shells these instead of generic **`update-task`**.
- **Runbook** — **`docs/maintainers/runbooks/kit-sqlite-schema-migrations.md`** (single **`prepareKitSqliteDatabase`** / **`user_version`** story across kit SQLite surfaces).
- **Shared types** — **`src/contracts/dashboard-summary-run.ts`** exported as **`@workflow-cannon/workspace-kit/contracts/dashboard-summary-run`** for **`extensions/cursor-workflow-cannon`**.
- **CI guard** — **`scripts/check-maintainer-doc-canonicals.mjs`** (no stale “state.json as primary” table line; no **`pnpm run wk -- run`** in maintainer-facing docs).

### Changed

- **Task engine** — wishlist commands moved to **`task-engine-wishlist-on-command.ts`**; **`dashboard-summary`** to **`task-engine-dashboard-on-command.ts`**; policy sensitivity continues to track **`builtin-run-command-manifest.json`**.
- **CLI** — profile / drift / owned-path helpers extracted to **`src/cli/profile-support.ts`** and baseline content to **`src/cli/profile-baseline-content.ts`** (**`cli.ts`** slimmer).
- **Docs** — SQLite-default task persistence wording aligned across maintainer README templates, workbooks, **`.ai`**, Cursor rules (**`pnpm run wk run`** — no `--` between **`wk`** and **`run`**); **`AGENT-CLI-MAP.md`** copy-paste for phase commands.
- **Compatibility matrix** — **`task-engine`** module **`0.9.0`**.

### Docs

- **Task Engine run contracts** — **`schemas/task-engine-run-contracts.schema.json`** **`0.43.0`**.

### Fixed

- **`package.json` `exports`** — include **`./package.json`** so parity / fixture smoke can resolve the manifest (Node **exports** is otherwise exclusive).

## [0.42.0] - 2026-04-02

Phase 42 — **maintainer workspace phase snapshot CLI** (`T546`, `T547`).

### Added

- **`workspace-kit run update-workspace-phase-snapshot`** — atomic update of **`current_kit_phase`** and/or **`next_kit_phase`** in **`docs/maintainers/data/workspace-kit-status.yaml`**; supports **`dryRun`** and JSON **`null`** for **`nextKitPhase`** to remove that line; instruction **`update-workspace-phase-snapshot.md`**.
- **Tests** — YAML apply helpers (**`applyWorkspacePhaseSnapshotToYaml`**, escaping, **`nextKitPhase: null`**) in **`test/dashboard-status-yaml.test.mjs`**.

### Changed

- **`workspace-kit doctor`** — when **`kit-phase-config-status-yaml-mismatch`** is reported, remediation output mentions **`update-workspace-phase-snapshot`** and **`AGENTS.md`** (workspace phase snapshot).
- **Compatibility matrix** — **`task-engine`** module **`0.8.0`** (new run command).
- **Maintainer docs** — **`AGENTS.md`** (workspace phase snapshot subsection), **`phase-closeout-and-release.md`**, **`.ai/WORKSPACE-KIT-SESSION.md`** (correct **`pnpm run wk run`** pattern + snapshot note), **`AGENT-CLI-MAP.md`** copy-paste.

### Docs

- **Task Engine run contracts** — **`schemas/task-engine-run-contracts.schema.json`** **`0.42.0`**.

## [0.41.0] - 2026-04-02

Phase 41 — **relational SQLite task store** (optional in-place migration from document blob).

### Added

- **Table `task_engine_tasks`** — one row per **`TaskEntity`** with typed columns, JSON array/metadata overflow, and indexes on **`status`**, **`type+status`**, **`phase_key`**, **`queue_namespace+status`**.
- **Envelope columns** on **`workspace_planning_state`** — **`transition_log_json`**, **`mutation_log_json`**, **`relational_tasks`** (0 = blob mode, 1 = relational mode).
- **`migrate-task-persistence`** direction **`sqlite-blob-to-relational`** — explicit, transactional migration with verification; supports **`dryRun`**.
- **`TaskEntity`** optional fields **`summary`**, **`description`**, **`risk`** — set via **`create-task`** / **`update-task`**; persisted in relational rows.
- **ADR** — **`docs/maintainers/adrs/ADR-relational-sqlite-task-store.md`**.
- **Export** — **`TASK_ENGINE_TASKS_TABLE`** from **`@workflow-cannon/workspace-kit`** core entry.
- **Compatibility matrix** — **`task-engine`** module **`0.7.0`** (relational persistence surface).

### Changed

- **`PRAGMA user_version`** for kit SQLite is **2** when migrations have run (**`KIT_SQLITE_USER_VERSION`**).
- **`get-kit-persistence-map`**, **`task-persistence-operator.md`**, **`TERMS.md`**, **`migrate-task-persistence`** instruction — document relational layout and migration.
- **`check-planning-doc-consistency`** — reads **`task_engine_tasks`** when **`relational_tasks=1`**.

## [0.40.0] - 2026-04-02

Phase 40 — **SQLite-only runtime** for task planning, improvement state, and agent-behavior state; JSON persistence opt-out removed.

### Breaking

- **`tasks.persistenceBackend: "json"`** is **invalid** — config validation fails with a migration pointer. Runtime **`openPlanningStores`** no longer reads **`state.json`** for execution.
- **`migrate-task-persistence`**: **`sqlite-to-json`** removed — use **`backup-planning-sqlite`** for a portable database file.
- **`migrate-wishlist-intake`** operates on the planning SQLite DB only (run **`json-to-sqlite`** first if the workspace still has JSON stores).

### Added

- **`workspace-kit run get-kit-persistence-map`** — read-only JSON map of unified DB path, planning table/columns, legacy import paths, and module-state hints for agents.

### Changed

- **Improvement** / **agent-behavior** persistence: **writes** go to **`workspace_module_state`** in the configured kit SQLite file; legacy sidecar JSON files are optional **read** fallback when migrating.
- **`workspace-kit doctor`** persistence summary always describes **sqlite**; points to **`get-kit-persistence-map`** for structured layout.
- **Exports** — **`SqliteDualPlanningStore`**, **`openPlanningStores`**, **`OpenedPlanningStores`** from the package **`modules`** surface (for tests and advanced callers).

### Docs

- **ADR** — **`ADR-json-persistence-deprecation.md`** updated to **executed** (**v0.40.0**).
- **Runbooks / instructions** — **`migrate-task-persistence`**, **`task-persistence-operator.md`**, **`json-to-sqlite-one-shot-upgrade.md`** aligned with sqlite-only runtime.

## [0.39.0] - 2026-04-02

Phase 39 — SQLite persistence hardening (schema versioning, integrity, backup, operator docs).

### Added

- **Centralized kit SQLite migrations** — **`PRAGMA user_version`** with baseline DDL for **`workspace_planning_state`** + **`workspace_module_state`** on open (**`src/core/state/workspace-kit-sqlite.ts`**); shared **`busy_timeout`** (10s) + WAL.
- **`workspace-kit run backup-planning-sqlite`** — Online backup of the planning DB via **`better-sqlite3`** (**`backup-planning-sqlite-runtime.ts`**).
- **`workspace-kit doctor`** — **`PRAGMA quick_check`** for configured SQLite planning DB; persistence summary includes **Kit SQLite schema (`user_version`)** when the file exists.
- **`list-module-states`** — Response includes **`kitSqliteUserVersion`**.
- **ADR** — **`docs/maintainers/adrs/ADR-json-persistence-deprecation.md`** (JSON opt-out deprecation direction + future semver-major removal).
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
- **Docs** — README **New contributors** path (≤5 hops to a safe **`run-transition`**); AGENTS **documentation tiers**, **canonical vs mirror**, expanded task-template (prompt-only) warning; **`docs/maintainers/module-build-guide.md`** Cursor rules policy; **`docs/maintainers/DECISIONS.md`** governance/drift decision; **`docs/maintainers/RELEASING.md`** principles edit order + gate names; **`tasks/*.md`** kit-invocation reminder block; consumer cadence task-template note.

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

- **ADR** — **`docs/maintainers/adrs/ADR-native-sqlite-consumer-distribution.md`**, **`ADR-task-store-sqlite-document-model.md`**, **`ADR-task-store-schemaversion-policy.md`**.
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

- **Agent playbooks / direction sets** (`T433`–`T439`) — TERMS + `docs/maintainers/playbooks/` (README, pilot `phase-closeout-and-release`), `AGENTS.md` discovery table + optional requestable `.cursor/rules/playbook-phase-closeout.mdc`, `tasks/phase-closeout.md` maintainer template, `runbooks/agent-playbooks.md`; FEATURE-MATRIX + ROADMAP Phase 25 closeout.
- **CLI visual guide** — `docs/maintainers/CLI-VISUAL-GUIDE.md` (ASCII topology + Mermaid: top-level commands, agent decision flow, approval lanes, default module router). Linked from README, `AGENTS.md`, `AGENT-CLI-MAP.md`, `ARCHITECTURE.md`; machine ref in `.ai/AGENTS.md`.

## [0.25.0] - 2026-03-30

### Changed

- **Breaking:** `tasks.persistenceBackend` now defaults to **`sqlite`** (was `json`). New kit defaults include `tasks.sqliteDatabaseRelativePath`, `tasks.wishlistStoreRelativePath`, and `persistenceBackend` in `KIT_CONFIG_DEFAULTS`. Operators upgrading from JSON-only stores must run **`workspace-kit run migrate-task-persistence`** with `direction: "json-to-sqlite"` or set **`tasks.persistenceBackend: "json"`** to remain on files. **`workspace-kit doctor`** continues to fail when SQLite is selected and the database file is missing.
- **Agent-behavior:** When using SQLite, if the `agent-behavior` module row is absent, load falls back to `.workspace-kit/agent-behavior/state.json` once (parity with improvement operational state file fallback).

### Documentation

- ADR: `docs/maintainers/adrs/ADR-sqlite-default-persistence.md`. Updates to `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `ADR-task-sqlite-persistence.md`, task-engine `config.md` / `migrate-task-persistence` instruction.

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

- After upgrade, run `workspace-kit run migrate-wishlist-intake '{}'` once per workspace (use `dryRun: true` first). See ADR `docs/maintainers/adrs/ADR-unified-task-store-wishlist-and-improvement-state.md`.

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
- **ADR:** `docs/maintainers/adrs/ADR-task-sqlite-persistence.md`.

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
- **Runtime path audit** (Phase 11): `ModuleRegistry` / CLI workspace-root resolution hardening; regression coverage in `test/module-registry.test.mjs`.

### Changed

- **Sensitive `workspace-kit run` denial messaging** now distinguishes missing vs invalid `policyApproval` payloads while keeping `policy-denied`, `operationId`, and `remediationDoc` stable.
- **Task engine README** now includes explicit concurrency semantics for `.workspace-kit/tasks/state.json` and `.workspace-kit/policy/traces.jsonl`.
- **Release workflow docs** now include a pre-approval doc consistency sweep checklist with explicit `pnpm run check-planning-consistency`.

## [0.11.0] - 2026-03-26

Phase 9–10 — interactive policy UX, strict response-template opt-in, and **Agent/CLI parity** documentation plus discoverability.

### Added

- **`docs/maintainers/AGENT-CLI-MAP.md`** — tier table (task transitions vs other sensitive `workspace-kit run` commands), maintainer templates vs CLI boundaries, and copy-paste JSON for each policy `operationId`.
- **`WORKSPACE_KIT_INTERACTIVE_APPROVAL`** — optional TTY prompt for sensitive `workspace-kit run` (`src/cli/interactive-policy.ts`, `readStdinLine` test hook on `WorkspaceKitCliOptions`).
- **Strict response templates:** `enforcementMode: strict` fails on unknown default/override template ids and on `responseTemplateId` vs instruction directive mismatch (`response-template-conflict`).
- **`.cursor/rules/workspace-kit-cli-execution.mdc`** — always-on rule mirroring CLI-first execution; **`pnpm run advisory:task-state-hand-edit`** — non-blocking advisory when `state.json` diffs look like hand-edits (CI: `continue-on-error`).

### Changed

- **`workspace-kit run`** (no subcommand) and **`workspace-kit doctor`** success output point agents at instruction paths, `POLICY-APPROVAL.md`, and **`AGENT-CLI-MAP.md`**.
- **`docs/maintainers/POLICY-APPROVAL.md`** — Agents / IDE / non-TTY subsection (session id, chat is not approval).
- **`docs/maintainers/AGENTS.md`** and **`.ai/AGENTS.md`** — CLI-first rules and concrete examples; **`tasks/*.md`** — persistence vs planning-only labeling.
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
- **FEATURE-MATRIX** — Phase 7–8 rows and architectural-review remediation snapshot; removed incorrect “Phase 6 includes imp-2cf5” feature claim.

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
