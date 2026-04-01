# Releasing

Canonical release process for `@workflow-cannon/workspace-kit`.

This document defines how releases are planned, validated, published, and reviewed.

## Release intent

Every release must:

- Ship predictable behavior from packaged artifacts.
- Preserve downstream consumer compatibility (or clearly communicate breakage).
- Produce auditable evidence for what changed, why, and how it was validated.
- Feed observed friction back into improvement and rule/workflow hardening.
- Validate against packaged artifacts, not unpublished local state.

## Release principles

- **Package-first truth:** validate what users install, not unpublished local state.
- **Safety before speed:** block publish on unresolved risk in release-critical paths.
- **Evidence over assumption:** record proof for each release gate.
- **Human-governed changes:** use explicit review for risky migrations or policy shifts.
- **Continuous improvement:** convert release pain into tracked follow-up work.

## Release readiness gates

All gates must pass before publish (see `docs/maintainers/release-gate-matrix.md` for the full gate inventory, owners, and CI mapping):

1. Scope is clear and tracked in canonical task-engine state (`.workspace-kit/tasks/state.json`) with linked roadmap/decision context where needed.
2. Behavior changes are documented in `docs/maintainers/CHANGELOG.md`.
3. Build, typecheck, and tests pass for the release candidate (`pnpm run build && pnpm run check && pnpm run test`).
4. Consumer-impacting flows are validated against packaged artifacts (`pnpm run parity`).
5. Migration risk is reviewed for config/template/schema/state changes.
6. Security-sensitive changes (policy/approval/secrets/workspace mutation) are explicitly reviewed.

If a gate fails, do not publish. Capture the blocker in task-engine state and update task-engine state/context as needed for human review.

## Release procedure

1. **Define release scope**
   - Confirm included tasks and intended release outcome.
   - Classify risk (low/medium/high) and note rollout caveats.
2. **Prepare release artifacts**
   - Update canonical changelog `docs/maintainers/CHANGELOG.md` with user-visible impact (`CHANGELOG.md` at repo root is pointer-only).
   - Bump version in `package.json` to match release target.
   - Ensure version and tag strategy align with project policy.
3. **Run validation**
   - Execute `pnpm run build`, `pnpm run check`, `pnpm run test`.
   - Execute `pnpm run parity` for packaged-artifact parity validation.
   - Execute `pnpm run check-release-metadata` for package.json field validation.
  - Optional: `pnpm run pre-release-transcript-hook` for a non-blocking transcript sync/ingest summary artifact (requires build). With **`WORKSPACE_KIT_POLICY_APPROVAL`** set to JSON like `{"confirmed":true,"rationale":"pre-release ingest"}`, the hook merges it into **`ingest-transcripts`** args as **`policyApproval`** (the `run` path does not read the env var directly; see **`POLICY-APPROVAL.md`**).
  - Execute **`pnpm run maintainer-gates`** (compatibility + planning + release-channel) and **`pnpm run pre-merge-gates`** (maintainer gates + **`pnpm run test`**). Legacy aliases **`pnpm run phase4-gates`** and **`pnpm run phase5-gates`** call the same commands.
   - Confirm release automation workflows are green.
  - Run a doc consistency sweep before approval:
    - Verify canonical-source links in `README.md`, `docs/maintainers/ROADMAP.md`, and `docs/maintainers/AGENTS.md` resolve.
    - Run `pnpm run check-planning-consistency` and treat failures as release-blocking doc defects.
    - Confirm policy/approval references point to `docs/maintainers/POLICY-APPROVAL.md` and `docs/maintainers/AGENT-CLI-MAP.md`.
    - Confirm changelog updates are in `docs/maintainers/CHANGELOG.md` (root `CHANGELOG.md` is pointer-only).
4. **Present for approval**
   - Summarize scope, risk, evidence, and migration notes.
   - Obtain explicit human approval before proceeding.
5. **Publish**
   - Run publish automation (triggers `publish-npm.yml` workflow).
   - Record release tag, workflow run URL, and npm reference.
6. **Verify consumer installability**
   - Confirm package availability on npm.
   - Smoke-check install/update flow in a downstream consumer context.

## Required release evidence

Capture and retain:

- Release version and tag
- Links to CI/publish workflow runs
- Validation command results (or artifact references, including `artifacts/parity-evidence.json`)
- npm package reference
- Migration notes (if any)
- Known risks, caveats, and follow-up tasks

Evidence should be sufficient for another maintainer to reconstruct release confidence without re-running the entire release process.

## Post-release workflow

After publish:

1. Monitor for regressions in consumer and core workflows.
2. Triage issues and severity quickly; patch if needed.
3. Capture recurring friction themes from release execution.
4. Convert recurring friction into:
   - task-engine and roadmap updates (`.workspace-kit/tasks/state.json`, `docs/maintainers/ROADMAP.md`)
   - workflow/rule hardening proposals
   - enhancement recommendations for approval review

This closes the loop with the Enhancement Engine direction: release outcomes should continuously improve future release quality.

## Changing `.ai/PRINCIPLES.md` (R00x machine rules)

- **Edit** `.ai/PRINCIPLES.md` directly (pipe-delimited machine dialect). After changing **`rule|id=R###`** rows, update **`scripts/fixtures/principles-rule-ids.json`** in the same PR so **`pnpm run check`** stays green.
- **Human governance order** is snapshotted from **`docs/maintainers/AGENTS.md`** § Source-of-truth; reordering those bullets requires updating **`scripts/fixtures/governance-doc-order.json`**.
- For trade-off philosophy, cross-check **`.ai/PRINCIPLES.md`** against **`docs/maintainers/ROADMAP.md`** / **`docs/maintainers/DECISIONS.md`** as needed.

## Related documents

- `README.md` — project intent and phase context
- `.ai/PRINCIPLES.md` — decision priorities and governance posture
- `docs/maintainers/ROADMAP.md` — strategic direction and major decisions
- `.workspace-kit/tasks/state.json` — canonical execution and follow-up tracking
- `docs/maintainers/SECURITY.md` — vulnerability handling expectations
- `docs/maintainers/release-gate-matrix.md` — full gate inventory and CI mapping
- `docs/maintainers/runbooks/parity-validation-flow.md` — parity command chain and evidence contract
- `docs/maintainers/data/compatibility-matrix.json` — canonical compatibility + release-channel mapping source
- `schemas/compatibility-matrix.schema.json` — compatibility matrix schema contract
