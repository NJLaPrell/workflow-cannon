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
