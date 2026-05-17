# CAE Next Work Plan

This is the completed follow-on plan for Context Activation Engine work after the Phase 70 SQLite-registry implementation. CAE now has strong primitives and an operator-grade smoke path; remaining Phase 70 work is release closeout evidence, not more implementation scope.

## Current Status

CAE is implemented as a conservative v1 stack:

- Runtime registry authority is kit SQLite (`kit.cae.registryStore: sqlite`).
- `doctor`, `cae-health`, `cae-validate-registry`, read-only registry commands, evaluation, explain, trace, shadow preflight, advisory surfacing, and governed mutation primitives exist.
- Shadow preflight and advisory payloads can run when configured; live enforcement is intentionally off by default.
- The current repository registry seed is small and intentionally curated.
- Phase 70 implementation and productization rows `T921`-`T931` are terminal in the task engine. Release-closeout rows `T932`+ track evidence and doc-state cleanup.

The problem now is not "build CAE." The problem is "make CAE obvious, trustworthy, and useful without making operators spelunk through a dozen fucking surfaces."

## Completed Task Rows

These follow-on rows were opened as Phase 70 tasks and are now completed provenance:

| Task | Workstream |
| --- | --- |
| `T921` | Operator vertical slice / golden-path runbook |
| `T922` | Golden smoke fixtures and tests |
| `T923` | Planning truth cleanup after SQLite registry authority |
| `T924` | Trace persistence semantics cleanup |
| `T925` | Bounded task context hydration for CLI preflight |
| `T926` | Registry content expansion batch 1 |
| `T927` | Shadow feedback capture and report |
| `T928` | Acknowledgement inspection flow |
| `T929` | Enforcement pilot readiness and deferral decision |
| `T930` | Product-boundary smoke coverage |
| `T931` | Command and output UX audit |

## North Star

A maintainer should be able to prove CAE works from one clear flow:

1. Confirm CAE health and registry authority.
2. Validate the active registry.
3. Run a representative evaluation.
4. Explain or fetch the trace.
5. Inspect conflict or recovery behavior.
6. Understand how governed mutation differs from read-only inspection.

That vertical slice should be committed, documented, tested, and usable as the smoke path for future CAE changes.

## Workstream 1 — Operator Vertical Slice

Goal: package CAE into one end-to-end workflow instead of a bag of commands.

Tasks:

- [x] Define the single primary CAE v1 operator journey.
- [x] Create a canonical "golden path" runbook under `.ai/cae/` or `.ai/runbooks/`.
- [x] Include exact commands for health, registry validation, evaluation, explanation, trace fetch, and conflict inspection.
- [x] Keep read-only inspection separate from governed mutation.
- [x] Add a "bad path" recovery section for missing SQLite DB, missing active registry version, malformed registry rows, trace not found, and persistence disabled.
- [x] Make `doctor`, `cae-health`, and advisory surfaces point operators toward this golden path first.

Exit criteria:

- A new maintainer can run the CAE smoke path without reading implementation code.
- The runbook explains what success looks like and what to do when each common failure code appears.
- CAE docs read like a product workflow, not a command junk drawer.

## Workstream 2 — Golden Smoke Fixtures

Goal: make the operator path reproducible in tests and release validation.

Tasks:

- [x] Add committed golden fixtures for the primary v1 scenario.
- [x] Capture expected normalized output for `cae-evaluate`, `cae-explain`, and trace retrieval.
- [x] Add one negative fixture for a common failure path.
- [x] Add a smoke test that runs the golden path through command handlers or the CLI with stable output normalization.
- [x] Promote this smoke check into the release or pre-merge gate when stable enough.

Exit criteria:

- One committed fixture proves the happy path.
- One committed fixture proves failure recovery behavior.
- The smoke test fails when output contracts drift accidentally.

## Workstream 3 — Truth And Planning Cleanup

Goal: remove stale CAE planning claims now that SQLite registry authority shipped.

Tasks:

- [x] Update or supersede `CAE_PLAN.md`; its "current repo state" still describes JSON as live registry authority.
- [x] Mark `tasks/cae/CAE-PLAN-STATUS.md` as historical, or rewrite it to defer to `.ai/cae/` plus task-engine output.
- [x] Keep `.ai/cae/phase-70-registry-task-tracker.md` only if it remains useful as provenance; otherwise demote it to history.
- [x] Ensure `.ai/cae/README.md` names the current operator plan and not only the old implementation wave.
- [x] Add a drift check or checklist item for CAE docs that mention registry authority, trace persistence, enforcement, or JSON seed fate.

Exit criteria:

- No active planning document says JSON registry files are authoritative at runtime.
- Historical task waves are clearly labeled as provenance, not current work.
- Operators can tell which CAE document owns current next work.

## Workstream 4 — Trace And Persistence Semantics

Goal: make trace persistence behavior unsurprising.

Tasks:

- [x] Reconcile `cae-persistence-port.ts` no-op wording with the shipped SQLite trace snapshot path.
- [x] Decide whether the v1 persistence abstraction should grow a real SQLite implementation or be removed as stale scaffolding.
- [x] Make `cae-health` explain why `lastEvalAt` can be `null` even when persisted trace rows exist.
- [x] Add tests for `cae-get-trace` across process boundaries when `kit.cae.persistence` is true.
- [x] Document trace retention and pruning behavior in one operator-facing place.

Exit criteria:

- The persistence model is explainable in one paragraph.
- Health output, code comments, and docs no longer imply different trace stories.
- Cross-process trace retrieval has explicit coverage.

## Workstream 5 — Context Quality

Goal: improve activation relevance by feeding CAE real bounded context.

Tasks:

- [x] Hydrate task rows for CLI preflight when a `taskId` or `id` is present, rather than using a thin inferred row.
- [x] Include bounded task title, tags, features, phase key, and allowlisted metadata in preflight context.
- [x] Consider bounded active-task context for commands that do not directly pass `taskId`.
- [x] Keep the metadata allowlist strict; do not dump raw task rows, env, paths, or giant argv blobs into CAE.
- [x] Add tests showing task-level, command-level, and layered activations differ in useful ways.

Exit criteria:

- Preflight CAE output is materially closer to direct `cae-evaluate` output for real task work.
- Context hydration remains bounded and deterministic.
- Activation misses caused by missing tags/features are reduced.

## Workstream 6 — Registry Content Expansion

Goal: make CAE useful across common workflows, not just Phase 70 demos.

Tasks:

- [x] Add activation coverage for task delivery, phase closeout, release readiness, improvement discovery, wishlist conversion, docs generation, plugin operations, and policy-sensitive task transitions.
- [x] Add review-family activations for risky completion, release, registry mutation, and generated-doc drift.
- [x] Add think/do-family activations that point to existing playbooks without embedding doc bodies.
- [x] Define a registry curation rule: every new activation must have a clear owner, scope condition, artifact reference, and test fixture.
- [x] Keep the registry small enough to stay understandable; kill noisy activations quickly.

Exit criteria:

- CAE activates on several high-value workflows, not only Phase 70.
- Each activation maps to an artifact that a human can inspect.
- Registry growth is governed by usefulness, not vibes.

## Workstream 7 — Shadow Feedback

Goal: learn whether CAE is helping before enforcement grows teeth.

Tasks:

- [x] Add an operator feedback command or workflow for marking shadow observations as useful or noisy.
- [x] Persist feedback with trace id, activation id, command name, actor, and timestamp.
- [x] Summarize feedback in `cae-health` or a dedicated read-only report.
- [x] Use feedback to decide which activations graduate, change, or get retired.
- [x] Document the shadow bake requirement before any enforcement expansion.

Exit criteria:

- Maintainers can quantify whether shadow output helps.
- Enforcement decisions cite actual shadow evidence.
- Noisy activations have an obvious retirement path.

## Workstream 8 — Acknowledgement Flow

Goal: prove acknowledgement semantics end to end.

Tasks:

- [x] Create a scenario that emits `pendingAcknowledgements`.
- [x] Run `cae-satisfy-ack` against a persisted trace and verify the SQLite ack row.
- [x] Add a read-only way to inspect satisfied acknowledgements by trace or activation.
- [x] Clarify where acknowledgement stops and Tier A/B `policyApproval` begins.
- [x] Add tests for invalid token, wrong activation id, missing trace, and persistence disabled.

Exit criteria:

- Ack rows are not theoretical.
- Operators can inspect what was acknowledged and by whom.
- No doc or command output confuses CAE acknowledgement with `policyApproval`.

## Workstream 9 — Enforcement Pilot Readiness

Goal: keep enforcement narrow, evidence-backed, and reversible.

Tasks:

- [x] Define the first real enforcement pilot scenario, or explicitly defer live enforcement.
- [x] Require a shadow bake record before enabling live blocks.
- [x] Ensure every allowlist row has a stable id, remediation path, tests, and rollback instructions.
- [x] Keep `kit.cae.enforcement.enabled` off by default.
- [x] Prove enforcement never blocks Tier C bootstrap/read-only commands and never waives code policy.

Exit criteria:

- Enforcement cannot expand accidentally.
- Live blocks are backed by shadow evidence and clear remediation.
- Rollback is one config change.

## Workstream 10 — Product Boundary Confidence

Goal: prove CAE works outside the repo-local happy path.

Tasks:

- [x] Add a clean-install smoke scenario that exercises CAE health and registry validation.
- [x] Add an upgrade smoke scenario covering a workspace before CAE registry SQLite tables.
- [x] Verify packaged artifacts include CAE schemas, instruction files, registry seed data, and runbooks needed by commands.
- [x] Test native SQLite failure remediation where CAE registry or trace persistence is requested.
- [x] Include CAE vertical-slice evidence in release readiness once stable.

Exit criteria:

- A packaged consumer can run the CAE smoke path without missing files.
- Upgrade and recovery failures have actionable remediation.
- Release confidence is based on consumer-realistic CAE behavior.

## Workstream 11 — Command And Output UX

Goal: make CAE command output easy for humans and agents to use.

Tasks:

- [x] Audit every `cae-*` command name, instruction file, `code`, remediation hint, and JSON envelope for consistency.
- [x] Ensure `cae-conflicts` has a copy-pasteable minimal request example.
- [x] Add response-template hints for the golden path, degraded advisory output, ack-required output, and enforcement-blocked output.
- [x] Keep JSON stdout clean; diagnostics and prose must not break automation.
- [x] Add examples for common filters and pagination on registry list commands.

Exit criteria:

- Agents can discover and run the right CAE command without guessing.
- Error output tells operators the next command to run.
- Command docs match shipped schemas and handlers.

## Explicitly Not Next

Do not spend the next round on these unless the user explicitly changes priorities:

- Cognitive-map runtime integration.
- End-user UI for CAE editing.
- Broad live enforcement.
- Arbitrary code, macros, workflow chains, or natural-language conditions inside activations.
- Bigger registry surface without golden-path proof.

## Suggested Execution Order

1. Operator vertical slice and golden smoke fixtures.
2. Truth/planning cleanup.
3. Trace persistence semantics cleanup.
4. Context quality improvements.
5. Registry content expansion.
6. Shadow feedback and acknowledgement inspection.
7. Enforcement pilot decision.
8. Product-boundary smoke coverage.
9. Command/output UX polish.

When in doubt, choose the work that makes CAE easier to prove, easier to recover, and harder to misunderstand.
