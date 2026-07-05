# State Refresh Optimization — Remaining Work

**Original scope:** VS Code/Cursor extension refresh loop, task-state sync, dashboard polling, and generated Cursor behavior-rule sync optimization.

**Status:** Most P0/P1 items are done. Remaining items below.

**Done (not listed here):**
- T-STATE-001: Command source inventory
- T-STATE-002: Idempotent behavior-rule sync (content hash via `wc:sync hash`)
- T-STATE-003: Narrowed behavior-rule sync triggers (config mtime guard only)
- T-STATE-004: Single-flight / debounce for behavior-rule sync (1500ms debounce + in-flight guard)
- T-STATE-005: Dashboard refresh pause suppression (refreshPaused owners tracking)
- T-STATE-006: CLI-mode polling reduced to final resort (service path is primary, CLI is fallback only)
- T-STATE-009: Warm service path is default; CLI fallback diagnostics present

---

## T-STATE-007 — Skip no-op task-state apply when no local events are pending

**Goal:** Avoid running `apply-task-state-events` when `task-state-status` proves sync is current and no local event application is needed.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/runtime/task-state-sync-coordinator.ts`
- `src/modules/task-engine/`
- `src/contracts/`
- `test/`
- `extensions/cursor-workflow-cannon/test/`

**Current state:** `task-state-sync-coordinator.ts` runs `apply-task-state-events` unconditionally for any syncState that is not `"behind"` or `"missing"` (including `"current"`). There is no check for pending local events.

**Implementation steps:**

1. Inspect `task-state-status` output shape.
2. If needed, extend the command output with a bounded pending-local-events indicator.
3. Skip `apply-task-state-events` only when status explicitly proves there is nothing to apply.
4. Keep current behavior when the new field is absent.
5. Add tests for current/no-pending, current/pending, behind, missing, and conflict.

**Acceptance criteria:**

- Current/no-pending status does not run apply.
- Current/with-pending still runs apply.
- Behind, missing, and conflict behavior is unchanged.
- Extension remains backward-compatible if the new field is absent.

---

## T-STATE-008 — Remove `planningSession` dashboard polling after interview sunset

**Goal:** Eliminate legacy planning-interview dashboard slice work after the `build-plan` sunset lands.

**Blocked by:** `INTERVIEW_SUNSET.md` tasks (build-plan still exists in source).

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-slice-registry.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-snapshot-types.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts`
- `src/contracts/dashboard-summary-run.ts`
- `test/`
- `extensions/cursor-workflow-cannon/test/`

**Implementation steps:**

1. Remove the `planningSession` dashboard slice from the registry.
2. Remove `planningSession` from dashboard snapshot/store types.
3. Remove render paths for legacy planning interview state.
4. Remove queue projection payload fields used only by the interview.
5. Preserve PlanArtifact dashboard state.
6. Update tests to assert no planning interview slice is polled.

**Acceptance criteria:**

- No dashboard slice polls `planningSession`.
- No dashboard-summary payload includes legacy `planningSession`.
- Planning UI is PlanArtifact-oriented.
- PlanArtifact lifecycle dashboard controls still work.

---

## T-STATE-010 — Add command-rate telemetry and regression evidence

**Goal:** Make it easy to prove refresh/sync command rates are sane after fixes.

**Blocked by:** T-STATE-007, T-STATE-008.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/runtime/workflow-cannon-log.ts`
- `extensions/cursor-workflow-cannon/src/runtime/command-client.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/`
- `extensions/cursor-workflow-cannon/test/`
- `artifacts/state-refresh-optimization-evidence.md`

**Implementation steps:**

1. Add optional command-rate counters in debug/trace mode.
2. Track command count, failure count by code, refresh-paused count, and average duration.
3. Keep normal output concise.
4. Add a test harness or manual evidence recipe for dashboard idle, drawer pause, task-state interval, Git HEAD change, and behavior config change.
5. Produce before/after evidence.

**Acceptance criteria:**

- Debug mode can show command-rate summaries without per-command spam.
- Evidence shows behavior-rule sync no longer loops.
- Evidence shows dashboard-summary is not repeatedly executed while paused.
- Task-state sync remains periodic and HEAD-triggered.

---

## T-STATE-011 — Closeout, changelog, and follow-up recommendations

**Goal:** Close the state-refresh optimization effort with clear release notes and remaining recommendations.

**Blocked by:** T-STATE-010.

**Owned paths:**

- `CHANGELOG.md`
- `docs/maintainers/CHANGELOG.md`
- `artifacts/state-refresh-optimization-closeout.md`

**Implementation steps:**

1. Add changelog entry summarizing the fixed refresh/sync behavior.
2. Add closeout evidence with commands run, tests passed, before/after command rates, and follow-ups.
3. Confirm no new broad polling paths were added.

**Acceptance criteria:**

- Changelog documents user-visible and maintainer-visible behavior changes.
- Closeout evidence exists.
- Relevant tests pass.
