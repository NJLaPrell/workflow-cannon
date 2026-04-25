# CAE Next Work Plan

This is the working plan for Context Activation Engine work after Phase 70 implementation. CAE now has strong primitives; the next work is to turn those primitives into an operator-grade product workflow.

## Current Status

CAE is implemented as a conservative v1 stack:

- Runtime registry authority is kit SQLite (`kit.cae.registryStore: sqlite`).
- `doctor`, `cae-health`, `cae-validate-registry`, read-only registry commands, evaluation, explain, trace, shadow preflight, advisory surfacing, and governed mutation primitives exist.
- Shadow preflight and advisory payloads can run when configured; live enforcement is intentionally off by default.
- The current repository registry seed is small: 12 artifacts and 4 activations.
- Phase 70 task-engine work is terminal: no ready, in-progress, or blocked Phase 70 tasks were present at the last review.

The problem now is not "build CAE." The problem is "make CAE obvious, trustworthy, and useful without making operators spelunk through a dozen fucking surfaces."

## Task Rows

These follow-on rows are opened as Phase 70 ready tasks:

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

- [ ] Define the single primary CAE v1 operator journey.
- [ ] Create a canonical "golden path" runbook under `.ai/cae/` or `.ai/runbooks/`.
- [ ] Include exact commands for health, registry validation, evaluation, explanation, trace fetch, and conflict inspection.
- [ ] Keep read-only inspection separate from governed mutation.
- [ ] Add a "bad path" recovery section for missing SQLite DB, missing active registry version, malformed registry rows, trace not found, and persistence disabled.
- [ ] Make `doctor`, `cae-health`, and advisory surfaces point operators toward this golden path first.

Exit criteria:

- A new maintainer can run the CAE smoke path without reading implementation code.
- The runbook explains what success looks like and what to do when each common failure code appears.
- CAE docs read like a product workflow, not a command junk drawer.

## Workstream 2 — Golden Smoke Fixtures

Goal: make the operator path reproducible in tests and release validation.

Tasks:

- [ ] Add committed golden fixtures for the primary v1 scenario.
- [ ] Capture expected normalized output for `cae-evaluate`, `cae-explain`, and trace retrieval.
- [ ] Add one negative fixture for a common failure path.
- [ ] Add a smoke test that runs the golden path through command handlers or the CLI with stable output normalization.
- [ ] Promote this smoke check into the release or pre-merge gate when stable enough.

Exit criteria:

- One committed fixture proves the happy path.
- One committed fixture proves failure recovery behavior.
- The smoke test fails when output contracts drift accidentally.

## Workstream 3 — Truth And Planning Cleanup

Goal: remove stale CAE planning claims now that SQLite registry authority shipped.

Tasks:

- [ ] Update or supersede `CAE_PLAN.md`; its "current repo state" still describes JSON as live registry authority.
- [ ] Mark `tasks/cae/CAE-PLAN-STATUS.md` as historical, or rewrite it to defer to `.ai/cae/` plus task-engine output.
- [ ] Keep `.ai/cae/phase-70-registry-task-tracker.md` only if it remains useful as provenance; otherwise demote it to history.
- [ ] Ensure `.ai/cae/README.md` names the current operator plan and not only the old implementation wave.
- [ ] Add a drift check or checklist item for CAE docs that mention registry authority, trace persistence, enforcement, or JSON seed fate.

Exit criteria:

- No active planning document says JSON registry files are authoritative at runtime.
- Historical task waves are clearly labeled as provenance, not current work.
- Operators can tell which CAE document owns current next work.

## Workstream 4 — Trace And Persistence Semantics

Goal: make trace persistence behavior unsurprising.

Tasks:

- [ ] Reconcile `cae-persistence-port.ts` no-op wording with the shipped SQLite trace snapshot path.
- [ ] Decide whether the v1 persistence abstraction should grow a real SQLite implementation or be removed as stale scaffolding.
- [ ] Make `cae-health` explain why `lastEvalAt` can be `null` even when persisted trace rows exist.
- [ ] Add tests for `cae-get-trace` across process boundaries when `kit.cae.persistence` is true.
- [ ] Document trace retention and pruning behavior in one operator-facing place.

Exit criteria:

- The persistence model is explainable in one paragraph.
- Health output, code comments, and docs no longer imply different trace stories.
- Cross-process trace retrieval has explicit coverage.

## Workstream 5 — Context Quality

Goal: improve activation relevance by feeding CAE real bounded context.

Tasks:

- [ ] Hydrate task rows for CLI preflight when a `taskId` or `id` is present, rather than using a thin inferred row.
- [ ] Include bounded task title, tags, features, phase key, and allowlisted metadata in preflight context.
- [ ] Consider bounded active-task context for commands that do not directly pass `taskId`.
- [ ] Keep the metadata allowlist strict; do not dump raw task rows, env, paths, or giant argv blobs into CAE.
- [ ] Add tests showing task-level, command-level, and layered activations differ in useful ways.

Exit criteria:

- Preflight CAE output is materially closer to direct `cae-evaluate` output for real task work.
- Context hydration remains bounded and deterministic.
- Activation misses caused by missing tags/features are reduced.

## Workstream 6 — Registry Content Expansion

Goal: make CAE useful across common workflows, not just Phase 70 demos.

Tasks:

- [ ] Add activation coverage for task delivery, phase closeout, release readiness, improvement discovery, wishlist conversion, docs generation, plugin operations, and policy-sensitive task transitions.
- [ ] Add review-family activations for risky completion, release, registry mutation, and generated-doc drift.
- [ ] Add think/do-family activations that point to existing playbooks without embedding doc bodies.
- [ ] Define a registry curation rule: every new activation must have a clear owner, scope condition, artifact reference, and test fixture.
- [ ] Keep the registry small enough to stay understandable; kill noisy activations quickly.

Exit criteria:

- CAE activates on several high-value workflows, not only Phase 70.
- Each activation maps to an artifact that a human can inspect.
- Registry growth is governed by usefulness, not vibes.

## Workstream 7 — Shadow Feedback

Goal: learn whether CAE is helping before enforcement grows teeth.

Tasks:

- [ ] Add an operator feedback command or workflow for marking shadow observations as useful or noisy.
- [ ] Persist feedback with trace id, activation id, command name, actor, and timestamp.
- [ ] Summarize feedback in `cae-health` or a dedicated read-only report.
- [ ] Use feedback to decide which activations graduate, change, or get retired.
- [ ] Document the shadow bake requirement before any enforcement expansion.

Exit criteria:

- Maintainers can quantify whether shadow output helps.
- Enforcement decisions cite actual shadow evidence.
- Noisy activations have an obvious retirement path.

## Workstream 8 — Acknowledgement Flow

Goal: prove acknowledgement semantics end to end.

Tasks:

- [ ] Create a scenario that emits `pendingAcknowledgements`.
- [ ] Run `cae-satisfy-ack` against a persisted trace and verify the SQLite ack row.
- [ ] Add a read-only way to inspect satisfied acknowledgements by trace or activation.
- [ ] Clarify where acknowledgement stops and Tier A/B `policyApproval` begins.
- [ ] Add tests for invalid token, wrong activation id, missing trace, and persistence disabled.

Exit criteria:

- Ack rows are not theoretical.
- Operators can inspect what was acknowledged and by whom.
- No doc or command output confuses CAE acknowledgement with `policyApproval`.

## Workstream 9 — Enforcement Pilot Readiness

Goal: keep enforcement narrow, evidence-backed, and reversible.

Tasks:

- [ ] Define the first real enforcement pilot scenario, or explicitly defer live enforcement.
- [ ] Require a shadow bake record before enabling live blocks.
- [ ] Ensure every allowlist row has a stable id, remediation path, tests, and rollback instructions.
- [ ] Keep `kit.cae.enforcement.enabled` off by default.
- [ ] Prove enforcement never blocks Tier C bootstrap/read-only commands and never waives code policy.

Exit criteria:

- Enforcement cannot expand accidentally.
- Live blocks are backed by shadow evidence and clear remediation.
- Rollback is one config change.

## Workstream 10 — Product Boundary Confidence

Goal: prove CAE works outside the repo-local happy path.

Tasks:

- [ ] Add a clean-install smoke scenario that exercises CAE health and registry validation.
- [ ] Add an upgrade smoke scenario covering a workspace before CAE registry SQLite tables.
- [ ] Verify packaged artifacts include CAE schemas, instruction files, registry seed data, and runbooks needed by commands.
- [ ] Test native SQLite failure remediation where CAE registry or trace persistence is requested.
- [ ] Include CAE vertical-slice evidence in release readiness once stable.

Exit criteria:

- A packaged consumer can run the CAE smoke path without missing files.
- Upgrade and recovery failures have actionable remediation.
- Release confidence is based on consumer-realistic CAE behavior.

## Workstream 11 — Command And Output UX

Goal: make CAE command output easy for humans and agents to use.

Tasks:

- [ ] Audit every `cae-*` command name, instruction file, `code`, remediation hint, and JSON envelope for consistency.
- [ ] Ensure `cae-conflicts` has a copy-pasteable minimal request example.
- [ ] Add response-template hints for the golden path, degraded advisory output, ack-required output, and enforcement-blocked output.
- [ ] Keep JSON stdout clean; diagnostics and prose must not break automation.
- [ ] Add examples for common filters and pagination on registry list commands.

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
