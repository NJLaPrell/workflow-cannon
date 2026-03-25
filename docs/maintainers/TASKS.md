# Workflow Cannon Tasks

Status markers:
- `[p]` ready-proposed
- `[ ]` not done
- `[~]` in progress
- `[!]` blocked
- `[x]` complete

Dependency fields:
- `Depends on`: comma-separated task IDs that must be complete first (`none` when no dependency)
- `Unblocks`: comma-separated task IDs that become actionable after completion

## Current execution state

- Current phase in execution: _Phase 2 COMPLETE. Phase 3 (Enhancement loop MVP) is next._
- Milestone target: _Human-governed recommendation queue with evidence and lineage (`v0.5.0`)._
- Completed execution order (Phase 1): `T199` → `T184` → `T185` → `T186` → `T217`
- Completed execution order (Phase 2): `T218` → `T187` → `T200` → `T188` → `T201` → `T189`
- Ready queue: `T190`
- Design decisions resolved: Phase 1 — Phase 1 decisions table. Phase 2 — Phase 2 decisions table (below).

## Historical baseline (pre-Phase 0)

### [x] T175 [workspace-kit] Execute extraction kickoff and split evidence capture
- Priority: P1
- Approach: Dry-run + checklist + captured command outputs.
- Depends on: none
- Unblocks: `T176`
- Technical scope:
  - Capture source-repo freeze SHA and split SHA as immutable provenance.
  - Document exact split command path and branch naming used for extraction.
  - Preserve execution artifacts sufficient for post-hoc verification.
- Acceptance criteria:
  - Freeze and split SHAs are recorded in project docs.
  - Split command path is reproducible by another maintainer.

### [x] T176 [workspace-kit] Bootstrap Workflow Cannon repository from split history
- Priority: P1
- Approach: Bootstrap CI + publish automation baseline.
- Depends on: `T175`
- Unblocks: `T177`
- Technical scope:
  - Establish repository from split history with canonical branch.
  - Configure CI and publish workflow scaffolding.
  - Validate automation entrypoints and baseline execution.
- Acceptance criteria:
  - Repository is live with automation workflows configured.
  - Baseline workflow runs complete successfully.

### [x] T177 [workspace-kit] Close extraction with first package publish
- Priority: P1
- Approach: Publish with workflow evidence and npm verification.
- Depends on: `T176`
- Unblocks: `T178`
- Technical scope:
  - Execute release/publish workflow with explicit gate checks.
  - Verify package appears in npm registry with expected metadata.
  - Record publish run URL and package reference.
- Acceptance criteria:
  - Published package is installable from npm.
  - Publish evidence is linked in repository docs.

## Phase 0 foundation

Release target: **GitHub release `v0.2.0`**

### [x] T178 [workspace-kit] Finalize Phase 0 scope, risks, and evidence standards
- Priority: P1
- Approach: Align `docs/maintainers/ROADMAP.md`, `docs/maintainers/TASKS.md`, and `docs/maintainers/RELEASING.md` with explicit scope and evidence matrix.
- Depends on: none
- Unblocks: `T179`, `T180`, `T181`, `T184`, `T196`
- Supporting tasks: `T196`
- Technical scope:
  - Define canonical Phase 0 in-scope/out-of-scope boundaries.
  - Define required evidence artifacts per Phase 0 milestone.
  - Synchronize wording and IDs across roadmap, tasks, and release docs.
- Acceptance criteria:
  - Scope and evidence matrix are documented and conflict-free.
  - All Phase 0 docs reference the same task boundaries.

### [x] T206 [workspace-kit] Reorganize canonical documentation surfaces for AI and maintainers
- Priority: P1
- Approach: Move canonical AI docs to `/.ai`, move human maintainership docs to `docs/maintainers`, and rewire references/rules/templates.
- Depends on: `T178`
- Unblocks: `T179`, `T180`, `T181`, `T182`, `T183`
- Technical scope:
  - Move root canonical docs into explicit AI and human ownership paths.
  - Update Cursor rules, commands, workflow docs, and issue templates to new canonical paths.
  - Validate root markdown hygiene (`README.md` as the only root markdown doc).
- Acceptance criteria:
  - All source-of-truth references resolve to `/.ai` or `docs/maintainers`.
  - Documentation control surfaces are conflict-free and consistent.

### [x] T207 [workspace-kit] Bootstrap module contract, registry, and baseline module graph
- Priority: P1
- Approach: Establish typed module contract + registry validation + test coverage for dependency integrity and startup ordering.
- Depends on: `T178`
- Unblocks: `T184`, `T193`
- Technical scope:
  - Implement `WorkflowModule` contract and shared exports.
  - Implement registry checks for duplicate/missing/self/cycle dependency failures.
  - Add deterministic startup order and unit tests for graph validation.
- Acceptance criteria:
  - Module registry validates module graph integrity with explicit error codes.
  - Contract + registry behavior is test-covered and green.

### [x] T208 [workspace-kit] Add module config/state/instruction contracts with runtime enforcement
- Priority: P1
- Approach: Extend registration to include module config/state/instruction contracts, enable module toggles, and enforce instruction validity at runtime.
- Depends on: `T207`
- Unblocks: `T184`, `T186`, `T193`
- Technical scope:
  - Add `enabledByDefault`, `config`, `state`, and `instructions` to module registration.
  - Add runtime enable/disable selection with dependency-integrity validation for enabled sets.
  - Validate instruction naming, file mapping, and backing file existence in registry startup.
- Acceptance criteria:
  - Invalid instruction contracts fail startup deterministically.
  - Enable/disable behavior is validated by tests and documented in module build guidance.

### [x] T209 [workspace-kit] Define canonical module build guidance for AI and maintainers
- Priority: P1
- Approach: Publish a canonical AI spec plus human companion guide and keep both aligned with the module contract/registry implementation.
- Depends on: `T206`, `T208`
- Unblocks: `T184`, `T186`, `T193`
- Technical scope:
  - Create and maintain `.ai/module-build.md` as canonical module development policy.
  - Create and maintain `docs/maintainers/module-build-guide.md` as the human-readable companion.
  - Update guidance to cover config/state contracts, instruction contracts, and enable/disable dependency integrity.
- Acceptance criteria:
  - AI and human module-build docs are present, aligned, and referenced by source-of-truth docs.
  - Guidance reflects implemented module runtime checks and test expectations.

### [x] T210 [workspace-kit] Implement module command router for discovery and dispatch
- Priority: P1
- Approach: Add a core command router that indexes enabled-module instruction entries, supports alias resolution, and dispatches commands through module `onCommand`.
- Depends on: `T207`, `T208`
- Unblocks: `T184`, `T186`, `T193`
- Technical scope:
  - Implement `src/core/module-command-router.ts` with typed descriptors, alias support, and deterministic error handling.
  - Enforce duplicate command detection and enabled-module-only dispatch semantics.
  - Add command-router tests for listing, alias resolution, unknown command handling, and duplicate routes.
- Acceptance criteria:
  - Agents can list and resolve callable module commands from enabled modules.
  - Router behavior is test-covered and fails safely on invalid routing states.

### [x] T211 [workspace-kit] Wire documentation module generate-document runtime through command dispatch
- Priority: P1
- Approach: Implement `document-project`/`generate-document` runtime flow with config-driven paths, template/schema validation, conflict checks, and evidence output.
- Depends on: `T209`, `T210`
- Unblocks: `T179`, `T180`, `T181`
- Technical scope:
  - Implement documentation runtime command execution with strict write-boundary enforcement to configured roots.
  - Support template-missing prompt/continue behavior, section coverage validation, and validate/retry flow.
  - Emit typed generation evidence and surface it through module command results.
- Acceptance criteria:
  - Documentation module command runs through router and returns structured evidence.
  - Validation/conflict behavior matches module rules for currently implemented command paths and passing router/runtime integration tests.

### [x] T212 [workspace-kit] Build documentation module template library for core maintainer docs
- Priority: P1
- Approach: Add template-driven generation instructions for core maintainer documents and align section-generation behavior to current document structures.
- Depends on: `T209`, `T211`
- Unblocks: `T179`, `T180`, `T181`
- Technical scope:
  - Add templates for `ARCHITECTURE.md`, `PRINCIPLES.md`, `RELEASING.md`, `ROADMAP.md`, `SECURITY.md`, `SUPPORT.md`, and `TERMS.md`.
  - Use `{{{ ... }}}` instruction blocks for section-level generation directives.
  - Align template structure with current maintainer document boundaries while improving clarity where needed.
- Acceptance criteria:
  - Core maintainer docs have corresponding documentation-module templates.
  - Template sections map to current doc structures and can drive deterministic generation.

### [x] T213 [workspace-kit] Harden documentation runtime config and validation matrix
- Priority: P1
- Approach: Strengthen runtime configuration ingestion and add explicit edge-case validation coverage for generate-document flows.
- Depends on: `T211`
- Unblocks: `T179`, `T180`, `T181`
- Technical scope:
  - Formalize runtime config parsing/validation for documentation module roots and generation options.
  - Add runtime tests for missing-template behavior, strict write-boundary enforcement, section coverage failures, and validate/retry outcomes.
  - Ensure evidence output includes attempt counts, validation failures, and resolution outcomes for failing paths.
- Acceptance criteria:
  - Documentation runtime behavior is test-covered for both happy and failure paths.
  - Config and validation behavior is deterministic and documented.

### [x] T179 [workspace-kit] Harden package release metadata and automation guardrails
- Priority: P1
- Approach: Harden metadata, enforce guardrails, and codify release gate checks.
- Depends on: `T178`
- Unblocks: `T182`, `T195`, `T196`
- Supporting tasks: `T196`
- Technical scope:
  - Validate package metadata fields required for publish correctness.
  - Enforce pre-publish checks in CI/workflow pipeline.
  - Add fail-closed behavior for missing/invalid release prerequisites.
- Acceptance criteria:
  - Metadata checks block invalid releases.
  - Guardrail failures are actionable and documented.

### [x] T180 [workspace-kit] Define and validate consumer update cadence
- Priority: P1
- Approach: Cadence + reproducible fixture-backed validation path.
- Depends on: `T178`
- Unblocks: `T181`, `T197`
- Supporting tasks: `T197`
- Technical scope:
  - Define update cadence states (candidate, stable, follow-up patch).
  - Define required consumer validation run for each cadence transition.
  - Specify fixture and command contract for repeatable cadence checks.
- Acceptance criteria:
  - Cadence transitions are documented with required commands.
  - Fixture-backed flow is reproducible by maintainers.

### [x] T181 [workspace-kit] Standardize packaged-artifact parity validation flow
- Priority: P1
- Approach: Pin command order + fixture execution + consistent output contract.
- Depends on: `T178`, `T180`
- Unblocks: `T182`, `T183`, `T197`
- Supporting tasks: `T197`, `T198`
- Technical scope:
  - Define canonical ordered command chain for parity execution.
  - Define expected outputs and non-zero exit behavior.
  - Define fixture bootstrap and artifact capture requirements.
- Acceptance criteria:
  - Parity command chain is deterministic and documented.
  - Output contract supports machine parsing.

### [x] T182 [workspace-kit] Make parity regressions release-blocking in CI
- Priority: P1
- Approach: Block release-readiness path with clear failure diagnostics.
- Depends on: `T179`, `T181`
- Unblocks: `T184`
- Supporting tasks: `T197`
- Technical scope:
  - Integrate parity suite into release-readiness workflow dependency graph.
  - Mark parity regression states as hard failure for release path.
  - Emit concise diagnostics with failing step and artifact links.
- Acceptance criteria:
  - Release workflow cannot pass with parity regressions.
  - Failure output identifies precise parity failure node.

### [x] T183 [workspace-kit] Emit machine-readable parity evidence
- Priority: P1
- Approach: Schema-backed evidence artifact with stable keys and references.
- Depends on: `T181`
- Unblocks: `T191`, `T198`
- Supporting tasks: `T198`
- Technical scope:
  - Define evidence schema with run metadata, command outcomes, and references.
  - Emit artifacts to deterministic location in CI and local runs.
  - Validate schema conformance before artifact publish.
- Acceptance criteria:
  - Evidence artifacts are schema-valid and consistently generated.
  - Artifacts can be linked from release evidence docs.

## Phase 1 task engine core

Release target: **GitHub release `v0.3.0`**

Execution order: `T199` → `T184` → `T185` → `T186` → `T217`

### Design decisions (resolved)

The following decisions were resolved before T199 execution and are binding for Phase 1:

| Decision | Choice | Rationale |
| --- | --- | --- |
| Scope | Dogfood on own tasks + design API for external consumers | Proves the engine on real work while keeping the contract general |
| TASKS.md role | **Replaced** by the engine; becomes a generated read-only view | Engine owns state; generated markdown preserves the human surface |
| Persistence | File-backed JSON in `.workspace-kit/tasks/` (configurable via module config) | Durable between runs, easy to inspect, consistent with existing kit state |
| Agent integration | Full: CLI dispatch + instruction files + engine reads context and suggests next actions | Agents need discoverability, not just raw dispatch |
| Dependency behavior | Auto-unblock: dependents move `blocked → ready` when all deps complete | Reduces manual bookkeeping, matches how we actually work |
| Guard complexity | Full guards: state validation + dependency checks + custom guard hooks | Hooks let modules register pre-transition validators from day one |
| Task types | Type field present, all types share the same lifecycle in Phase 1 | Avoids premature complexity; adapter-per-type comes in Phase 4 |
| State file format | JSON | Consistent with parity evidence, schema validation, and tooling |
| Human surface | Generated `docs/maintainers/TASKS.md` as read-only view (same pattern as doc module) | Keeps the existing doc surface alive without it being source of truth |
| Next-action intelligence | Ready queue sorted by priority with blocking chain analysis | Context-aware recommendations deferred to Phase 3 Enhancement Engine |
| Evidence | Every transition produces a timestamped evidence record | Consistent with the evidence-first pattern established in Phase 0 |
| Migration | One-time parser imports current TASKS.md into new state format | TASKS.md then becomes a generated view |

### [x] T199 [workspace-kit] Design Task Engine schema workbook
- Priority: P1
- Approach: Produce a design workbook that documents the resolved decisions above and specifies implementation-ready details for schema, transitions, guards, persistence, and errors.
- Depends on: none
- Unblocks: `T184`
- Technical scope:
  - **State model**: Document the core lifecycle states: `proposed`, `ready`, `in_progress`, `blocked`, `completed`, `cancelled`. States are fixed in Phase 1; extensibility deferred.
  - **Transition graph**: Document every allowed transition with guard conditions. Include reversibility markers. Mandatory transitions: `proposed → ready` (accept), `proposed → cancelled` (reject), `ready → in_progress` (start), `ready → blocked` (block), `ready → cancelled` (cancel), `in_progress → completed` (complete), `in_progress → blocked` (block), `in_progress → ready` (pause), `blocked → ready` (unblock, all deps met), `blocked → cancelled` (cancel).
  - **Entity schema**: Document task entity fields — required: `id` (string, format `T{number}`), `status` (enum), `type` (string, uniform lifecycle in P1), `title` (string), `createdAt` (ISO timestamp), `updatedAt` (ISO timestamp). Optional: `priority` (P1/P2/P3), `dependsOn` (string[]), `unblocks` (string[]), `metadata` (Record), `ownership` (string), `approach`, `technicalScope`, `acceptanceCriteria`.
  - **Guard hook contract**: Document the `TransitionGuard` interface — `canTransition(task, targetState, context): GuardResult`. Guards run in registration order; first rejection stops the transition. Built-in guards: `dependency-check` (blocks start if deps incomplete), `state-validity` (rejects impossible transitions).
  - **Persistence contract**: Document the file-backed JSON store at `.workspace-kit/tasks/state.json`. Schema-versioned. Loaded on engine init, saved after each transition batch. Configurable path via `src/modules/task-engine/config.md`.
  - **Evidence schema**: Document transition evidence fields: `transitionId`, `taskId`, `fromState`, `toState`, `guardResults[]`, `dependentsUnblocked[]`, `timestamp`, `actor`.
  - **Error taxonomy**: Document typed error codes: `invalid-transition` (disallowed from→to), `guard-rejected` (guard returned rejection), `dependency-unsatisfied` (deps not complete), `task-not-found`, `duplicate-task-id`, `invalid-task-schema`, `storage-read-error`, `storage-write-error`.
  - **CLI commands**: Document the commands the engine will expose via the module command router: `run-transition`, `get-task`, `list-tasks`, `get-ready-queue`, `import-tasks`.
  - **Generated TASKS.md**: Document how the engine produces a read-only `docs/maintainers/TASKS.md` from state, matching the current section structure.
- Acceptance criteria:
  - All design decisions from the table above are documented with implementation-ready detail.
  - Transition graph covers every state pair (allowed and disallowed).
  - Entity schema, guard contract, evidence schema, and error taxonomy are specified to a level sufficient for T184 implementation.
  - Migration strategy for importing existing TASKS.md is documented.

### [x] T184 [workspace-kit] Define Task Engine core schema and lifecycle
- Priority: P1
- Approach: Implement typed schema, lifecycle states, transition validation, and guard hooks based on the T199 workbook.
- Depends on: `T199`
- Unblocks: `T185`, `T187`, `T188`
- Technical scope:
  - Implement `TaskEntity` type with all required and optional fields from the workbook.
  - Implement `TaskStatus` enum: `proposed`, `ready`, `in_progress`, `blocked`, `completed`, `cancelled`.
  - Implement `TaskType` field (string, uniform lifecycle in Phase 1).
  - Implement the allowed-transition map as a typed constant.
  - Implement `TransitionGuard` interface and `GuardResult` type.
  - Implement `TransitionValidator` that checks state validity, runs registered guards in order, and returns typed errors on rejection.
  - Implement built-in guards: `dependency-check` and `state-validity`.
  - Register task-engine module with `WorkflowModule` contract (update existing stub with real capabilities, config, state, instruction entries).
  - Add unit tests: every valid transition, every invalid transition, guard registration and execution order, built-in guard behavior, error codes.
- Acceptance criteria:
  - `TaskEntity`, `TaskStatus`, `TransitionGuard`, and related types are exported.
  - Transition validator rejects all disallowed state changes with specific error codes from the taxonomy.
  - Guard hooks run in registration order; first rejection stops the chain.
  - Built-in `dependency-check` guard prevents starting tasks with incomplete deps.
  - Module registration passes registry validation with updated instruction entries.

### [x] T185 [workspace-kit] Implement Task Engine transition runtime and persistence
- Priority: P1
- Approach: Transition service with auto-unblock, evidence emission, and file-backed JSON persistence.
- Depends on: `T184`
- Unblocks: `T186`, `T190`, `T194`
- Technical scope:
  - Implement `TaskStore` — file-backed JSON store at `.workspace-kit/tasks/state.json`. Schema-versioned. Load on init, save after each transition batch.
  - Implement `TransitionService` — accepts a task ID + target state, loads task from store, validates via `TransitionValidator`, applies state mutation, runs post-transition hooks, saves.
  - Implement **auto-unblock**: when a task transitions to `completed`, scan dependents; any task whose `dependsOn` list is now fully satisfied moves from `blocked → ready` automatically. Include unblocked task IDs in evidence.
  - Implement structured transition evidence: `transitionId`, `taskId`, `fromState`, `toState`, `guardResults`, `dependentsUnblocked`, `timestamp`, `actor`.
  - Implement `onCommand` handler for the task-engine module: `run-transition`, `get-task`, `list-tasks`, `get-ready-queue`.
  - Wire commands through the CLI `run` command (already built).
  - Add exhaustive test matrix: every valid transition, every invalid transition, guard failures, auto-unblock cascades, evidence completeness, persistence round-trip, concurrent-safe save behavior.
- Acceptance criteria:
  - Transition service is deterministic under repeated runs with identical inputs.
  - Auto-unblock correctly cascades through dependency chains.
  - Evidence records are emitted for every transition including auto-unblocks.
  - File-backed store persists and reloads correctly.
  - `workspace-kit run list-tasks` and `workspace-kit run get-ready-queue` return structured JSON.
  - Typed errors map to specific caller-facing failure states.

### [x] T186 [workspace-kit] Add task-type adapter contract and TASKS.md generation
- Priority: P1
- Approach: Adapter interface for task sources + generated TASKS.md as the human-readable view + one-time import from current TASKS.md format.
- Depends on: `T184`, `T185`
- Unblocks: `T193`, `T217`
- Supporting tasks: `T204`
- Technical scope:
  - Define `TaskAdapter` interface: `load()` to hydrate tasks from external source, `save()` to persist back, `supports()` to declare capabilities (read, write, watch). Adapters are optional — the file-backed store is the canonical source.
  - Enforce adapter capability validation on registration.
  - Implement **TASKS.md generator**: reads task state from the store and produces a formatted `docs/maintainers/TASKS.md` matching the current section structure (status markers, dependency fields, phase groupings). This is a write-only output, not a round-trip.
  - Implement **import-tasks command**: one-time parser that reads the current TASKS.md markdown format and imports tasks into the engine's JSON state. Handles status markers (`[p]`, `[ ]`, `[~]`, `[!]`, `[x]`), dependency fields, priority, and phase groupings.
  - Add `generate-tasks-md` and `import-tasks` as instruction entries on the task-engine module.
  - Add tests: adapter registration, TASKS.md generation matches expected format, import round-trip (import then generate produces equivalent output), invalid adapter rejection.
- Acceptance criteria:
  - Adapter interface is stable, versioned, and exported.
  - `workspace-kit run generate-tasks-md` produces a well-formatted `docs/maintainers/TASKS.md` from engine state.
  - `workspace-kit run import-tasks` successfully imports the current TASKS.md into `.workspace-kit/tasks/state.json`.
  - Invalid adapters fail registration with clear error codes.
  - Adapters cannot mutate task state outside the transition service.

### [x] T217 [workspace-kit] Implement next-action suggestion engine
- Priority: P1
- Approach: Ready-queue analysis with priority sorting and blocking chain reporting.
- Depends on: `T185`, `T186`
- Unblocks: `T218` (Phase 2 workbook); Phase 3 Enhancement Engine will extend next-action surface
- Technical scope:
  - Implement `get-next-actions` command that returns the ready queue sorted by priority (P1 first), with blocking chain analysis showing which completed tasks unblocked each ready task.
  - Include summary: how many tasks are in each state, what's blocking the most work, suggested next task to start.
  - Wire as instruction entry on the task-engine module with instruction file documenting agent usage.
  - Add tests: priority ordering, blocking chain accuracy, empty-queue behavior, all-complete behavior.
- Acceptance criteria:
  - `workspace-kit run get-next-actions` returns prioritized ready queue with blocking chain context.
  - Agents can use the output to decide what to work on next without manual TASKS.md inspection.
  - Output includes state summary and suggested next task.

## Phase 2 config, policy, and local task cutover

Release target: **GitHub release `v0.4.0`** (single release for all Phase 2 deliverables).

### Design decisions (resolved)

| Decision | Choice |
| --- | --- |
| Up-front workbook | Yes — `T218` completes `docs/maintainers/phase2-config-policy-workbook.md` before registry implementation (`T187`). |
| Config scope | Full layered stack for `v0.4.0` (no “out of scope” deferrals); exact precedence and merge rules are binding in the workbook. |
| Project vs module config | **Both required:** **project (global)** `.workspace-kit/config.json` for workspace-wide and optional `modules.<id>` overrides; **module-level** defaults per module from `config.md` / registration. Module layer merged first; **project overrides** that merge; then env; then `run` JSON. |
| Explain / diagnostics | **Agent-first:** structured JSON via `workspace-kit run` (command name and payload shape defined in workbook). |
| Sensitive operations | Baseline list in **T188** (mutating CLI + write-capable module commands); extendable via policy config. |
| Approvals (`v0.4.0`) | **Agent-mediated:** coding agent obtains explicit user confirmation in chat before invoking a sensitive operation; approval represented in command context (e.g. token + short rationale) and recorded in policy trace. No separate approval file format required for baseline. |
| Actor identity | **Default resolution chain** (documented in workbook, implemented in T188): JSON `actor` arg → `WORKSPACE_KIT_ACTOR` → `git config user.email` (fallback `user.name`) → `"unknown"`. |
| “Migration” for Phase 2 | **Maintainer-local task cutover only** for this repo when ready — runbook + checklist; **no** generic migration orchestration API or migration runtime shipped in the package for `v0.4.0`. |
| Release cadence | One **`v0.4.0`** release covering workbook + config + policy + cutover docs. |

**Execution order:** `T218` → `T187` → `T200` → `T188` → `T201` → `T189`. Tasks `T200` and `T201` stay on the critical path (matrix before policy enforcement; cutover checklist before runbook sign-off).

### [x] T218 [workspace-kit] Author Phase 2 config, policy, and cutover workbook
- Priority: P1
- Approach: Same rigor as `T199`: binding workbook before implementation; incorporates the resolved decisions above and fills in field-level detail.
- Depends on: `T217`
- Unblocks: `T187`
- Technical scope:
  - **Project vs module:** **Project (global)** config is maintainers’ `.workspace-kit/config.json` (domain keys and/or `modules.<moduleId>` overrides). **Module-level** config is each module’s `config.md` / registration defaults, merged in **registry dependency order** **before** the project layer applies.
  - **Config precedence (binding, low → high):** kit built-in defaults → **merged module-level** contributions (topological order; collision rules per workbook) → **project (global)** `.workspace-kit/config.json` **overrides** that merge → `WORKSPACE_KIT_*` env (nested keys via `__`) → per-invocation JSON on `workspace-kit run` (highest).
  - **Merge semantics:** document per-field behavior (scalar replace vs deep object merge) and validation failure modes.
  - **Typed registry:** domain keys (e.g. core, task-engine, documentation), schema validation, stable error taxonomy.
  - **Explain command:** JSON report: logical path → effective value → winning layer + discarded alternates.
  - **Policy:** enumerate sensitive **operation IDs** aligned with router/CLI (minimum: `upgrade`; `init` when it performs writes; `document-project` / `generate-document` when not `dryRun` or when configured overwrites would touch outputs; task-engine `import-tasks`, `generate-tasks-md`, `run-transition`). Read-only paths (`doctor`, `check`, `drift-check`, `list-tasks`, `get-task`, `get-ready-queue`, `get-next-actions`, dry-run generation, etc.) **excluded** unless workbook adds an explicit exception.
  - **Approvals + traces:** contract for agent-supplied approval fields; trace record shape (operation, actor, allowed/denied, rationale, timestamp, config snapshot hash optional).
  - **Actor:** document the default resolution chain (see decisions table).
  - **Local task cutover:** numbered steps for maintainers (backup, `import-tasks`, validate, `generate-tasks-md`, git/PR hygiene); explicit **non-goal:** no packaged migration runner or staged migration engine in `v0.4.0`.
- Acceptance criteria:
  - Workbook exists at `docs/maintainers/phase2-config-policy-workbook.md` and is complete enough that implementers do not need ad hoc product decisions during `T187`–`T189`.
  - Non-goals for `v0.4.0` explicitly exclude generic migration orchestration in the npm package.

### [x] T187 [workspace-kit] Implement typed config registry with deterministic precedence
- Priority: P1
- Approach: Implement per `T218` workbook; typed schema + precedence resolver + agent-first explain command.
- Depends on: `T184`, `T218`
- Unblocks: `T200`
- Supporting tasks: `T200`
- Technical scope:
  - Implement typed config registry with schema validation and deterministic merge: **module-level** sources per module + **project (global)** overlay from `.workspace-kit/config.json`, then env, then invocation overrides per workbook.
  - Wire registry into startup or command context so module commands and CLI resolve **effective** config per domain and per module id where applicable.
  - Implement **agent-first** explain: `workspace-kit run` command as specified in workbook (JSON-only output).
  - Unit tests for precedence, merge edge cases, and explain correctness.
- Acceptance criteria:
  - Same layered inputs always yield the same effective config.
  - Explain output identifies winning source per field and matches workbook contract.
  - Failing validation yields stable, typed errors.

### [x] T188 [workspace-kit] Implement policy and approval enforcement baseline
- Priority: P1
- Approach: Policy evaluator integrated with command dispatch; agent-mediated approval; decision traces per workbook.
- Depends on: `T184`, `T187`, `T200`
- Unblocks: `T189`, `T190`, `T193`, `T201`
- Supporting tasks: `T200`
- Technical scope:
  - Implement policy evaluation for **sensitive operation IDs** from workbook + `T200` matrix (extendable via config).
  - Enforce gate: sensitive `workspace-kit` / module command paths **fail closed** unless valid approval payload present in context (agent obtained user confirmation).
  - Integrate at **module command router** boundary (or single pre-dispatch wrapper) so new write commands inherit policy unless explicitly exempted in code.
  - Emit **policy decision traces** (structured JSON, persist per workbook: e.g. under `.workspace-kit/policy/` or append-only log as defined in workbook).
  - Resolve **actor** using the default chain from workbook.
  - Tests: each sensitive op blocked without approval; allowed with valid approval; traces include operation, actor, outcome, rationale.
- Acceptance criteria:
  - Sensitive operations from the baseline list cannot succeed without approval recorded in context.
  - Decision traces satisfy workbook schema and are machine-readable.
  - Read-only / dry-run paths from baseline remain ungated unless workbook specifies otherwise.

### [x] T189 [workspace-kit] Maintainer-local task engine cutover runbook
- Priority: P1
- Approach: Documentation and evidence template only — **no** migration orchestration runtime in the package for `v0.4.0`.
- Depends on: `T187`, `T188`, `T201`
- Unblocks: `T195`
- Supporting tasks: `T201`
- Technical scope:
  - Publish maintainer runbook (path per workbook; e.g. `docs/maintainers/task-engine-cutover.md`) describing **local-only** execution: when the team chooses to cut over, how to back up `docs/maintainers/TASKS.md`, run `import-tasks`, validate JSON state, run `generate-tasks-md`, and open PR with evidence.
  - Optional: define a simple **local evidence JSON template** (path under `artifacts/` or `.workspace-kit/`) for one rehearsal — not a product API.
  - Explicitly defer **generic** migration framework (preflight/stage engine in package) to a later phase if still needed.
- Acceptance criteria:
  - Another maintainer can follow the runbook on a clean clone without undocumented steps.
  - Runbook states that cutover is **voluntary** and **local**; package does not auto-migrate consumer repos.
  - No new public migration API surface is required for acceptance (docs-only slice is sufficient if workbook non-goals hold).

## Phase 3 enhancement loop MVP

Release target: **GitHub release `v0.5.0`**

### [ ] T190 [workspace-kit] Implement recommendation intake and review queue
- Priority: P1
- Approach: Queue with explicit decision states and audit references.
- Depends on: `T185`, `T188`
- Unblocks: `T191`, `T192`, `T202`
- Supporting tasks: `T202`
- Technical scope:
  - Implement queue entity with recommendation lifecycle states.
  - Implement decision actions (`accept`, `decline`, `accept edited`).
  - Persist audit references tying decisions to evidence and actor.
- Acceptance criteria:
  - Queue supports full decision lifecycle with immutable history.
  - Decision actions are idempotent and validated.

### [ ] T191 [workspace-kit] Implement evidence-backed recommendation generation
- Priority: P1
- Approach: Evidence-backed generation + confidence scoring + dedupe pipeline.
- Depends on: `T190`, `T183`
- Unblocks: `T192`, `T202`
- Supporting tasks: `T202`
- Technical scope:
  - Build ingestion pipeline for transcripts, diffs, and docs.
  - Implement confidence scoring and threshold rules.
  - Implement dedupe to prevent redundant queue entries.
- Acceptance criteria:
  - Generated recommendations include evidence links and confidence.
  - Dedupe prevents equivalent duplicate recommendations.

### [ ] T192 [workspace-kit] Implement canonical artifact lineage model
- Priority: P1
- Approach: Canonical lineage contract with immutable correlation IDs.
- Depends on: `T190`, `T191`
- Unblocks: `T193`, `T203`
- Supporting tasks: `T203`
- Technical scope:
  - Define lineage event model and correlation ID strategy.
  - Persist lineage links across recommendation, decision, and change artifacts.
  - Expose lineage query path for debugging and audit.
- Acceptance criteria:
  - End-to-end lineage can be reconstructed deterministically.
  - Lineage records are immutable after commit.

## Phase 4 scale and ecosystem hardening

Release target: **GitHub release `v0.6.0`**

### [ ] T193 [workspace-kit] Define module/plugin compatibility contract
- Priority: P2
- Approach: Contract + conformance checks + compatibility matrix.
- Depends on: `T186`, `T188`, `T192`
- Unblocks: `T194`, `T195`, `T204`
- Supporting tasks: `T204`
- Technical scope:
  - Define compatibility contract and version policy for extensions.
  - Implement conformance checks for required contract behaviors.
  - Publish compatibility matrix format and validation expectations.
- Acceptance criteria:
  - Extensions can be validated against contract rules.
  - Incompatible extensions fail with explicit incompatibility reasons.

### [ ] T194 [workspace-kit] Add supportability and runtime objective controls
- Priority: P2
- Approach: Diagnostics + health checks + baseline SLO objectives.
- Depends on: `T185`, `T193`
- Unblocks: `T195`, `T205`
- Supporting tasks: `T205`
- Technical scope:
  - Define baseline diagnostics bundle and health checks.
  - Define minimum runtime objective set (latency/error/throughput).
  - Wire objective reporting for operational review.
- Acceptance criteria:
  - Diagnostics can be generated in one command path.
  - Runtime objectives are measurable and documented.

### [ ] T195 [workspace-kit] Define release-channel and compatibility guarantees
- Priority: P2
- Approach: Define channels tied to explicit compatibility and migration guarantees.
- Depends on: `T179`, `T189`, `T193`, `T194`
- Unblocks: none
- Supporting tasks: `T204`, `T205`
- Technical scope:
  - Define channel policy (`canary`, `stable`, `lts`) and promotion criteria.
  - Define compatibility guarantees and required migration notes per channel.
  - Define rollback posture per channel and release type.
- Acceptance criteria:
  - Channel policy is documented and enforceable in release flow.
  - Compatibility and migration guarantees are explicit per channel.

## Supporting tasks (manageability slices)

### [x] T196 [workspace-kit] Build release gate matrix and ownership map
- Priority: P2
- Approach: Build a normalized gate matrix in docs and CI mapping.
- Depends on: `T178`
- Unblocks: `T179`
- Technical scope:
  - Enumerate release gates, owners, input artifacts, and fail actions.
  - Map gate execution points to workflow steps/jobs.
  - Define escalation path for gate failures.
- Acceptance criteria:
  - Release gate matrix is complete and referenced by release docs.

### [x] T197 [workspace-kit] Build consumer parity fixture pack
- Priority: P2
- Approach: Create reusable fixture package and shared parity runner scripts.
- Depends on: `T180`
- Unblocks: `T181`, `T182`
- Technical scope:
  - Build fixture workspace with deterministic setup.
  - Implement parity runner script callable from local and CI.
  - Standardize fixture artifact output paths.
- Acceptance criteria:
  - Fixture pack can execute parity flow in CI and locally.

### [x] T198 [workspace-kit] Define parity evidence schema
- Priority: P2
- Approach: Publish JSON schema and artifact placement contract for parity evidence.
- Depends on: `T181`
- Unblocks: `T183`
- Technical scope:
  - Define schema fields, required keys, and versioning policy.
  - Define artifact file naming and retention rules.
  - Add schema validation check in evidence generation path.
- Acceptance criteria:
  - Evidence schema is versioned and validated in pipeline.

### [x] T214 [workspace-kit] Split document-project and generate-document into batch vs single commands
- Priority: P1
- Approach: Separate batch orchestration from single-document generation; add per-surface overwrite control and filesSkipped evidence.
- Depends on: `T211`, `T212`
- Unblocks: `T215`
- Technical scope:
  - Split `document-project` (batch: all templates) from `generate-document` (single doc) as separate registered commands.
  - Add `overwriteAi` and `overwriteHuman` options for per-surface overwrite control.
  - Batch defaults: preserve AI docs (`overwriteAi: false`), overwrite human docs (`overwriteHuman: true`).
  - Continue through all templates on individual failure; report batch summary.
  - Add `filesSkipped` to `DocumentationGenerationEvidence` for skipped-file signaling.
  - Update instruction files, RULES, README, and tests.
- Acceptance criteria:
  - `document-project` processes all templates and returns batch summary with per-doc results.
  - `generate-document` handles single-doc generation independently.
  - `filesSkipped` is populated when files are preserved due to overwrite settings.
  - Instruction for `document-project` directs agents to prompt user on skipped AI docs.
  - 40/40 tests pass.

### [x] T216 [workspace-kit] Add CLI run command for module command dispatch
- Priority: P1
- Approach: Bridge runCli to the module command router so agents and scripts can invoke module commands from the terminal.
- Depends on: `T210`, `T214`
- Unblocks: none
- Technical scope:
  - Add `workspace-kit run` CLI command that lists available module commands when called with no subcommand.
  - Add `workspace-kit run <command> [json-args]` dispatch that routes through `ModuleCommandRouter` and outputs structured JSON results.
  - Handle error cases: invalid JSON args, unknown commands, unimplemented `onCommand`.
  - Add 5 CLI tests covering listing, dispatch, batch, unimplemented command, and invalid args.
- Acceptance criteria:
  - `workspace-kit run` lists all registered module commands with descriptions.
  - `workspace-kit run generate-document '{"documentType":"AGENTS.md","options":{"dryRun":true}}'` returns structured JSON.
  - `workspace-kit run document-project '{"options":{"dryRun":true}}'` runs batch and returns summary.
  - 45/45 tests pass.

### [x] T215 [workspace-kit] Generate full project documentation via document-project
- Priority: P1
- Approach: Use the documentation module as an AI agent to generate all 8 templates, producing AI-optimized docs in `.ai/` and human-readable docs in `docs/maintainers/`.
- Depends on: `T214`
- Unblocks: none
- Technical scope:
  - Read all 8 templates and follow `{{{ }}}` instruction blocks against real project context.
  - Generate AI-optimized docs in canonical `meta|v=1` pipe-delimited format for `.ai/`.
  - Generate human-readable prose Markdown for `docs/maintainers/`.
  - Skip `.ai/PRINCIPLES.md` (already exists; overwriteAi: false).
  - Overwrite all human docs with fresh content aligned to current project state.
- Acceptance criteria:
  - 7 new AI docs created in `.ai/` (AGENTS, ARCHITECTURE, RELEASING, ROADMAP, SECURITY, SUPPORT, TERMS).
  - 8 human docs overwritten in `docs/maintainers/`.
  - Content follows template instructions and reflects actual project state.

### [x] T200 [workspace-kit] Build config-policy decision matrix
- Priority: P1
- Approach: Map config resolution to policy evaluation points; documentation + matrix-driven tests for `T188`.
- Depends on: `T187`
- Unblocks: `T188`
- Technical scope:
  - Tabulate each config field (or domain) that affects security, write roots, or dry-run defaults against **which sensitive operations** consult it.
  - Define expected behavior when policy denies vs allows; include agent-approval-required rows for every sensitive op ID from workbook.
  - Produce executable test checklist (or unit test list) used to sign off `T188`.
- Acceptance criteria:
  - Matrix covers all layers from workbook and all baseline sensitive operations.
  - `T188` acceptance can trace each policy behavior to a matrix row or test case.

### [x] T201 [workspace-kit] Build local task cutover checklist
- Priority: P1
- Approach: Preflight / rollback checklist for **maintainer-local** task engine cutover (supports `T189` runbook).
- Depends on: `T188`
- Unblocks: `T189`
- Technical scope:
  - Checklist: backups (TASKS.md, `.workspace-kit/tasks/`), branch hygiene, `import-tasks` dry rehearsal, diff review, `generate-tasks-md` output review, policy/approval awareness when running mutating commands.
  - Rollback posture: how to revert to markdown-first workflow if cutover branch is abandoned (restore files, remove state file).
  - Optional evidence file naming for one dry rehearsal (local only).
- Acceptance criteria:
  - Checklist is actionable and **referenced from `T189` runbook**.
  - No dependency on a packaged migration engine; steps use existing CLI/module commands only.

### [ ] T202 [workspace-kit] Define recommendation confidence rubric
- Priority: P2
- Approach: Define quantitative rubric for recommendation scoring and gating.
- Depends on: `T190`
- Unblocks: `T191`
- Technical scope:
  - Define scoring dimensions and confidence thresholds.
  - Define queue insertion threshold behavior and rejection reasons.
  - Define dedupe equivalence rules.
- Acceptance criteria:
  - Rubric supports deterministic queue-admission behavior.

### [ ] T203 [workspace-kit] Define lineage event contract
- Priority: P2
- Approach: Define immutable event contract and correlation strategy for provenance.
- Depends on: `T191`
- Unblocks: `T192`
- Technical scope:
  - Define lineage event types and required fields.
  - Define correlation ID lifecycle and propagation rules.
  - Define append-only storage constraints.
- Acceptance criteria:
  - Event contract is stable and supports end-to-end lineage reconstruction.

### [ ] T204 [workspace-kit] Build compatibility matrix template
- Priority: P2
- Approach: Build reusable compatibility matrix and conformance report template.
- Depends on: `T193`
- Unblocks: `T195`
- Technical scope:
  - Define matrix dimensions (runtime/version/contract level).
  - Define conformance output format and severity levels.
  - Define reporting integration point for release readiness.
- Acceptance criteria:
  - Matrix template can be used across module and channel policy tasks.

### [ ] T205 [workspace-kit] Define diagnostics and SLO baseline pack
- Priority: P2
- Approach: Define minimum diagnostics payload and baseline objective pack.
- Depends on: `T194`
- Unblocks: `T195`
- Technical scope:
  - Define diagnostics bundle fields and collection triggers.
  - Define baseline runtime objective set and calculation method.
  - Define objective reporting cadence and threshold handling.
- Acceptance criteria:
  - Baseline diagnostics/SLO pack is ready for runtime instrumentation.
