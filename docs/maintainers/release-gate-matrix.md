# Release Gate Matrix

Normalized gate inventory for `@workflow-cannon/workspace-kit` releases.

Referenced by `docs/maintainers/RELEASING.md`. All gates must pass before publish; if any gate fails, block and route follow-up through task-engine state (`.workspace-kit/tasks/state.json`) with regenerated `docs/maintainers/TASKS.md` for human review.

## Gate Matrix

| # | Gate | Owner | Input artifacts | Fail action | CI step/job |
| --- | --- | --- | --- | --- | --- |
| G1 | Scope confirmation | Maintainer | canonical task-engine state (`.workspace-kit/tasks/state.json`), generated `docs/maintainers/TASKS.md` markers, `ROADMAP.md` phase alignment | Block publish; capture missing scope as new task | Manual pre-release review |
| G2 | Changelog completeness | Maintainer | `docs/maintainers/CHANGELOG.md` diff since last release | Block publish; require changelog entry before continue | Manual pre-release review |
| G3 | Build success | CI | `pnpm run build` exit 0 | Block publish; fix build errors | `ci.yml` → test job (build step) |
| G4 | Typecheck pass | CI | `pnpm run check` exit 0 | Block publish; fix type errors | `ci.yml` → test job (Typecheck step) |
| G5 | Test suite pass | CI | `pnpm run test` exit 0 | Block publish; fix failing tests | `ci.yml` → test job (Test step) |
| G6 | Dry-run pack success | CI | `pnpm run pack:dry-run` exit 0, artifact in `artifacts/` | Block publish; fix pack errors | `ci.yml` → release-readiness job |
| G7 | Release metadata validation | CI | `scripts/check-release-metadata.mjs` exit 0 | Block publish; fix metadata fields | `ci.yml` → release-readiness job |
| G8 | Parity validation pass | CI | Parity runner exit 0, evidence artifact generated | Block publish; fix parity regressions | `ci.yml` → parity job |
| G11 | Compatibility and channel gates pass | CI | `pnpm run phase4-gates` and `artifacts/compatibility-report.json` | Block publish; fix compatibility/channel/consistency failures | `ci.yml` → release-readiness job |
| G9 | Migration risk review | Maintainer | Config/template/schema/state diffs since last release | Block publish if breaking change lacks migration notes | Manual pre-release review |
| G10 | Security-sensitive review | Maintainer | Policy/approval/secrets/workspace-mutation diffs | Block publish; require explicit sign-off | Manual pre-release review |

## Ownership Summary

| Role | Gates owned | Escalation path |
| --- | --- | --- |
| CI automation | G3, G4, G5, G6, G7, G8, G11 | Failing CI gates produce actionable error output; maintainer investigates |
| Maintainer (release lead) | G1, G2, G9, G10 | Unresolved manual gates block release; capture blocker in canonical task-engine state and refresh generated `docs/maintainers/TASKS.md` |

## Escalation Path

1. CI gate failure → read diagnostic output → fix in code or config → re-run CI.
2. Manual gate failure → record blocker in task-engine state (`.workspace-kit/tasks/state.json`) and regenerate `docs/maintainers/TASKS.md` → resolve before reattempting release.
3. Ambiguous gate status → escalate to maintainer for explicit pass/fail decision and document rationale in `docs/maintainers/DECISIONS.md`.

## Mapping to CI Workflow Jobs

Current workflow: `.github/workflows/ci.yml`

| Job | Gates covered |
| --- | --- |
| `test` | G3 (build), G4 (typecheck), G5 (tests) |
| `release-readiness` | G6 (dry-run pack), G7 (metadata check), G11 (compatibility/channel/consistency gates) |
| `parity` | G8 (parity validation) |

Publish workflow: `.github/workflows/publish-npm.yml`

- Publish should only run after all CI gates pass.
- Manual gates (G1, G2, G9, G10) are verified by the maintainer before triggering `workflow_dispatch`.

## Related documents

- `docs/maintainers/RELEASING.md` — release procedure and evidence requirements
- `.workspace-kit/tasks/state.json` / generated `docs/maintainers/TASKS.md` — blocker tracking
- `docs/maintainers/DECISIONS.md` — ambiguous gate decisions
