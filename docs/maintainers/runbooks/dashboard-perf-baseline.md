<!-- GENERATED FROM .ai/runbooks/dashboard-perf-baseline.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Dashboard performance baseline (pre-fix)

**Branch:** `dashboard-fixes` (cut from `main` @ `40c9e79a`).
**Captured:** 2026-07-01, against this repo's real `.workspace-kit` task/planning SQLite data (not a synthetic fixture) — `pnpm install && pnpm run build` on `main` first.

## Method

A benchmark subagent was dispatched first; it detoured into running the full
`extensions/cursor-workflow-cannon` test suite (`pnpm --filter cursor-workflow-cannon run test`)
as a pre-flight sanity check instead of the targeted bench scripts, and stalled for 10+
minutes on `test/integration-client.test.mjs`, which repeatedly cold-spawns the real CLI
per assertion — itself incidental evidence of the CLI cold-start cost this effort is trying
to fix. Per operator direction, that run was killed and the two purpose-built bench scripts
were run directly against the repo instead.

```bash
node scripts/bench-dashboard-refresh.mjs
node scripts/bench-dashboard-service.mjs
```

## `scripts/bench-dashboard-refresh.mjs` (CLI `dashboard-summary` read paths, real data)

| Path | ms |
| --- | --- |
| `dashboard-summary` `projection=overview` (first hydration) | **485** |
| `dashboard-summary` `projection=queue` (task-engine slice) | **490** |
| `dashboard-summary` `projection=full` (manual refresh path) | **3057** |
| secondary block: `list-phase-notes` + `get-phase-context` + `cae-authoring-summary` (parallel) | **530** |
| **TOTAL** (sequential overview + queue + full + secondary) | **4564** |

Matches the ~3s `full` baseline previously documented in
`.ai/plans/dashboard-option-1-state-store-and-pollers.md`. Note this is a **single cold
CLI spawn per call** — it does not yet capture the compounding cost of the extension's
critical poll tier firing 3–4 of these every 2 seconds (see analysis below), nor the
double store-open per call, both fixed on `option-a`.

## `scripts/bench-dashboard-service.mjs` (Option 2 service, synthetic empty workspace)

| Path | ms | Limit |
| --- | --- | --- |
| cold: start + refresh overview + snapshot | **62** | 5000 |
| warm: snapshot re-fetch | **2** | 1000 |

Both gates pass comfortably — but this benchmark seeds an **empty** SQLite store, so it
does not exercise the real task/planning data volume this repo has, and it does not
exercise the slice-refresher → `router.execute` fallthrough that reopens stores per
refresh (see `option-b` work).

## What these numbers do **not** yet show (tracked qualitatively, see recommendations)

- Redundant `overview` projection builds (3x every 2s from the critical poll tier hitting
  `dashboard-summary` with `projection=overview` for `overview`, `phase`, and `agent`
  slices independently).
- `planArtifact` critical slice polling `projection=status` (full doctor/CAE/git-drift
  scan) every 2 seconds.
- The double SQLite store-open per CLI call (`task-engine-internal.ts` full open +
  slice-scoped open in `queue-dashboard-readout-commands.ts`).
- `run-daemon` re-resolving the module registry/router on every request despite the
  warm process.
- Webview-side double full-document `webview.html` load on startup and full-root
  re-render for single-section patches.

Re-run both scripts on `option-a` and `option-b` (and after the final merge into
`dashboard-fixes`) for before/after comparison.

## option-a-backend1 fix results (2026-07-01)

**Double store-open fix (Background finding 1):** Introduced `resolveQueueDashboardReadoutCommandsNoPriorOpen` in `queue-dashboard-readout-commands.ts`. Called from `task-engine-internal.ts` `onCommand` AFTER `routeTaskEngineBeforeOpenPlanningStores` and BEFORE `openPlanningStores(ctx)`. All dashboard commands (`dashboard-summary`, `dashboard-*-slice`, `dashboard-terminal-tasks`, `dashboard-terminal-tasks-page`, `dashboard-bootstrap-slices`, `dashboard-ops-slice`) are intercepted and handled with a single slice-scoped read-only store open. `dashboard-terminal-rows` is the only dashboard command that still goes through the full store open path (it is not on the high-frequency poll tier and uses the pre-opened store). This eliminates one full SQLite hydration per dashboard CLI call.

**New `dashboard-ops-slice` command (Background finding 2):** Implemented in `buildDashboardOpsSlice` (`focused-slice-builders.ts`) and wired as `dashboard-ops-slice` (`read_hot`). Returns `planArtifact`, `workspaceStatus`, `teamExecution`, `subagentRegistry`, `taskCheckpoints` — the five fields that the `planArtifact`/`team`/`subagents`/`checkpoints` extension slices needed from `projection=status`. Does NOT call `buildDashboardSystemStatus`, `runPhaseStatus`, `collectDoctorContractIssues`, or `collectCaeDoctorSummaryLines`. Measured timing (worktree, empty task store): `dashboard-summary projection=status` ≈ 41–416 ms, `dashboard-ops-slice` ≈ 1–2 ms — approximately 200x faster. The bench script (`scripts/bench-dashboard-refresh.mjs`) shows the `projection=full` path at ~2915 ms and the `overview`/`queue` paths at ~445 ms; `dashboard-ops-slice` is not yet in the bench script rotation (the frontend workstream will wire the extension slices).
## 2026-07-01 option-a-frontend post-change note

Branch/worktree: `option-a-frontend-wt` in `/home/ubuntu/wc-worktrees/option-a-frontend`.

### `scripts/bench-dashboard-refresh.mjs` after frontend polling/webview changes

```text
467 ms  dashboard-summary projection=overview
608 ms  dashboard-summary projection=queue
3045 ms dashboard-summary projection=full
599 ms  secondary block: list-phase-notes + get-phase-context + cae-authoring-summary
4721 ms TOTAL
```

These numbers are **not** a direct measurement of the main Task 1 win because the
bench script still times `dashboard-summary` projections, while the frontend pollers now
call dedicated slice commands (`dashboard-overview-slice`, `dashboard-queue-slice`,
`dashboard-status-slice`, `dashboard-agent-activity-slice`). The shell quoting issue that
initially blocked the bench was in the ad-hoc shell invocation, not in the script itself.

### One-off command timing spot-checks (same workspace state, single run each)

```text
dashboard-summary overview        532 ms
dashboard-overview-slice         424 ms
dashboard-summary queue          471 ms
dashboard-queue-slice            448 ms
dashboard-summary status        3004 ms
dashboard-status-slice          2959 ms
dashboard-summary agentActivity  454 ms
dashboard-agent-activity-slice   435 ms
```

Interpretation:

- Overview/queue/agent-activity slices are modestly cheaper than the corresponding
  `dashboard-summary` projections in this workspace state.
- Status remains the heavy read path; the frontend still benefits by polling the
  dedicated `read_hot` command instead of paying mutation-class orchestration overhead.
- The larger user-visible win in this change set is on the extension side:
  avoiding mutation-class command execution for pollers, eliminating the second full
  webview document load at startup, and avoiding whole-root HTML renders for section-only
  patches.

## option-a integration fix (orchestrator, 2026-07-01)

The frontend track routed `team`/`subagents`/`checkpoints` to `dashboard-status-slice`
(still computationally heavy — same doctor/CAE/git-drift scan as `projection:"status"`,
just without the mutation-class CLI overhead) because backend1's `dashboard-ops-slice`
command didn't exist yet in its worktree. After merging all three option-a tracks,
`planArtifact` (critical/2s tier), `team`, `subagents`, and `checkpoints` (ops/10s tier)
were rewired to `dashboard-ops-slice`. End-to-end CLI process timing, full cold spawn,
against this repo's real data:

| Path | ms |
| --- | --- |
| `dashboard-summary projection=status` (old path for these 4 slices) | **2937** |
| `dashboard-ops-slice` (new path) | **367** |

**~8x faster**, on the single highest-frequency (2s) poll tier slice. `dashboard-status-slice`
now serves only the `status` tab slice itself (30s tier, genuinely needs full detail).

## Final merge results (dashboard-fixes, both options merged, 2026-07-01)

Both `option-a` and `option-b` merged cleanly into `dashboard-fixes` with two real
conflicts (both resolved by keeping the more complete/correct side after empirical
verification, not by guessing): `slice-refreshers.ts` (kept option-b's comprehensive
`def.name`-keyed direct-builder dispatch covering all 15 service slices over
option-a-backend2's narrower 6-slice version) and `dashboard-pollers.test.mjs`
(verified actual single-flight coalescing behavior against the real merged
implementation rather than trusting either side's test assertion blindly). Three
more pre-existing/merge-surfaced stale assertions were fixed: a `buildDashboardOverview(`
regex broken by a prior rename (pre-existing on `main`, coincidentally fixed by the
frontend track, reapplied on `option-b` directly), a `source: "poller refresh"` regex
broken by option-b's cadence-mode refactor, and a hardcoded full-command-list
snapshot test missing the new `dashboard-ops-slice` command.

**Post-merge re-benchmark** (`node scripts/bench-dashboard-refresh.mjs`):

| Path | Before | After |
| --- | --- | --- |
| `projection=overview` | 485 ms | 446 ms |
| `projection=queue` | 490 ms | 449 ms |
| `projection=full` | 3057 ms | 2983 ms |
| secondary block | 530 ms | 512 ms |

(Small deltas here are expected — this bench only exercises the legacy
`dashboard-summary` CLI path, which most pollers no longer use after Option A's
slice-registry swap; the real win is off this chart, see below.)

**Real-workspace Option B benchmark** (`node scripts/bench-dashboard-service-real.mjs`,
new script, against this repo's actual `.workspace-kit` data — not a synthetic
empty fixture):

| Metric | ms |
| --- | --- |
| Service startup | 917 |
| Cold first refresh (overview) | 2294 |
| Warm 2nd refresh (queue, different slice) | **16** |
| Warm 3rd refresh (status, different slice) | 2617 |
| Warm snapshot memory serve | 2 |
| Store open count across all 3 refreshes | **1** (was N — one per refresh — before the fix) |

**Critical-tier ops slice, full cold CLI spawn** (`dashboard-summary projection=status`
vs `dashboard-ops-slice`, real data): **2937 ms → 367 ms (~8x)**.

Net picture: the CLI-polling path (Option A) now avoids mutation-class overhead, the
double store-open, and the heaviest projection on the highest-frequency tier. The
warm-service path (Option B) now proves out the "genuinely warm" architecture end to
end — one store open serving arbitrarily many slice refreshes — which is the
prerequisite for the push-driven, poll-elimination direction to actually pay off
rather than just moving the same redundant work onto a different timer.
