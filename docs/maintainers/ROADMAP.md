# Workflow Cannon Roadmap

Long-range plan and decision log for the Workflow Cannon package and maintainer workflow.

<!-- GENERATED: do not hand-edit. Source: `src/modules/documentation/data/roadmap-data.json`, `roadmap-phase-sections.md`, `feature-taxonomy.json`. Regenerate: `pnpm run wk run generate-document '{"documentType":"ROADMAP.md"}'`. -->

## Scope

- This repository is the canonical home for Workflow Cannon package work.
- The legacy source repository is treated as an external consumer and parity fixture, not as the source of kit implementation.

## Current state

- **Shipped:** latest **`v0.61.0`** (Phase **61** — Claude Code plugin platform v1: **`list-plugins`** / **`inspect-plugin`**, **`install-plugin`** / enable-disable, SQLite **`user_version` 8 **`kit_plugin_state`**, ADR + schema + CI fixture). Phase **60** (**`v0.60.0`**, run-args pilot + dashboard/subagent surfaces) and prior trains remain summarized in **[`ROADMAP-archive.md`](./ROADMAP-archive.md)**; version facts in **[`CHANGELOG.md`](./CHANGELOG.md)**.
- **Next:** Use **`get-next-actions`** / **`list-tasks`** for **`ready`** work; **Phase 70 (CAE)** — tasks **`T837`–`T869`** (Context Activation Engine spec + implementation train); **`T668`–`T670`** (Cursor chat prefill) remain **`cancelled`**.
- **Maintainer snapshot** — `docs/maintainers/data/workspace-kit-status.yaml` (`current_kit_phase`, `next_agent_actions`).
- **Execution queue** — canonical task-engine store (default `.workspace-kit/tasks/workspace-kit.db`; JSON opt-out `.workspace-kit/tasks/state.json`); use `pnpm run wk run list-tasks` / `get-next-actions` rather than inferring phase from prose alone.
- **Product / feature inventory** — **`docs/maintainers/FEATURE-MATRIX.md`**.
- Historical extraction and first-publish milestones — **Execution evidence snapshot** below.

## Product feature taxonomy

Stable **slugs** for task ↔ feature mapping (see [`FEATURE-TAXONOMY.md`](./FEATURE-TAXONOMY.md) for usage).

| Category | Slug | Feature | Covers |
| --- | --- | --- | --- |
| Task engine & queue | `next-actions` | Next-actions & queue intelligence | get-next-actions, blocking analysis, ordering, queue namespaces |
| Task engine & queue | `task-dependencies` | Dependencies & unblock | dependsOn, blocked → ready cascades |
| Task engine & queue | `task-guards` | Guards & validation | State validity, dependency checks, policy hooks on transitions |
| Task engine & queue | `task-lifecycle` | Lifecycle transitions | Status machine, demotions, transition evidence |
| Task engine & queue | `task-mutations` | Task mutations & history | create/update, transition logs, introspection commands |
| Task engine & queue | `task-schema` | Task schema & envelopes | IDs, types, phase labels, priority, scope, acceptance criteria |
| Persistence & planning store | `planning-concurrency` | Planning generation & concurrency | planningGeneration, expectedPlanningGeneration, idempotency |
| Persistence & planning store | `store-migrations` | Migrations & recovery | user_version, migration commands, operator recovery |
| Persistence & planning store | `task-persistence` | Task persistence backends | SQLite blob vs relational rows, dual-planning stores |
| Config, policy & trust | `approvals` | Approvals & decision records | Decisions on recommendations and sensitive flows |
| Config, policy & trust | `config-cli` | Config CLI & layers | Project/user layers, validation, safe writes, mutation evidence |
| Config, policy & trust | `config-model` | Config model & resolution | Registry, precedence, explain/resolve, generated CONFIG docs |
| Config, policy & trust | `policy-registry` | Sensitive operations & policy registry | Gated ops, extension from effective config, CLI tiering |
| Config, policy & trust | `policy-traces` | Policy traces & versioning | Trace schema, upgrade notes, audit output |
| Improvement loop & signals | `evidence-dedupe` | Evidence & deduplication | evidenceKey, provenance, confidence/heuristics |
| Improvement loop & signals | `improvement-triage` | Improvement backlog & triage | proposed → ready, churn signals, maintainer rubrics |
| Improvement loop & signals | `recommendations` | Recommendation generation | generate-recommendations, cursors, cadence |
| Transcripts & automation | `automation-hooks` | Editor & CI automation hooks | Cursor/VS Code tasks, optional hooks |
| Transcripts & automation | `transcript-sync` | Transcript sync & privacy | Paths, redaction, storage boundaries |
| CLI, modules & agent surfaces | `agent-behavior` | Agent behavior profiles | Resolve/interview behavior (advisory; not permission) |
| CLI, modules & agent surfaces | `instructions` | Instructions & machine operability | instructions/*.md, JSON shapes, agent-first flows |
| CLI, modules & agent surfaces | `module-platform` | Command router & module platform | Enable/disable, dispatch, startup contracts |
| CLI, modules & agent surfaces | `response-templates` | Response templates | Registry, advisory enforcement, result shaping |
| CLI, modules & agent surfaces | `subagent-registry` | Subagent registry (kit persistence) | Definitions, sessions, messages in SQLite v6; subagents.* run commands; host executes delegated agents |
| Docs, playbooks & maintainer UX | `doc-generation` | Documentation generation | document-project, template validation, .ai pairing |
| Docs, playbooks & maintainer UX | `playbooks` | Playbooks, runbooks, TERMS | Direction sets, ops procedures, glossary alignment |
| Extension & human visibility | `cursor-extension` | Cursor extension & dashboard | Tasks UI, DnD, dashboard-summary, human-visible store fields |
| Release, quality & consumers | `ci-guards` | Check pipeline & CI gates | pnpm run check, instruction coverage, contract guards |
| Release, quality & consumers | `consumer-parity` | Consumer parity & compatibility | Compatibility matrix, packaged checks, native SQLite consumer |
| Release, quality & consumers | `doctor-diagnostics` | Doctor & diagnostics | wk doctor, persistence map, phase snapshot alignment |
| Release, quality & consumers | `release-versioning` | Release & versioning | Tags, changelog, phase closeout evidence |

## Phase plan and release cadence

Each phase ends with a GitHub release. Phases are sequential unless explicitly re-planned.

This section lists **planned and in-flight** phases only. **Completed** phase blocks (scope/outcome/exit) are archived in [`ROADMAP-archive.md`](./ROADMAP-archive.md) under **Archived phase plan sections**.

For a product-facing view of features by phase, see `docs/maintainers/FEATURE-MATRIX.md`.

### Phase 53 - Relational feature registry (DB taxonomy Path A) -> GitHub release `v0.53.0` (COMPLETE)

- **Primary scope:** **`T630`–`T639`** — ADR (**`T630`**) for **Path A** (SQLite registry is source of truth for taxonomy) and **Option 1** (authoritative **`task_engine_task_features`** junction; **`features_json`** not source of truth); schema + migration + seed from legacy taxonomy (**`T631`**); persistence layer (**`T632`**); **`create-task`** / **`update-task`** / reads validate and use junction (**`T633`**); backfill + doctor (**`T634`**); **`list-tasks`** **`featureId`** / **`componentId`** filters (**`T635`**); **`generate-document`** / doc pipeline from DB (**`T636`**); contracts + instructions + **`AGENT-CLI-MAP`** (**`T637`**); Cursor extension **`dashboard-summary`** enrichment (**`T638`**); phase closeout tests + **`CHANGELOG`** + matrix (**`T639`**). **`improvement`** / **`wishlist_intake`**: no required feature links; unknown feature ids fail closed for execution tasks when provided.
- **Outcome:** Components and features are relational with FKs; task↔feature links are normalized; maintainer-facing taxonomy docs derive from DB (Path A); optional task features remain nullable/empty.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 54 - Skill packs v1 -> GitHub release `v0.54.0` (COMPLETE)

- **Primary scope:** **`T640`–`T644`** — ADR + versioned manifest schema (**`T640`**) with **Claude Code interoperability**: normative mapping from per-skill directories and **`SKILL.md`** (YAML frontmatter + body, optional **`scripts/`** / **`references/`** / etc.) so a pack installed under **`.claude/skills/`** is valid on a configured Workflow Cannon skill root without parallel authoring unless the ADR introduces an optional sidecar; config + discovery incl. default **`.claude/skills/<id>/SKILL.md`** recognition (**`T641`**); **`apply-skill`** resolves instructions from **`SKILL.md`** for Claude-shaped packs (**`T642`**); attach skills to tasks and playbooks with ids aligned to discovered pack names (**`T643`**); **`recommend-skills`** v1 + **Claude-shaped** sample pack + maintainer docs for dual install (**`T644`**). Provenance: wishlist **`T564`** referenced from **`T640`** acceptance scope.
- **Outcome:** Packs are discoverable, inspectable, and applicable with explicit policy lanes; **skill trees that satisfy current Claude Code skill layout expectations generally work in Workflow Cannon** when placed on a configured root (unsupported Claude-only frontmatter or runtime knobs documented as non-goals or no-ops per ADR); optional task/playbook attachment and deterministic recommendations.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 57 - Native subagents v1 -> GitHub release `v0.57.0` (COMPLETE)

- **Primary scope:** **`T662`–`T664`** — ADR + SQLite **`user_version` 6** tables (**`kit_subagent_definitions`**, **`kit_subagent_sessions`**, **`kit_subagent_messages`**) (**`T662`**); **`subagents`** module + manifest + policy **`subagents.persist`** (**`T663`**); spawn/message/close commands + operator runbook + **`AGENT-CLI-MAP`** (**`T664`**). Execution host remains Cursor (or similar); kit persists provenance only.
- **Outcome:** Delegated agent definitions and session/message audit are queryable in kit SQLite; Tier B mutations are policy-gated like other sensitive **`run`** commands.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 58 - Team execution v1 -> GitHub release `v0.58.0` (COMPLETE)

- **Primary scope:** **`T665`–`T667`** — ADR + SQLite **`user_version` 7** table **`kit_team_assignments`** + handoff/reconcile contract v1 (**`T665`**); **`team-execution`** module commands + validation + **`AGENT-CLI-MAP`** / policy **`team-execution.persist`** (**`T666`**); supervisor runbook + explicit deferral of **`get-next-actions`** assignment surfacing with documented follow-up (**`T667`**).
- **Outcome:** Supervisors can register assignments against **`T###`** rows, workers submit structured handoffs, supervisors reconcile or block/cancel; persistence map and doctor surface **`user_version` 7**; team path complements subagent registry without launching remote workers from Node.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 59 - Improvement scout + ingest heuristics -> GitHub release `v0.59.0` (COMPLETE)

- **Primary scope:** **`T679`–`T683`** — **`improvement-scout`** playbook (lenses, zones, stems, adversarial pass, evidence floor); optional scout **`metadata`** keys on improvement tasks; improvement state schema **`3`** with bounded **`scoutRotationHistory`**; read-only **`scout-report`** command (optional **`persistRotation`**); config **`improvement.recommendations.heuristicVersion`** **`1`**/**`2`** for alternate ingest admission. **Cancelled track (non-release):** **`T668`–`T670`** (Cursor chat prefill experiments) remain **`cancelled`**.
- **Outcome:** Operators can run a structured scout rehearsal without Tier B approval; rotation memory is opt-in; pipeline tasks can carry scout metadata; **`heuristic_2`** is opt-in and tested beside **`heuristic_1`** defaults.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 60 - Run-args pilot + planning prelude + dashboard/subagent surfaces -> GitHub release `v0.60.0` (COMPLETE)

- **Primary scope:** **`T689`–`T740`** (and split tasks) — pilot **`schemas/pilot-run-args.snapshot.json`** for all manifest task-engine commands, **`schemas/planning-generation-cli-prelude.json`**, SQLite **`BEGIN IMMEDIATE`**, **`agent-session-snapshot`**, **`get-next-actions`** **`teamExecutionContext`**, **`dashboard-summary`** **`schemaVersion` 3** + **`subagentRegistry`**, package **`exports`** for contract subpaths, maintainer doc alignment (SQLite-only persistence).
- **Outcome:** Stronger CLI JSON validation and planning-generation ergonomics; extension **0.1.8** surfaces subagent registry card.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 61 - Claude Code plugin platform v1 -> GitHub release `v0.61.0` (COMPLETE)

- **Primary scope:** **`T684`–`T687`** — ADR + **`schemas/claude-plugin-manifest.schema.json`** + **`plugins.discoveryRoots`**; **`list-plugins`** / **`inspect-plugin`**; **`install-plugin`** / **`enable-plugin`** / **`disable-plugin`** + **`plugins.persist`**; SQLite **`user_version` 8 **`kit_plugin_state`**; **`workspace-kit doctor`** summary; reference fixture **`docs/examples/claude-plugins/`** + CI smoke.
- **Outcome:** Deterministic plugin manifest validation, filesystem discovery aligned to Anthropic layout, optional SQLite enablement and copy-install with policy gates.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 70 - Context Activation Engine (CAE) (IN FLIGHT)

- **Architecture ADR (boundaries, naming, rollout):** **`.ai/adrs/ADR-context-activation-engine-architecture-v1.md`** (**`T837`**).
- **Registry & artifact IDs (v1 schema + fixtures):** **`.ai/adrs/ADR-cae-artifact-registry-v1.md`**, **`schemas/cae/registry-entry.v1.json`** (**`T839`**).
- **Activation definition schema + trace mapping:** **`schemas/cae/activation-definition.schema.json`**, **`.ai/cae/activation-definition-trace-mapping.md`** (**`T840`**).
- **Activation lifecycle (states, transitions, pre-filter order):** **`.ai/cae/lifecycle.md`** (**`T841`**).
- **Evaluation context (bounded slices + schema):** **`.ai/cae/evaluation-context.md`**, **`schemas/cae/evaluation-context.v1.json`** (**`T842`**).
- **Precedence / merge / effective bundle:** **`.ai/cae/precedence-merge.md`**, **`schemas/cae/effective-activation-bundle.v1.json`** (**`T843`**).
- **Acknowledgement model (vs policyApproval):** **`.ai/cae/acknowledgement-model.md`** (**`T844`**).
- **Persistence & migration (CAE in planning SQLite):** **`.ai/adrs/ADR-cae-persistence-v1.md`** (**`T845`**).
- **Trace & explain (schemas + redaction):** **`.ai/cae/trace-and-explain.md`**, **`schemas/cae/trace.v1.json`**, **`schemas/cae/explain-response.v1.json`** (**`T846`**).
- **Read-only CLI contract (`cae-*` argv + `data` schemas, agent map checklist):** **`.ai/cae/cli-read-only.md`**, **`schemas/cae/cli-read-only-requests.v1.json`**, **`schemas/cae/cli-read-only-data.v1.json`** (**`T847`**).
- **Shadow mode (labels + `shadowObservation` on bundle):** **`.ai/cae/shadow-mode.md`**, **`schemas/cae/effective-activation-bundle.v1.json`** (**`T848`**).
- **Enforcement lane (allowlist, forbiddens, shadow gate ADR):** **`.ai/cae/enforcement-lane.md`**, **`.ai/adrs/ADR-cae-enforcement-shadow-gate-v1.md`** (**`T851`**).
- **Mutation governance (git/PR v1, audit shape, T868 gate):** **`.ai/cae/mutation-governance.md`** (**`T852`**).
- **Primary scope:** **`T837`–`T869`** — CAE architecture ADR and boundaries (code invariants vs advisory CAE); artifact registry + activation definition schemas + lifecycle; evaluation context contract; precedence / merge / effective bundle semantics; acknowledgement model (separate from `policyApproval`); persistence + trace + explain design; read-only CLI contract; shadow mode; CLI/router integration design; advisory surfacing; narrow enforcement lane design; mutation governance; failure/recovery; test plan; `.ai-first` operator docs; future cognitive-map contract; bootstrap registry seed; implementation (loader, context builder, evaluator, read-only commands, shadow pipeline, runtime hook, advisory payloads, enforcement, trace persistence, governed CRUD or validate-only, integration hardening).
- **Outcome:** Deterministic activation bundles for policy / think / do / review families; docs referenced by stable artifact ids; read-only inspectability and shadow rollout before allowlisted enforcement; no cognitive-map dependency in v1.
- **Exit signals:** Phase closeout per **`RELEASING.md`** when implementation train ships; routine gates **`pnpm run build`**, **`check`**, **`test`**, **`parity`** on release candidates.

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
- Phase 48 / `v0.48.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.48.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23950345949`
- Phase 49 / `v0.49.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.49.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23958564398`
- Phase 50 / `v0.50.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.50.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23962170532`
- Phase 51 / `v0.51.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.51.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23962937423`
- Phase 52 / `v0.52.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.52.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23972102809`
- Phase 55 / `v0.55.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.55.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23973610279`
- Phase 57 / `v0.57.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.57.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23986626078`
- Phase 58 / `v0.58.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.58.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23988556542`
- Phase 58 patch / `v0.58.2` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.58.2` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23996618134`
- Phase 60 / `v0.60.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.60.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23997372878`
- Phase 61 / `v0.61.0` GitHub release: `https://github.com/NJLaPrell/workflow-cannon/releases/tag/v0.61.0` — Publish NPM `https://github.com/NJLaPrell/workflow-cannon/actions/runs/24003848161`
- npm package: `https://www.npmjs.com/package/@workflow-cannon/workspace-kit`
