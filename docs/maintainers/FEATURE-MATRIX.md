# Workflow Cannon Feature Matrix

Product-oriented feature inventory derived from task-engine state (default: SQLite `.workspace-kit/tasks/workspace-kit.db`; JSON opt-out: `.workspace-kit/tasks/state.json`).

## How to read this file

- **Start here** for milestone alignment and status legend.
- **Deep rows** below are intentionally long-form; use editor search (phase number, command name, or `T###`) rather than loading the whole matrix into agent context.
- **Strategy / phase prose** is summarized in **`docs/maintainers/ROADMAP.md`** (generated from **`src/modules/documentation/data/roadmap-data.json`**) and archived narrative in **`docs/maintainers/ROADMAP-archive.md`**.

Status legend:

- `Completed` = capability delivered in repository baseline
- `In progress / ready` = next active release-track work
- `Planned` = scoped for future phases

## Milestone Alignment (from task-engine state)

| Milestone/phase | Release target | Current state |
| --- | --- | --- |
| Historical baseline (`T175`-`T177`) | Baseline established pre-Phase 0 | Completed |
| Phase 0 - Foundation (`T178`-`T183`, plus `T206`-`T213`) | `v0.2.0` | Completed |
| Phase 1 - Task Engine core (`T184`-`T186`, `T199`, `T217`) | `v0.3.0` | Completed |
| Phase 2 - Config, policy, local cutover (`T218`, `T187`, `T200`, `T188`, `T201`, `T189`) | `v0.4.0` | Completed |
| Phase 2b - Policy hardening + config UX (`T219`-`T220`, `T228`-`T237`) | `v0.4.1` | Completed |
| Phase 3 - Enhancement loop MVP (`T190`-`T192`, `T202`-`T203`) | `v0.5.0` | Completed |
| Phase 4 - Scale and ecosystem hardening (`T193`-`T195`, `T204`-`T205`, `T238`-`T242`) | `v0.6.0` | Completed |
| Phase 5 - Transcript intelligence automation (`T244`-`T248`, `T259`) | `v0.7.0` | Completed |
| Phase 6 - Automation hardening + response templates (`T249`-`T258`, `T260`-`T266`, `T271`-`T274`) | `v0.8.0` | Completed |
| Phase 7 - Architectural hardening (`T275`-`T282`) | `v0.9.0` | Completed |
| Phase 8 - Improvement backlog triage (`imp-2cf5d881b81f9a` … `imp-7f9e65fad74b0b`) | `v0.10.0` | Completed |
| Phase 9 - Interactive policy UX + template enforcement (`T283`, `T284`) | `v0.11.0` | Completed |
| Phase 10 - Agent/CLI parity (`T285`–`T291`) | `v0.11.0` | Completed |
| Phase 11 - Architectural review follow-up (`T292`–`T295`) | `v0.12.0` | Completed |
| Phase 12 - Cursor native UI thin client (`T296`–`T310`) | `v0.13.0` | Completed |
| Phase 25 - Agent playbooks and direction sets (`T433`–`T439`) | `v0.26.0` | Completed |
| Phase 26 - Module platform and improvement execution (`T388`–`T393`, `T390`, `T440`–`T442`, ready `imp-*`) | `v0.27.0` | Completed (remaining transcript `imp-*` triage continued in Phase 27) |
| Phase 27 - Transcript improvement execution (nine promoted **`ready`** `imp-*`) | `v0.28.0` | Completed (see Phase 27 section below; remaining **`proposed`** `imp-*` roll forward) |
| Phase 28 - Maintainer and agent operability (`T392`, `T443`–`T449`) | `v0.29.0` | Completed |
| Phase 30 - Persistence, packaging, and task-store evolution (`T450`–`T452`, `T466`, `T467`) | `v0.30.0` | Completed |
| Phase 31 - Policy, approvals, and sensitivity (`T454`, `T453`, `T468`) | `v0.31.0` | Completed |
| Phase 32 - Architecture boundaries and platform surfaces (`T456`, `T457`, `T458`) | `v0.32.0` | Completed |
| Phase 33 - Documentation, editor integration, and CLI ergonomics (`T455`, `T459`–`T461`, `T462`–`T463`, `T464`, `T469`) | `v0.33.0` | Completed |
| Phase 34 - Cursor extension and consumer experience (`T505`, `T506`, `T511`, `T518`) | `v0.34.0` | Completed |
| Phase 35 - Task engine, queue operations, and planning handoff (`T507`, `T510`, `T513`, `T520`, `T523`) | `v0.35.0` | Completed |
| Phase 46 - Roadmap data generation + task features (`T591`–`T598`) | `v0.46.0` | Completed |
| Phase 47 - Agent guidance profile — RPG party tier (`T585`–`T590`) | `v0.47.0` | Completed |
| Phase 54 - Skill packs v1 (`T640`–`T644`) | `v0.54.0` | Completed |
| Phase 55 - GitHub-native invocation (`T649`–`T653`) | `v0.55.0` | Completed |
| Phase 56 - Lifecycle hooks + `.ai` → `docs` pipeline (`T645`–`T648`, `T654`–`T661`) | `v0.56.0` | Completed |
| Phase 57 - Native subagents v1 (`T662`–`T664`) | `v0.57.0` | Completed |
| Phase 58 - Team execution v1 (`T665`–`T667`) | `v0.58.0` | Completed |

## Feature Matrix by Phase

### Historical Baseline (completed)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Repository extraction and provenance trail | Verifiable split history and evidence that establish trust in package origin | Completed | `T175`, `T176` |
| First publish baseline | Proven publish path with installable package and linked run evidence | Completed | `T177` |

### Phase 0 Foundation (`v0.2.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Phase-level scope and evidence framing | Clear release boundaries, risk framing, and evidence expectations | Completed | `T178` |
| Canonical documentation ownership split | Stable AI and human documentation surfaces with lower ambiguity | Completed | `T206` |
| Module platform baseline | Dependency-safe module contract and predictable module startup behavior | Completed | `T207` |
| Runtime module governance controls | Module enable/disable safety with config/state/instruction contracts | Completed | `T208` |
| Shared module build playbook | Consistent module implementation guidance across AI + maintainers | Completed | `T209` |
| Command routing UX for modules | Discoverable, dispatchable command surface for enabled modules | Completed | `T210` |
| Documentation generation workflow | Template-driven doc generation with validation, conflict checks, and evidence | Completed | `T211` |
| Maintainer document template library | Reusable templates for core maintainer docs and standardized sections | Completed | `T212` |
| Documentation runtime hardening | Stronger config validation and better failure-path coverage in generation flows | Completed | `T213` |
| Release metadata and pre-publish guardrails | Fewer invalid releases and clearer failure diagnostics before publish | Completed | `T179`, `T196` |
| Consumer update cadence management | Defined release cadence states and repeatable consumer validation steps | Completed | `T180`, `T197` |
| Packaged-artifact parity flow | Standardized parity checks against published-style artifacts | Completed | `T181`, `T197` |
| CI release-blocking parity gates | Automatic release stop when parity regresses | Completed | `T182` |
| Machine-readable parity evidence | Structured parity artifacts for automation, traceability, and audit | Completed | `T183`, `T198` |

### Phase 1 Task Engine Core (`v0.3.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Task Engine design workbook | Resolved schema, state model, persistence, and error taxonomy with binding design decisions | Completed | `T199` |
| Task lifecycle contract and guard system | Canonical task state model, transition rules, and pluggable guard hooks for enforcement | Completed | `T184` |
| Task transition runtime with persistence | Deterministic transitions, auto-unblock cascades, evidence emission, and file-backed JSON store | Completed | `T185` |
| Task adapter contract and task-state persistence | Pluggable adapter interface and canonical task-state persistence contract | Completed | `T186` |
| Next-action suggestion engine | Priority-sorted ready queue with blocking chain analysis for agent-driven task selection | Completed | `T217` |

### Phase 2 Config, Policy, and Local Cutover (`v0.4.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Phase 2 design workbook | Binding precedence, policy IDs, approval/actor rules, and cutover non-goals before implementation | Completed | `T218` |
| Deterministic config registry | Layered config with agent-first explain (`explain-config`) and predictable merge semantics | Completed | `T187`, `T200` |
| Policy and approval enforcement | Sensitive mutating operations gated; agent-mediated approval in context; machine-readable traces | Completed | `T188` |
| Maintainer task cutover | Checklist + runbook for **local** optional migration to task-engine state; no packaged migration runtime | Completed | `T189`, `T201` |

### Phase 2b Config Policy Hardening + UX (`v0.4.1`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Strict config validation | Fail-fast errors on bad `.workspace-kit/config.json` and merged effective config | Completed | `T219` |
| Full effective-config resolution | JSON dump of merged config for agents/automation (beyond field explain) | Completed | `T219` |
| Versioned policy traces | Trace records with explicit schema version and maintainer upgrade notes | Completed | `T220` |
| Config-extensible sensitive ops | Documented, tested extension of sensitive-operation IDs from effective config | Completed | `T220` |
| CLI config command group | Canonical `workspace-kit config` surface (list, get, set, unset, explain, validate, resolve, generate-docs, `edit`) with JSON + safe failures | Completed | `T228` |
| Persisted project/user config layers | Deterministic JSON stores, bootstrap, atomic/rollback-safe writes | Completed | `T229` |
| Config metadata contract | Single source for types, defaults, scope, sensitivity, approval hints | Completed | `T230` |
| Precedence diagnostics | Explain output for winning value, layers, and constraints | Completed | `T231` |
| Config mutation guardrails | Schema/policy/safe-write enforcement before persistence | Completed | `T232` |
| Generated config reference docs | `.ai/CONFIG.md` and `docs/maintainers/CONFIG.md` from metadata | Completed | `T233` |
| Config CLI integration tests | Fixture-backed end-to-end coverage for happy and failure paths | Completed | `T234` |
| Optional interactive config edit | Guided `config edit` reusing the same validation/persistence path | Completed | `T235` |
| Exposure and scope model | User vs maintainer vs internal keys; list/docs/edit defaults | Completed | `T236` |
| Config mutation evidence | Structured audit-friendly records for success and rejection | Completed | `T237` |

### Phase 3 Enhancement Loop MVP (`v0.5.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Improvement tasks as review queue | Proposed improvements logged as Task Engine tasks (`type="improvement"`); lifecycle + decisions wired to **`approvals`** | Completed | `T190` |
| Evidence-backed on-demand generation | `generate-recommendations` ingests transcripts, tag-to-tag diffs, policy traces, config mutations, task evidence; incremental cursor; heuristic confidence; `evidenceKey` dedupe | Completed | `T191`, `T202` |
| End-to-end lineage + trace correlation | Immutable lineage rec → dec → applied; correlates policy/config traces where available | Completed | `T192`, `T203` |

### Phase 4 Scale and Ecosystem (`v0.6.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Extension compatibility contract | Clear compatibility expectations and conformance checks for modules/plugins | Completed | `T193`, `T204`, `T238`, `T239` |
| Supportability and runtime objectives | Operational diagnostics and measurable runtime objectives | Completed | `T194`, `T205`, `T240` |
| Release channels and compatibility guarantees | Channel-based release posture (`canary`/`stable`/`lts`) with explicit guarantees | Completed | `T195`, `T241` |

### Phase 5 Transcript Intelligence Automation (`v0.7.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Manual-first transcript sync command | Deterministic local transcript archive sync without scheduler setup | Completed | `T244` |
| One-shot transcript ingest flow | Single command to sync transcripts and generate recommendations with clear policy handling | Completed | `T245` |
| Transcript config and trigger governance | Canonical config + workflow rules for event-driven frequent runs | Completed | `T246`, `T247`, `T248` |
| Transcript automation design baseline | Coherent rollout plan and implementation contracts for downstream slices | Completed | `T259` |

### Phase 6 Automation Hardening + Response Templates (`v0.8.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Frequent-run automation hardening | Bounded, repeatable high-cadence transcript sync/ingest with stronger safety rails, idempotency diagnostics, and failure retry posture | Completed | `T249`, `T251`, `T254`, `T255` |
| Transcript ops resilience and privacy | Source autodiscovery, operator status surfaces, privacy/redaction controls, and optional advisory pre-release ingest integration | Completed | `T250`, `T252`, `T257`, `T258` |
| Policy + docs operational follow-through | Session grants, transcript ops runbooks, and operator-facing policy traces | Completed | `T253`, `T256` |
| Response template advisory system | Response template contract, registry, runtime advisory integration, configuration, observability, and maintainer lifecycle guidance | Completed | `T260`, `T261`, `T262`, `T263`, `T264`, `T265`, `T266` |
| Cursor-native transcript automation | Package scripts, folder-open VS Code tasks, maintainer runbook, optional post-completion transcript hook | Completed | `T271`, `T272`, `T273`, `T274` |

### Phase 7 Architectural hardening (`v0.9.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Maintainer doc navigation + canon | Fewer broken indexes; package/changelog identity aligned to `@workflow-cannon/workspace-kit` | Completed | `T275`, `T276` |
| CLI decomposition | Command handlers and shared run bootstrap (`run-command` path) for safer iteration | Completed | `T277` |
| Config default singularity | One authoritative default map consumed by explain/docs | Completed | `T278` |
| Documentation runtime in consumers | Package-relative doc paths for installed package layouts | Completed | `T279` |
| Policy actor robustness | Bounded async actor resolution for traces | Completed | `T280` |
| Transcript hook observability | Hook event log + overlap control for background automation | Completed | `T281` |
| Governance / ADR hygiene | Canonical vs derivative surfaces documented | Completed | `T282` |

### Phase 8 Improvement backlog triage (`v0.10.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Actionable policy denials for `run` | `policy-denied` JSON includes `operationId`, `remediationDoc`, and clarifies env vs JSON approval | Completed | `imp-2cf5d881b81f9a` |
| Architectural doc alignment | FEATURE-MATRIX / review / roadmap consistency passes planning checks | Completed | `imp-3dc9374451b3c0` |
| CLI entrypoint clarity | README/AGENTS explain real CLI vs phantom QuickTask slash commands | Completed | `imp-b9d8408715de51` |
| Automation vs on-demand docs | Trigger matrix for recommendations, sync, ingest, hooks | Completed | `imp-201911c9c4461a` |
| Test failure ergonomics | Clearer assertion messages in selected contract tests | Completed | `imp-ab362ef4e1f99e` |
| Agent report guidance | Runbook for structured handoff summaries | Completed | `imp-c14c4955833730` |
| First-run validation runbook | Contributor order-of-operations for build/test/parity | Completed | `imp-fb31f5fc2694d3` |
| Agent phase truth | AGENTS + README point to task state and status YAML | Completed | `imp-43397766ef243b` |
| Task state schema story | Human doc + optional JSON Schema for editors | Completed | `imp-7f9e65fad74b0b` |

### Phase 9 Interactive policy UX + response-template enforcement (`v0.11.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Interactive `run` policy prompt | Optional `WORKSPACE_KIT_INTERACTIVE_APPROVAL` + TTY (or test `readStdinLine`): Deny / Allow once / Allow for session; session persists like JSON `policyApproval` | Completed | `T283` |
| Strict response-template enforcement | `enforcementMode: strict` fails on unknown resolved template id and explicit-vs-directive conflict (`response-template-invalid` / `response-template-conflict`) | Completed | `T284` |

### Phase 10 Agent/CLI parity (`v0.11.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Agent CLI map | Single maintainer page: tiers, maintainer templates vs CLI, copy-paste JSON per sensitive `operationId` | Completed | `T285` |
| CLI-first AGENTS guidance | `.ai/AGENTS.md` + `docs/maintainers/AGENTS.md` encode MUST-level CLI execution with examples | Completed | `T286` |
| Cursor CLI rule | Always-on `.cursor/rules/workspace-kit-cli-execution.mdc` mirrors maintainer contract | Completed | `T287` |
| Task template persistence labels | `tasks/*.md` mark planning-only vs real `workspace-kit` lines | Completed | `T288` |
| Command discovery UX | `workspace-kit doctor` + bare `run` output point to instructions + Agent CLI map | Completed | `T289` |
| Multi-turn agent sessions | `POLICY-APPROVAL.md` documents non-TTY, `WORKSPACE_KIT_SESSION_ID`, and “chat is not approval” | Completed | `T290` |
| Task state hand-edit advisory | `pnpm run advisory:task-state-hand-edit` (warn-only; CI non-blocking) | Completed | `T291` |

### Phase 11 Architectural review follow-up (`v0.12.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Sensitive run-path policy/session hardening | Explicit denial-path and session-reuse test coverage for sensitive `workspace-kit run` operations | Completed | `T292` |
| Persistence contention semantics | Documented concurrency model for task store and policy trace writes, with contention tests | Completed | `T293` |
| Release-time doc consistency sweep | Pre-release checklist step linking planning consistency checks and canonical doc surfaces | Completed | `T294` |
| Runtime path assumption audit | Recorded non-doc runtime audit with compatibility-safe findings and regression coverage | Completed | `T295` |

### Phase 12 Cursor native UI thin client (`v0.13.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Kit dashboard/task/config backend contracts for UI | Stable JSON command outputs and extension integration points for thin clients | Completed | `T296`, `T297` |
| Cursor extension shell and UI surfaces | Extension scaffold, activity-bar views, dashboard/tasks/config UI, palette commands | Completed | `T298`–`T306` |
| Security and verification for extension workflows | Security/trust pass plus unit/integration/manual-E2E coverage | Completed | `T307`–`T310` |

### Phase 25 Agent playbooks and direction sets (`v0.26.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Playbook canon and authoring contract | Shared vocabulary (direction set ↔ playbook), compose-by-reference rules, no fork of RELEASING/delivery-loop prose | Completed | `T433` |
| Pilot phase-closeout + release playbook | One attachable checklist orchestrating task queue, delivery loop, human release gate, and RELEASING evidence | Completed | `T434` |
| Agent discovery index | `AGENTS.md` table mapping playbook ids to paths and “use when” | Completed | `T435` |
| Phase-closeout maintainer template | `tasks/phase-closeout.md` entry that points agents at the pilot playbook and CLI map lines | Completed | `T436` |
| Invocation runbook | How to attach playbooks, optional rules, and limits of auto-triggering | Completed | `T437` |
| Requestable Cursor rule (optional) | Thin rule enabling phase-closeout mode without always-on bloat | Completed | `T438` |
| Milestone matrix alignment | FEATURE-MATRIX + roadmap wording stay consistent with shipped artifacts | Completed | `T439` |

### Phase 26 Module platform and improvement execution (`v0.27.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Command manifest truth | Commands declared in manifests match what ships; fewer “doc says X, CLI does Y” surprises | Completed | `T388` |
| Module README boundaries | Each module’s README states scope, boundaries, and integration points clearly | Completed | `T389` |
| Task-engine public surface | Deliberate minimal exports and stable integration seams for kit consumers | Completed | `T391` |
| `src/modules` barrel policy | Consistent barrel rules so imports and packaging stay predictable | Completed | `T393` |
| Layering + R102 canon | Maintainer docs and `src/README` explain core↔module facades vs **R102** | Completed | `T390` |
| Workbook alignment | Transcript baseline + task-engine workbook + cadence observability | Completed | `T440`–`T442` |
| Transcript improvement burn-down | Promoted **`ready`** `imp-*` closed; **`proposed`** backlog continues in Phase 27 | Partial (by design) | Transcript `imp-*` (see task-engine state) |

### Phase 27 Transcript improvement execution (`v0.28.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Agent task-engine ergonomics runbook | Single maintainer runbook tying Git, CLI discovery, planning vs execution queue, FEATURE-MATRIX vs architecture, task-engine public surface, behavior-vs-policy layering, and extension thin-client boundaries | Completed | `imp-5ba2f6a0c3bd4a`, `imp-6a07b608c1b752`, `imp-3bf93773a8c983`, `imp-a7dcdec79a791b`, `imp-190189d4b01bc1`, `imp-d3d2643f55fd43`, `imp-4cf9c424e5bfb2`, `imp-f39584e6613337`, `imp-d8ed5fa0b6c093` |

### Phase 28 Maintainer and agent operability (`v0.29.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Queue health audit | One `workspace-kit run queue-health` JSON answer for ready-queue phase alignment and unmet dependencies on `ready` tasks | Completed | `T443`, `T446`, `T447` |
| Canonical kit phase in config | `kit.currentPhaseNumber` / `kit.currentPhaseLabel` in effective config; doctor warns when config and status YAML disagree | Completed | `T444` |
| Structured phase on tasks | Optional `phaseKey` on tasks; `list-tasks` filter and hints use stable keys alongside human `phase` labels | Completed | `T445`, `T446` |
| Short CLI bin | `wk` alias for the same entrypoint as `workspace-kit` after install | Completed | `T448`, `T449` |
| Planning vs persistence clarity | TERMS + module READMEs disambiguate planning module (CLI) vs task-engine persistence | Completed | `T392` |

### Phase 30 Persistence, packaging, and task-store evolution (`v0.30.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Native SQLite consumer stance | ADR + runbook; `doctor` loads `better-sqlite3` only when SQLite persistence is configured and prints rebuild/runbook hints on failure | Completed | `T450` |
| Task store document model | ADR locks document-first SQLite JSON blobs vs normalized tables | Completed | `T451` |
| Dual persistence operator map | One runbook for backend, paths, recovery; `doctor` prints effective backend summary after pass | Completed | `T452` |
| Task / wishlist / improvement id onboarding | Single table for “which id do I create?”; TERMS + README + AGENT-CLI-MAP links | Completed | `T466` |
| Task store schema evolution | Documented policy; read `schemaVersion` 1/2 with normalize-on-load; tests | Completed | `T467` |

### Phase 31 Policy, approvals, and sensitivity (`v0.31.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Policy sensitivity registry | Every builtin `run` command declares `policySensitivity` in manifest; CI enforces alignment with `policy.ts` | Completed | `T454` |
| Wrong-lane denials | `policy-denied` explains env vs JSON approval when `WORKSPACE_KIT_POLICY_APPROVAL` is set but `run` lacks JSON `policyApproval` | Completed | `T453` |
| Canonical approval copy | Single POLICY-APPROVAL section for what counts as approval; shorter CLI/agents pointers | Completed | `T468` |

### Phase 32 Architecture boundaries and platform surfaces (`v0.32.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| R102 core→module allowlist | CI fails on new `src/core` imports from `src/modules` unless allowlisted and documented | Completed | `T456` |
| Response template precedence + errors | One contract/runbook chain; strict mode names directive field and which step chose an unknown id | Completed | `T457` |
| Planning vs persistence clarity | Planning README table, ARCHITECTURE Mermaid, TERMS for build-plan session file | Completed | `T458` |

### Phase 33 Documentation, editor integration, and CLI ergonomics (`v0.33.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Progressive governance onboarding | README path + AGENTS tiers; explicit canonical vs mirror vs generated table | Completed | `T455` |
| Task template vs policy clarity | Template reminder blocks; AGENTS + consumer cadence warnings | Completed | `T459` |
| Cursor rule sync policy | module-build-guide Cursor section; slim maintainer-delivery-loop rule | Completed | `T460` |
| Machine/human drift checks | CI fixtures for PRINCIPLES rule ids + AGENTS source-of-truth paths; RELEASING edit order | Completed | `T461` |
| Neutral gate script names | `maintainer-gates` / `pre-merge-gates` with `phase4-gates` / `phase5-gates` aliases | Completed | `T462` |
| Staged `pnpm run check` | Labeled steps, hints on failure, same substantive checks as before | Completed | `T463` |
| Bounded unknown-command errors | Capped samples + discovery hint for huge command menus | Completed | `T464` |
| Help text discovery | Top-level `--help` states `run` menu explicitly | Completed | `T469` |

### Phase 34 Cursor extension and consumer experience (`v0.34.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Consumer read-only onboarding | README documents `doctor` / `run` / `get-next-actions` for `npx` installs without maintainer docs | Completed | `T505` |
| Config explain facets | `explain-config` with `facet` returns bounded key sets; tests ⊆ `resolve-config` effective values | Completed | `T506` |
| Dashboard dependency surface | `dashboard-summary` carries subgraph + critical path + Mermaid source; extension renders text overview | Completed | `T511` |
| Planning resume card | Extension shows `build-plan` resume CLI + stale/empty copy; E2E checklist | Completed | `T518` |

### Phase 35 Task engine, queue operations, and planning handoff (`v0.35.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Merge ≠ done guardian | `queue-git-alignment` read-only JSON (git vs transitions, stale in_progress) | Completed | `T507` |
| Queue replay forensics | `replay-queue-snapshot` frozen-task replay; skew caveat in payload | Completed | `T510` |
| Team queue namespaces | `metadata.queueNamespace` + filtered `get-next-actions` / `get-ready-queue` | Completed | `T513` |
| Synthetic load harness | `scripts/task-engine-synthetic-load.mjs` (opt-in, not default CI test) | Completed | `T520` |
| Estimate pack handoff | Human-owned `metadata.implementationEstimatePack` template in planning runbook + convert example | Completed | `T523` |

## Supporting Milestone Features (cross-phase)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Release gate ownership map | Clear gate owners, artifacts, and escalation path for release readiness | Completed | `T196` |
| Consumer parity fixture pack | Reusable fixture + runner for parity checks in CI and local flows | Completed | `T197` |
| Parity evidence schema contract | Versioned schema and retention contract for parity artifacts | Completed | `T198` |
| Task schema workbook | Implementation-ready workbook with binding design decisions for all Phase 1 engine components | Completed | `T199` |
| Config-policy decision matrix | Shared decision map for precedence and policy interactions | Completed | `T200` |
| Task-engine local adoption guidance (historical) | Historical maintainer-local preflight/rollback guidance for initial task-engine adoption | Completed | `T201` |
| Recommendation confidence rubric | Deterministic scoring thresholds for recommendation queue admission | Completed | `T202` |
| Lineage event contract | Stable, immutable event format for provenance reconstruction | Completed | `T203` |
| Compatibility matrix template | Reusable compatibility reporting format for extensions and channels | Completed | `T204` |
| Diagnostics and SLO baseline pack | Standard diagnostics payload and objective baseline for runtime reviews | Completed | `T205` |
| Compatibility enforcement gates | Runtime + CI fail-closed compatibility checks with machine-readable conformance output | Completed | `T238` |
| Canonical compatibility matrix schema | Versioned source-of-truth schema mapping runtime/module/config/policy compatibility combinations | Completed | `T239` |
| Evidence lifecycle controls | Retention, compaction, and redaction policy for append-only `.workspace-kit` runtime artifacts | Completed | `T240` |
| Release channel operational mapping | Executable channel mapping across git tags, GitHub release labels, and npm dist-tags | Completed | `T241` |
| Planning-doc consistency guard | CI drift check that enforces status consistency across roadmap, tasks, and feature matrix docs | Completed | `T242` |

### Phase 47 Agent guidance profile (`v0.47.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Agent guidance tier (advisory) | Persisted `kit.agentGuidance` (profile set `rpg_party_v1`, tier 1–5); `resolve-agent-guidance`; `set-agent-guidance`; default tier 2 when unset; ADR with frozen copy deck | Completed | `T585`–`T587` |
| Onboarding / config path | Interactive or JSON `set-agent-guidance`; `config set` on `kit.agentGuidance.*` with env approval when required | Completed | `T588` |
| Behavior profile modulation | `resolve-behavior-profile` includes `agentGuidance.advisoryModulation` (tier × verbosity) | Completed | `T589` |
| Extension + docs | Dashboard shows effective tier; maintainer runbook; AGENT-CLI-MAP lines | Completed | `T590` |

### Phase 54 Skill packs v1 (`v0.54.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Claude-shaped discovery | Default **`.claude/skills/<id>/SKILL.md`** + optional **`workspace-kit-skill.json`**; **`skills.discoveryRoots`** | Completed | `T640`, `T641` |
| Inspect / apply / recommend | **`list-skills`**, **`inspect-skill`**, **`apply-skill`** (preview default; audit optional), **`recommend-skills`** | Completed | `T642`, `T644` |
| Task attachments | **`metadata.skillIds`** validated against discovered pack ids | Completed | `T643` |
| Sample + docs | **`.claude/skills/sample-wc-skill/`**, ADR **`ADR-skill-packs-v1.md`**, runbook **`runbooks/skill-packs-dual-install.md`** | Completed | `T644` |

### Phase 55 GitHub-native invocation (`v0.55.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| ADR + threat model | **`ADR-github-native-invocation.md`**: App vs Actions, HMAC, slash taxonomy, policy non-bypass | Completed | `T649` |
| Config surface | **`kit.githubInvocation.*`**: allowlist, **`eventPlaybookMap`**, debounce placeholder, command allowlists | Completed | `T650` |
| Core helpers + runner | **`github-invocation.ts`** (verify, route, audit shape); **`run-github-delivery.mjs`** plan + policy-gated mutating path | Completed | `T651`, `T652` |
| Maintainer enablement | Runbook **`github-workflow-cannon-invocation.md`**, sample workflow under **`docs/examples/github/`** | Completed | `T653` |

### Phase 56 Lifecycle hooks + maintainer doc pipeline (`v0.56.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Hook ADR + config | **`ADR-agent-task-lifecycle-hooks-v1.md`**, **`kit.lifecycleHooks.*`**, JSONL traces | Completed | `T645`, `T646` |
| Dispatch + enforce | Node/shell handlers; **observe** vs **enforce**; transition + **`run`** + persist events | Completed | `T647` |
| PR stubs + catalog | Reserved PR mutation events; runbook **`lifecycle-hooks.md`**; performance/ordering guidance | Completed | `T648` |
| `.ai` → `docs` gate | Coverage map + exceptions; **`generate-maintainer-docs-from-ai`**; drift + orphan **`pnpm run check`** stages | Completed | `T654`–`T661` |

### Phase 57 Native subagents v1 (`v0.57.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| SQLite registry + migration | **`PRAGMA user_version` 6** with **`kit_subagent_definitions`**, **`kit_subagent_sessions`**, **`kit_subagent_messages`**; fresh + upgrade paths | Completed | `T662` |
| **subagents** CLI surface | Read: **`list-subagents`**, **`get-subagent`**, **`list-subagent-sessions`**, **`get-subagent-session`**. Write: **`register-subagent`**, **`retire-subagent`**, **`spawn-subagent`**, **`message-subagent`**, **`close-subagent-session`** (**`subagents.persist`**, Tier B) | Completed | `T663` |
| Operator canon | ADR **`ADR-subagent-registry-v1.md`**, runbook **`runbooks/subagent-registry.md`**, **`get-kit-persistence-map`** subagent section, **`AGENT-CLI-MAP`** | Completed | `T664` |
| Execution model | Cursor (or another host) runs delegated agents; kit stores definitions + session/message provenance only | Completed | `T662`–`T664` |

### Phase 58 Team execution v1 (`v0.58.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| SQLite assignments + migration | **`PRAGMA user_version` 7** with **`kit_team_assignments`**; handoff + reconcile JSON contracts v1 | Completed | `T665` |
| **team-execution** CLI surface | Read: **`list-assignments`**. Write: **`register-assignment`**, **`submit-assignment-handoff`**, **`block-assignment`**, **`reconcile-assignment`**, **`cancel-assignment`** (**`team-execution.persist`**, Tier B) | Completed | `T666` |
| Operator canon | ADR **`ADR-team-execution-v1.md`**, runbook **`runbooks/team-execution-supervisor.md`**, **`get-kit-persistence-map`** **`teamExecution`** section, **`AGENT-CLI-MAP`**; **`get-next-actions`** assignment surfacing deferred with explicit runbook note | Completed | `T667` |
| Execution model | Supervisors/workers run in the host; kit records assignment lifecycle + evidence only | Completed | `T665`–`T667` |

## Notes

- Feature groupings are intentionally product-facing and map back to task milestones.
- Task IDs remain included for traceability back to canonical execution planning in task-engine state.

