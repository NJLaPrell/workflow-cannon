# Phase 139 — baseline health report

**Task:** T100743  
**Branch:** `feature/T100743-run-baseline-health-checks-and-identify-planner-`  
**Base:** `release/phase-139`  
**Captured:** 2026-06-30 (worker: `worker-t100743`)  
**Prior capture:** 2026-06-28 (commit `de770f0b`; refreshed after phase closeout merge `a458db2f`)

## Summary

| Command | Exit code | Result |
| --- | ---: | --- |
| `node dist/cli.js doctor` | 0 | **Pass** — all contract checks green |
| `pnpm run build` | 0 | **Pass** (`tsc -p tsconfig.json`) |
| `pnpm run test` | 123 | **1 failure** — 1722 tests, 1721 pass (~167s) |

## `node dist/cli.js doctor`

Doctor passed with no validation failures. Notable informational items only:

- `docs/maintainers/data/workspace-kit-status.db-export.yaml` may be stale vs planning SQLite (regenerate via `export-workspace-status` when needed).
- Planning generation policy: `require` (pass `expectedPlanningGeneration` on mutating commands).
- Active canonical backend: `git-event-log`.

**Delta from 2026-06-28 capture:** prior run reported task-state projection/shadow admission issues (`T100517`), snapshot tail size, and phase-139 sqlite-only vs git canonical drift. Those findings are absent in this refresh; closeout and subsequent task-store activity likely remediated local drift.

## `pnpm run build`

Clean TypeScript compile; no errors or warnings reported.

## `pnpm run test`

```
# tests 1722
# suites 67
# pass 1721
# fail 1
# duration_ms ~166862
```

### Failure detail

| File | Error |
| --- | --- |
| `test/bench/dashboard-perf.test.mjs` | Spawns `node scripts/benchmark-dashboard.ts` → `ERR_UNKNOWN_FILE_EXTENSION` (`.ts` not loadable without ts runner) |

All planner/plan-artifact integration tests in the enumerated surface passed in this run. The sole failure is the dashboard perf bench harness, not planner command logic.

---

## Planner / PlanArtifact test surface

Strategy reference: [`PLANNER_TEST_STRATEGY.md`](../../../PLANNER_TEST_STRATEGY.md) (repo root).

### Unit tests (`test/plan-artifact-*.test.mjs`)

| File | Layer |
| --- | --- |
| `test/plan-artifact-schema.test.mjs` | Unit — JSON Schema validation |
| `test/plan-artifact-storage.test.mjs` | Unit — plan file round-trip |
| `test/plan-artifact-markdown.test.mjs` | Unit — markdown render |
| `test/plan-artifact-wbs-normalizer.test.mjs` | Unit — WBS → task draft shape |
| `test/plan-artifact-draft-validation.test.mjs` | Unit — draft validator |
| `test/plan-artifact-accept-guardrails.test.mjs` | Unit — accept guards |

### Integration / CLI handler tests (`test/`)

| File | Layer |
| --- | --- |
| `test/plan-artifact-draft.test.mjs` | Integration — `draft-plan-artifact` |
| `test/plan-artifact-review.test.mjs` | Integration — `review-plan-artifact` |
| `test/plan-artifact-review-fixtures.integration.test.mjs` | Integration — fixture-driven review |
| `test/plan-artifact-accept.test.mjs` | Integration — `accept-plan-artifact` |
| `test/plan-artifact-execute.test.mjs` | Integration — execute guard |
| `test/plan-artifact-e2e-cli.test.mjs` | E2E CLI — golden + blocked paths |
| `test/review-plan-artifact-engine.test.mjs` | Integration — review engine |
| `test/review-plan-artifact-coverage.test.mjs` | Integration — rubric coverage map |
| `test/review-plan-artifact-sizing.test.mjs` | Integration — WBS sizing rules |
| `test/review-plan-artifact-instruction.test.mjs` | Integration — instruction contract |
| `test/accept-plan-artifact-instruction.test.mjs` | Integration — instruction contract |
| `test/finalize-plan-to-phase-preview.test.mjs` | Integration — finalize dry-run |
| `test/finalize-plan-to-phase-instruction.test.mjs` | Integration — finalize instruction |
| `test/resolve-plan-artifact-phase-proposal.test.mjs` | Integration — phase proposal |

### Planning module tests (`test/planning-*.test.mjs`)

| File | Layer |
| --- | --- |
| `test/planning-module.test.mjs` | Integration — planning module commands |
| `test/planning-session-sqlite.test.mjs` | Integration — session SQLite patterns |
| `test/planning-session-cae-scope.test.mjs` | Integration — CAE scope |
| `test/planning-event-admission.test.mjs` | Integration — event admission |
| `test/planning-sqlite-doctor-remediation.test.mjs` | Integration — doctor remediation |
| `test/planning-git-sync-phase120-integration.test.mjs` | Integration — git sync |

### Ideas / planner-adjacent (`test/`)

| File | Notes |
| --- | --- |
| `test/ideas-module.test.mjs` | Ideas capture; references planner flows |
| `test/idea-schema.test.mjs` | Idea schema validation |

### Extension — planner dashboard tests (`extensions/cursor-workflow-cannon/test/`)

| File | Layer |
| --- | --- |
| `extensions/cursor-workflow-cannon/test/dashboard-plan-artifact-happy-path.test.mjs` | Extension — plan panel happy path |
| `extensions/cursor-workflow-cannon/test/dashboard-plan-artifact-accept.test.mjs` | Extension — accept action + policy |
| `extensions/cursor-workflow-cannon/test/playbook-chat-prompts.test.mjs` | Extension — planner chat prompts |

### Extension — general dashboard tests (59 files under `test/dashboard-*.test.mjs` and `extensions/cursor-workflow-cannon/test/dashboard-*.test.mjs`)

Key clusters:

- **Service / data layer:** `test/dashboard-service-*.test.mjs`, `test/dashboard-data-source-config.test.mjs`, `test/dashboard-snapshot-store.test.mjs`
- **Phase / queue projection:** `test/dashboard-phase-buckets.test.mjs`, `test/dashboard-task-state-projection-summary.test.mjs`, `test/build-dashboard-*.test.mjs`
- **Extension UI / coordinator:** `extensions/cursor-workflow-cannon/test/dashboard-coordinator*.test.mjs`, `dashboard-queue-*.test.mjs`, `dashboard-lazy-*.test.mjs`, `render-dashboard.test.mjs`
- **Perf / bench:** `test/bench/dashboard-perf.test.mjs` (currently failing — see above), `extensions/cursor-workflow-cannon/test/dashboard-queue-perf-contract.test.mjs`

See `PLANNER_TEST_STRATEGY.md` §7 for planned extension patterns (`render-dashboard-plan-artifact.test.mjs` listed as future; not yet present).

---

## Blockers for downstream work

| Blocker | Severity | Owner action |
| --- | --- | --- |
| `test/bench/dashboard-perf.test.mjs` bench harness cannot run `.ts` directly | Low | Fix bench runner or exclude from default `pnpm run test` if intentional |
| Stale workspace-kit-status YAML export | Info | `export-workspace-status` when maintainer snapshot needed |

None of the above blocks T100743 acceptance (baseline recorded; planner test surface enumerated with paths).
