# Releasing

Canonical release process for `@workflow-cannon/workspace-kit`.

This document defines how releases are planned, validated, published, and reviewed in Phase 0.

## Release intent

Every release must:

- ship predictable behavior from packaged artifacts
- preserve downstream consumer compatibility (or clearly communicate breakage)
- produce auditable evidence for what changed, why, and how it was validated
- feed observed friction back into improvement and rule/workflow hardening

## Release principles

- **Package-first truth:** validate what users install, not unpublished local state.
- **Safety before speed:** block publish on unresolved risk in release-critical paths.
- **Evidence over assumption:** record proof for each release gate.
- **Human-governed changes:** use explicit review for risky migrations or policy shifts.
- **Continuous improvement:** convert release pain into tracked follow-up work.

## Release readiness gates

All gates should pass before publish (see `docs/maintainers/release-gate-matrix.md` for the full gate inventory, owners, and CI mapping):

1. Scope is clear and tracked in `docs/maintainers/TASKS.md` with linked roadmap/decision context where needed.
2. Behavior changes are documented in `docs/maintainers/CHANGELOG.md`.
3. Build, typecheck, and tests pass for the release candidate.
4. Consumer-impacting flows are validated against packaged artifacts.
5. Migration risk is reviewed for config/template/schema/state changes.
6. Security-sensitive changes (policy/approval/secrets/workspace mutation) are explicitly reviewed.

If a gate fails, do not publish. Capture the blocker and route follow-up through `docs/maintainers/TASKS.md`.

## Release procedure

1. **Define release scope**
   - Confirm included tasks and intended release outcome.
   - Classify risk (low/medium/high) and note rollout caveats.
2. **Prepare release artifacts**
   - Update `docs/maintainers/CHANGELOG.md` with user-visible impact.
   - Ensure version and tag strategy align with project policy.
3. **Run validation**
   - Execute repository validation commands used by this project (`build`, `check`, `test`, dry-run pack, and parity checks as applicable).
   - Confirm release automation workflows are green.
4. **Publish**
   - Run publish automation for npm release.
   - Record release tag, workflow run, and npm reference.
5. **Verify consumer installability**
   - Confirm package availability on npm.
   - Smoke-check install/update flow in a downstream consumer context.

## Required release evidence

Capture and retain:

- release version and tag
- links to CI/publish workflow runs
- validation command results (or artifact references)
- npm package reference
- migration notes (if any)
- known risks, caveats, and follow-up tasks

Evidence should be sufficient for another maintainer to reconstruct release confidence without re-running the entire release process.

## Post-release workflow

After publish:

1. Monitor for regressions in consumer and core workflows.
2. Triage issues and severity quickly; patch if needed.
3. Capture recurring friction themes from release execution.
4. Convert recurring friction into:
   - task and roadmap updates (`docs/maintainers/TASKS.md`, `docs/maintainers/ROADMAP.md`)
   - workflow/rule hardening proposals
   - enhancement recommendations for approval review

This closes the loop with the Improvement/Enhancement direction: release outcomes should continuously improve future release quality.

## Related documents

- `README.md` for project intent and phase context
- `.ai/PRINCIPLES.md` for decision priorities and governance posture
- `docs/maintainers/ROADMAP.md` for strategic direction and major decisions
- `docs/maintainers/TASKS.md` for active execution and follow-up tracking
- `docs/maintainers/SECURITY.md` for vulnerability handling expectations
