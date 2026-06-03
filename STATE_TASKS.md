# State Refresh Optimization Tasks

**Status:** Proposed implementation plan  
**Scope:** VS Code/Cursor extension refresh loop, task-state sync, dashboard polling, and generated Cursor behavior-rule sync.  
**Goal:** Reduce unnecessary `wk run` executions, file-system churn, dashboard refresh noise, and task-engine pressure without sacrificing correctness, policy safety, or dashboard freshness.

## Problem summary

A VS Code Workflow Cannon output trace showed a repeated loop while dashboard refresh was paused:

- `dashboard-summary` was attempted repeatedly.
- Most attempts failed with `extension-refresh-paused`.
- `sync-effective-behavior-cursor-rule` ran repeatedly after refresh failures.
- Task-state sync appeared mostly normal: `task-state-status` followed by `apply-task-state-events`, usually with `syncState=current` and no action.
- Git-triggered sync appeared limited to HEAD-change events and did not look like the main source of churn.

## Working diagnosis

The dominant inefficiency appears to be a feedback loop:

1. Kit state changes trigger extension refresh behavior.
2. The extension schedules `sync-effective-behavior-cursor-rule` from generic state changes.
3. That command writes `.cursor/rules/workflow-cannon-effective-agent-behavior.mdc` even when content is unchanged.
4. The file write creates more editor/file-system churn.
5. Dashboard refresh attempts continue while refresh is paused.
6. The output fills with `dashboard-summary` pause failures and behavior-rule sync commands.

## Desired final state

- Behavior-rule sync is idempotent and writes only when content changes.
- Behavior-rule sync is triggered only by relevant config/profile changes or explicit requests.
- Dashboard refresh does not spawn `dashboard-summary` while refresh is paused.
- CLI-mode dashboard polling is throttled enough to avoid child-process churn.
- Task-state sync avoids no-op apply work when status proves nothing needs applying.
- Git sync remains event-driven on HEAD changes and periodic at a configurable interval.
- Planning-interview-related dashboard slices are removed after interview sunset.
- The extension can emit lightweight telemetry proving command rates are sane.

---

## T-STATE-001 — Inventory refresh and sync command sources

**Goal:** Build an exact map of what can call `dashboard-summary`, `sync-effective-behavior-cursor-rule`, task-state sync commands, and git-triggered sync from the VS Code extension.

**Blocked by:** None.

**Blocks:** T-STATE-002, T-STATE-003, T-STATE-004, T-STATE-005, T-STATE-006, T-STATE-007, T-STATE-009.

**Owned paths:**

- `artifacts/state-refresh-command-inventory.md`
- `extensions/cursor-workflow-cannon/src/`
- `src/modules/agent-behavior/`

**Implementation steps:**

1. Search all extension and module code for `dashboard-summary`, `sync-effective-behavior-cursor-rule`, `task-state-status`, `apply-task-state-events`, `task-state-hydrate`, and `dashboard-service-start`.
2. Categorize each invocation as startup, poller, status bar, generic state-change handler, task-state sync, Git HEAD listener, drawer/mutation action, config watcher, or manual command.
3. Record expected frequency and lane type for each command source.
4. Identify which sources are expected, excessive, or unknown.
5. Do not change runtime behavior in this task.

**Acceptance criteria:**

- Inventory lists every extension-side source of the high-frequency commands.
- Each source has trigger reason, expected frequency, lane type, and suspected impact.
- No code behavior changes are included in this task.

---

## T-STATE-002 — Make behavior-rule sync idempotent

**Goal:** Stop rewriting the generated Cursor behavior rule when generated content has not changed.

**Blocked by:** T-STATE-001.

**Blocks:** T-STATE-003, T-STATE-010.

**Owned paths:**

- `src/modules/agent-behavior/sync-effective-behavior-cursor-rule.ts`
- `test/agent-behavior.test.mjs`

**Implementation steps:**

1. Before writing the generated rule file, read the existing file if present.
2. Compare full content or the embedded `wc:sync hash` value.
3. If unchanged, return success without writing.
4. Return a distinct success code such as `behavior-cursor-rule-unchanged`.
5. Keep current write behavior when the file is missing or content differs.
6. Preserve dry-run behavior.
7. Add tests for first write, unchanged second sync, changed content rewrite, and dry-run.

**Acceptance criteria:**

- Repeated sync with unchanged effective behavior does not modify file content or mtime.
- Command returns success with a distinct unchanged code when no write is needed.
- Changed effective behavior still updates the generated rule.
- Existing output shape remains compatible with callers.

---

## T-STATE-003 — Narrow behavior-rule sync triggers

**Goal:** Stop scheduling `sync-effective-behavior-cursor-rule` from generic kit-state changes.

**Blocked by:** T-STATE-001, T-STATE-002.

**Blocks:** T-STATE-010.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/extension.ts`
- `extensions/cursor-workflow-cannon/src/runtime/state-watcher.ts`
- `extensions/cursor-workflow-cannon/test/`

**Implementation steps:**

1. Remove behavior-rule sync from the generic `onKitStateChanged` handler.
2. Trigger behavior sync only from relevant changes: workspace config that affects agent guidance, agent behavior profile/config files, explicit manual sync, or missing generated rule on activation.
3. Preserve status bar refresh on general kit-state change.
4. Ensure task DB writes and dashboard refreshes do not trigger behavior-rule sync.
5. Add tests proving task-store changes do not schedule behavior-rule sync.

**Acceptance criteria:**

- Task store changes no longer schedule behavior-rule sync.
- Agent behavior/profile/config changes still schedule it.
- Missing generated rule on activation still gets created.
- Status bar refresh continues to work on task-state changes.

---

## T-STATE-004 — Add single-flight and cooldown for behavior-rule sync

**Goal:** Prevent behavior-rule sync stampedes when several relevant events happen close together.

**Blocked by:** T-STATE-001.

**Blocks:** T-STATE-010.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/extension.ts`
- `extensions/cursor-workflow-cannon/src/runtime/`
- `extensions/cursor-workflow-cannon/test/`

**Implementation steps:**

1. Add a small coordinator or local state for behavior sync.
2. Track in-flight sync promise, last successful sync time, and a default cooldown such as 60 seconds.
3. Coalesce callers when sync is already in flight.
4. Skip non-force requests inside cooldown.
5. Allow manual/force sync to bypass cooldown.
6. Keep normal logs quiet; log skips only in debug mode.

**Acceptance criteria:**

- Multiple rapid relevant events produce at most one sync command.
- Repeated non-force requests inside cooldown are skipped.
- Manual/force sync bypasses cooldown.
- Sync failure does not produce unhandled promise rejections.

---

## T-STATE-005 — Suppress dashboard refresh command execution while paused

**Goal:** Ensure `dashboard-summary` is not repeatedly sent through `CommandClient.run` while dashboard refresh pause is active.

**Blocked by:** T-STATE-001.

**Blocks:** T-STATE-010.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-pollers.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts`
- `extensions/cursor-workflow-cannon/src/runtime/command-client.ts`
- `extensions/cursor-workflow-cannon/test/dashboard-pollers.test.mjs`
- `extensions/cursor-workflow-cannon/test/dashboard-ui-interaction-locks.test.mjs`
- `extensions/cursor-workflow-cannon/test/command-client.test.mjs`

**Implementation steps:**

1. Add tests proving that while refresh is paused, poller interval ticks do not call `dashboard-summary`.
2. Check visible-section updates, mutation invalidation, and status bar update paths for bypasses.
3. Add or reuse a shared pause guard so all refresh paths behave consistently.
4. Preserve initial dashboard bootstrap behavior.
5. Preserve refresh after pause release.

**Acceptance criteria:**

- No repeated `dashboard-summary` command appears in logs while refresh pause is active after first paint.
- First dashboard paint still renders.
- Refresh resumes after pause is released.
- Dashboard does not remain stale after mutation completion.

---

## T-STATE-006 — Reduce CLI-mode dashboard polling frequency

**Goal:** Make CLI polling mode less expensive while preserving dashboard correctness.

**Blocked by:** T-STATE-001.

**Blocks:** T-STATE-010.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-slice-registry.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-pollers.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-read-path-coordinator.ts`
- `extensions/cursor-workflow-cannon/test/`

**Implementation steps:**

1. Decide whether poll intervals should be mode-aware.
2. Keep warm service mode fast if it is cheap.
3. Slow CLI polling mode to reduce child-process churn.
4. Rely on mutation invalidation for prompt updates after real changes.
5. Keep freshness/stale UI accurate.
6. Add tests asserting CLI poll intervals and no duplicate poller start.

**Acceptance criteria:**

- CLI polling mode starts fewer child processes per minute.
- Dashboard still refreshes promptly after mutations.
- Warm service mode is not degraded unless intentionally changed.
- Freshness/stale UI remains accurate.

---

## T-STATE-007 — Skip no-op task-state apply when no local events are pending

**Goal:** Avoid running `apply-task-state-events` when `task-state-status` proves sync is current and no local event application is needed.

**Blocked by:** T-STATE-001.

**Blocks:** T-STATE-010.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/runtime/task-state-sync-coordinator.ts`
- `src/modules/task-engine/`
- `src/contracts/`
- `test/`
- `extensions/cursor-workflow-cannon/test/`

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

**Blocked by:** `INTERVIEW_SUNSET.md` implementation tasks that remove the planning interview path.

**Blocks:** T-STATE-010.

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

## T-STATE-009 — Investigate and prefer warm dashboard service mode

**Goal:** Determine why the observed session used CLI polling and make warm service mode the normal path when available.

**Blocked by:** T-STATE-001.

**Blocks:** T-STATE-010.

**Owned paths:**

- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-read-path-coordinator.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/service-dashboard-data-source.ts`
- `src/modules/dashboard-service/`
- `extensions/cursor-workflow-cannon/test/`

**Implementation steps:**

1. Confirm configured dashboard data-source mode.
2. Confirm health probe behavior and failure details.
3. Make CLI fallback reason visible in the Workflow Cannon output.
4. Ensure dashboard badge/detail clearly shows active read path.
5. Ensure dashboard service startup is wired and reliable if expected.
6. Keep CLI polling as fallback.

**Acceptance criteria:**

- When service mode is available, dashboard uses warm service instead of CLI pollers.
- When service is unavailable, output explains why CLI polling is active.
- Only one read path runs at a time.
- CLI fallback remains functional.

---

## T-STATE-010 — Add command-rate telemetry and regression evidence

**Goal:** Make it easy to prove refresh/sync command rates are sane after fixes.

**Blocked by:** T-STATE-002, T-STATE-003, T-STATE-004, T-STATE-005, T-STATE-006, T-STATE-007, T-STATE-008, T-STATE-009.

**Blocks:** T-STATE-011.

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

**Blocks:** None.

**Owned paths:**

- `CHANGELOG.md`
- `docs/maintainers/CHANGELOG.md`
- `artifacts/state-refresh-optimization-closeout.md`
- `STATE_TASKS.md`

**Implementation steps:**

1. Add changelog entry summarizing the fixed refresh/sync behavior.
2. Add closeout evidence with commands run, tests passed, before/after command rates, and follow-ups.
3. Update this file with final status if tasks are completed.
4. Confirm no new broad polling paths were added.

**Acceptance criteria:**

- Changelog documents user-visible and maintainer-visible behavior changes.
- Closeout evidence exists.
- Relevant tests pass.
- `STATE_TASKS.md` accurately reflects completed and remaining work.

---

## Dependency map

```text
T-STATE-001
  ├─→ T-STATE-002 → T-STATE-003 → T-STATE-010
  ├─→ T-STATE-004 → T-STATE-010
  ├─→ T-STATE-005 → T-STATE-010
  ├─→ T-STATE-006 → T-STATE-010
  ├─→ T-STATE-007 → T-STATE-010
  └─→ T-STATE-009 → T-STATE-010

INTERVIEW_SUNSET removal
  └─→ T-STATE-008 → T-STATE-010

T-STATE-010 → T-STATE-011
```

## Parallelization plan

After T-STATE-001, these can run mostly in parallel:

- T-STATE-002 — idempotent behavior sync
- T-STATE-005 — pause suppression tests/fix
- T-STATE-006 — CLI poll interval tuning
- T-STATE-007 — task-state no-op apply optimization
- T-STATE-009 — warm service investigation

T-STATE-003 should wait for T-STATE-002 so narrowed triggers do not leave the generated rule stale.

T-STATE-008 should wait for the interview sunset implementation to avoid mixing two product changes in one task.

T-STATE-010 should wait until implementation tasks land so it can produce meaningful before/after evidence.

## Priority order

```text
P0: T-STATE-002 — Make behavior sync idempotent.
P0: T-STATE-003 — Stop behavior sync from generic kit-state changes.
P0: T-STATE-005 — Suppress dashboard-summary while refresh is paused.
P1: T-STATE-004 — Single-flight/cooldown for behavior sync.
P1: T-STATE-006 — Reduce CLI polling frequency.
P1: T-STATE-009 — Prefer warm service path / improve fallback diagnostics.
P2: T-STATE-007 — Skip no-op task-state apply.
P2: T-STATE-008 — Remove planningSession slice after interview sunset.
P2: T-STATE-010 — Command-rate telemetry and evidence.
P3: T-STATE-011 — Closeout and changelog.
```

## Design constraints

- Do not reduce correctness of task-state sync.
- Do not disable Git HEAD sync by default.
- Do not bypass JSON policy approval for gated `wk run` commands.
- Do not remove CLI polling fallback.
- Do not make dashboard freshness depend on full page reloads.
- Do not write generated `.cursor/rules/**` files unless content changed.
- Do not let dashboard refresh reads queue behind or trigger mutation-lane churn.

## Success metric

A healthy idle extension session should show behavior closer to:

- `dashboard-summary`: low steady rate, no repeated `extension-refresh-paused` loop.
- `sync-effective-behavior-cursor-rule`: zero during normal task/dashboard changes; runs only on relevant behavior/config changes.
- `task-state-status`: interval plus HEAD-change only.
- `apply-task-state-events`: only when pending local events or status requires apply.

The strongest pass condition is that opening a drawer or mutating action no longer causes a long alternating stream of `dashboard-summary FAIL extension-refresh-paused` and `sync-effective-behavior-cursor-rule ok`.
