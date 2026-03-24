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

- Current phase in execution: _Phase 0 (foundation)._
- Milestone target: _Establish split-repo baseline and complete initial release/consumer hardening scope._
- Ready queue: `T179`
- Next tasks: `T179`, `T180`, `T181`, `T182`, `T183`

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

### [ ] T213 [workspace-kit] Harden documentation runtime config and validation matrix
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

### [p] T179 [workspace-kit] Harden package release metadata and automation guardrails
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

### [p] T180 [workspace-kit] Define and validate consumer update cadence
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

### [p] T181 [workspace-kit] Standardize packaged-artifact parity validation flow
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

### [p] T182 [workspace-kit] Make parity regressions release-blocking in CI
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

### [p] T183 [workspace-kit] Emit machine-readable parity evidence
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

### [ ] T184 [workspace-kit] Define Task Engine core schema and lifecycle
- Priority: P1
- Approach: Schema + lifecycle table + validation rules with lightweight prototype.
- Depends on: `T178`, `T182`
- Unblocks: `T185`, `T187`, `T188`, `T199`
- Supporting tasks: `T199`
- Technical scope:
  - Define task entity schema (IDs, status, metadata, ownership, timestamps).
  - Define allowed transition graph with guard conditions.
  - Define validation constraints and error taxonomy for invalid transitions.
- Acceptance criteria:
  - Schema and transition table are versioned and documented.
  - Prototype validates transition constraints end-to-end.

### [ ] T185 [workspace-kit] Implement Task Engine transition runtime
- Priority: P1
- Approach: Explicit internal transition layer with typed errors and test matrix.
- Depends on: `T184`
- Unblocks: `T186`, `T190`, `T194`, `T199`
- Supporting tasks: `T199`
- Technical scope:
  - Implement transition service independent from transport/CLI.
  - Enforce transition guards and side-effect ordering.
  - Add exhaustive tests for valid/invalid transitions and retries.
- Acceptance criteria:
  - Runtime transitions are deterministic under repeated runs.
  - Typed errors map cleanly to caller-facing failure states.

### [ ] T186 [workspace-kit] Add pluggable task-type adapter contract
- Priority: P1
- Approach: Adapter interface + compatibility checks + fixture validation.
- Depends on: `T184`, `T185`
- Unblocks: `T193`
- Supporting tasks: `T204`
- Technical scope:
  - Define adapter interface boundaries and lifecycle hook contract.
  - Enforce adapter capability validation on registration.
  - Add fixture tests ensuring adapters cannot bypass core invariants.
- Acceptance criteria:
  - Adapter contract is stable and versioned.
  - Invalid adapters fail registration with clear errors.

## Phase 2 config, policy, and migration base

Release target: **GitHub release `v0.4.0`**

### [ ] T187 [workspace-kit] Implement typed config registry with deterministic precedence
- Priority: P1
- Approach: Typed schema + explicit precedence resolver + explain output.
- Depends on: `T184`
- Unblocks: `T188`, `T189`, `T200`
- Supporting tasks: `T200`
- Technical scope:
  - Implement typed config registry with schema validation.
  - Implement deterministic precedence resolution across config layers.
  - Implement `why-this-value` diagnostics for resolved fields.
- Acceptance criteria:
  - Same layered inputs always resolve to same output.
  - Explain output identifies winning source per field.

### [ ] T188 [workspace-kit] Implement policy and approval enforcement baseline
- Priority: P1
- Approach: Policy evaluator + approval gates + decision traces.
- Depends on: `T184`, `T187`
- Unblocks: `T189`, `T190`, `T193`, `T200`
- Supporting tasks: `T200`
- Technical scope:
  - Implement policy evaluation engine with scoped decision inputs.
  - Enforce approval gates for sensitive actions.
  - Emit policy decision traces for audit and debugging.
- Acceptance criteria:
  - Sensitive operations are blocked without required approvals.
  - Decision traces include policy inputs, outcome, and rationale.

### [ ] T189 [workspace-kit] Deliver migration orchestration baseline
- Priority: P1
- Approach: Preflight + staged apply + rollback checkpoints with evidence.
- Depends on: `T187`, `T188`
- Unblocks: `T195`, `T201`
- Supporting tasks: `T201`
- Technical scope:
  - Implement migration preflight compatibility checks.
  - Implement staged execution checkpoints with failure handling.
  - Implement rollback path with evidence artifact capture.
- Acceptance criteria:
  - Failing migration stage can rollback safely.
  - Migration report includes preflight, stage outcomes, and rollback status.

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

### [ ] T196 [workspace-kit] Build release gate matrix and ownership map
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

### [ ] T197 [workspace-kit] Build consumer parity fixture pack
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

### [ ] T198 [workspace-kit] Define parity evidence schema
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

### [ ] T199 [workspace-kit] Draft Task Engine schema workbook
- Priority: P2
- Approach: Build a developer workbook for schema, transitions, and errors.
- Depends on: `T184`
- Unblocks: `T185`
- Technical scope:
  - Document entity schema, lifecycle graph, and guard rules.
  - Define typed error catalog and caller handling expectations.
  - Provide implementation pseudo-flows for runtime transition handling.
- Acceptance criteria:
  - Workbook is sufficient for implementation without ambiguity.

### [ ] T200 [workspace-kit] Build config-policy decision matrix
- Priority: P2
- Approach: Build a matrix mapping config resolution to policy evaluation points.
- Depends on: `T187`
- Unblocks: `T188`
- Technical scope:
  - Map precedence layers to effective value outputs.
  - Define where policy can override, block, or require approval.
  - Define matrix-driven test cases for edge conditions.
- Acceptance criteria:
  - Matrix covers all supported precedence and policy interactions.

### [ ] T201 [workspace-kit] Build migration preflight and rollback checklist
- Priority: P2
- Approach: Standardize migration checklist and rollback checkpoint protocol.
- Depends on: `T188`
- Unblocks: `T189`
- Technical scope:
  - Define mandatory preflight checks per migration class.
  - Define checkpoint boundaries and rollback triggers.
  - Define evidence artifacts for migration completion/failure.
- Acceptance criteria:
  - Migration checklist is actionable and referenced by migration runtime.

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
