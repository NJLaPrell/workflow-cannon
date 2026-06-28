# Phase 139 — baseline health report

**Task:** T100743  
**Branch:** `feature/T100743-run-baseline-health-checks-and-identify-planner-`  
**Base:** `release/phase-139`  
**Captured:** 2026-06-28 (worker: `worker-t100743`)

## Summary

| Command | Exit code | Result |
| --- | ---: | --- |
| `pnpm exec wk doctor` | 0 | **Failed validation** (see findings below) |
| `pnpm run build` | 0 | **Pass** (`tsc -p tsconfig.json`) |
| `pnpm run test` | 0 | **Pass** — 1719 tests, 0 failures (~497s) |

## `pnpm exec wk doctor` findings

Doctor printed validation failures (process still exited 0):

1. **`.workspace-kit/tasks/workspace-kit.db`** — `task-state-projection-event-log-admission-failed`: `task.transitioned` references unknown task `T100517`. Remediation: `pnpm exec wk run rebuild-task-state-cache` with policy approval.
2. **`.workspace-kit/tasks/task-state-events.jsonl`** — `shadow-admission-failed`: same unknown task `T100517` in shadow log.
3. **`workflow-cannon/task-state`** — `task-state-snapshot-tail-large`: snapshot tail is 129 events (throughSequence=1956, head=2085); cut a fresh snapshot before hydrate-heavy operations.
4. **`workflow-cannon/task-state`** — `phase-projection-local-exceeds-remote`: SQLite phase 139 has 35 sqlite-only delivery tasks not present on git canonical replay (includes `T100738`–`T100744`, etc.). Publish `task.created` events via git-canonical paths before closeout.

**Impact for Phase 139:** Local task-store drift is pre-existing; does not block build/test green. Closeout should address canonical publish and snapshot tail before hydrate-heavy ops.

## `pnpm run build`

Clean TypeScript compile; no errors or warnings reported.

## `pnpm run test`

```
# tests 1719
# suites 67
# pass 1719
# fail 0
# duration_ms ~496993
```

No failing tests at baseline. No planner-specific regressions observed in this run.

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

### Extension — general dashboard tests (68 files)

Full dashboard test surface spans `test/dashboard-*.test.mjs` (repo root) and `extensions/cursor-workflow-cannon/test/dashboard-*.test.mjs` (extension package). Key clusters:

- **Service / data layer:** `test/dashboard-service-*.test.mjs`, `test/dashboard-data-source-config.test.mjs`, `test/dashboard-snapshot-store.test.mjs`
- **Phase / queue projection:** `test/dashboard-phase-buckets.test.mjs`, `test/dashboard-task-state-projection-summary.test.mjs`, `test/build-dashboard-*.test.mjs`
- **Extension UI / coordinator:** `extensions/cursor-workflow-cannon/test/dashboard-coordinator*.test.mjs`, `dashboard-queue-*.test.mjs`, `dashboard-lazy-*.test.mjs`, `render-dashboard.test.mjs`
- **Perf / bench:** `test/bench/dashboard-perf.test.mjs`, `extensions/cursor-workflow-cannon/test/dashboard-queue-perf-contract.test.mjs`

See `PLANNER_TEST_STRATEGY.md` §7 for planned extension patterns (`render-dashboard-plan-artifact.test.mjs` listed as future; not yet present).

---

## Blockers for downstream work

| Blocker | Severity | Owner action |
| --- | --- | --- |
| Task-state event log references unknown `T100517` | Medium | `rebuild-task-state-cache` when operator approves |
| Phase 139 sqlite-only tasks vs git canonical | Medium | Publish `task.created` events before phase closeout |
| Snapshot tail large (129 events) | Low | `task-state-snapshot` before hydrate-heavy ops |

None of the above blocked T100743 deliverable (build + test green; findings recorded).
