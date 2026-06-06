# STORE_UPGRADE.md — Dashboard Store Upgrade Plan

**Status:** planner-ready implementation plan  
**Branch target:** `main`  
**Primary goal:** Make the warm dashboard service the primary dashboard read/store path and demote CLI polling to fallback/debug mode.  
**Secondary goal:** Remove hot UI dependency on monolithic `dashboard-summary` CLI reads by making dashboard slices service-backed, cached, visible-section driven, and eventually slice-native on the backend.

---

## 1. Executive Summary

Workflow Cannon has outgrown a dashboard model where the extension frequently shells out to the CLI for `dashboard-summary`. The CLI connector is intentionally serialized around shared state safety, but the dashboard now needs a UI-grade read model: cached snapshots, slice-level refresh, event-driven updates, and fast first paint.

`main` already contains the beginning of the better architecture:

- `DashboardReadPathCoordinator` can select CLI polling or a warm service read path.
- `ServiceDashboardDataSource` can talk to a service over HTTP and SSE.
- `DashboardServiceStoreSync` can ingest service snapshots and slice events into `DashboardDataStore`.
- The service API shape already includes health, snapshot, slice fetch, refresh, and events.
- CLI polling remains available as a fallback path.

This plan makes the warm service the default production dashboard read path and turns CLI polling into a fallback/debug path. It also lays out the follow-on work to make the service slice-native instead of internally relying on heavy `dashboard-summary` projections.

---

## 2. Current Architecture Context

### 2.1 What exists now

The current dashboard has three important pieces:

1. **Extension-side `DashboardDataStore`**  
   Stores dashboard slices and drives webview patching.

2. **Read path coordinator**  
   Chooses between:
   - CLI pollers; or
   - warm dashboard service.

3. **Warm service client**  
   Talks to a localhost service with:
   - `GET /health`
   - `GET /dashboard/snapshot`
   - `GET /dashboard/slices/:name`
   - `POST /dashboard/refresh`
   - `GET /dashboard/events` SSE

### 2.2 The remaining problem

The dashboard UI may still stall or churn because CLI polling and non-overview projections remain too broad. Many slices still use `dashboard-summary` with `projection: "queue"` or `projection: "status"`, and non-overview projections still tend to call the larger base builder path.

The hot path should not be:

```text
webview -> extension -> CLI spawn -> dashboard-summary -> broad build -> JSON -> webview
```

The target hot path should be:

```text
webview -> extension DashboardDataStore -> warm service snapshot/slice cache -> section patch
```

### 2.3 Why the CLI connector is still useful

The CLI connector should remain serialized for mutations because mutations touch shared state:

- SQLite task/planning stores;
- git-canonical task-state events;
- assignment/handoff state;
- workspace status;
- generated files/docs;
- phase/catalog state.

The change is not “remove the serial connector.” The change is:

```text
Reads: service-backed, cached, slice-level, event-driven.
Mutations: CLI/policy path, serialized and safe.
Fallback reads: CLI polling, coalesced and visible-section driven.
```

---

## 3. Major Decisions and Options

These are the strategic decisions an implementation agent should understand before starting.

### Decision A — Should the dashboard service be started automatically?

**Context:** The service is only useful as the primary read path if it is easy to start and reliable. Current auto mode can use the service if healthy and fall back to CLI polling if not.

**Option A1 — Health-probe only; user starts service manually**

- Pros: lowest risk, avoids surprise background processes.
- Cons: most users remain on CLI polling; does not solve the main performance problem by default.

**Option A2 — Extension auto-starts service in `auto` mode**

- Pros: best user experience, makes warm service the real default.
- Cons: requires robust lifecycle, logging, pid/runtime validation, stale process cleanup.

**Recommended:** **A2**, with a guarded rollout.

Rules:

- In `dashboard.dataSource: "auto"`, try existing service health first.
- If not healthy, attempt `dashboard-service-start` once per activation/session.
- If start fails, fall back to CLI polling and show a read-mode badge/detail.
- Never spin in a start loop.
- Provide commands to restart service and force CLI polling.

---

### Decision B — Should service snapshots be computed by existing `dashboard-summary` or slice-native builders?

**Option B1 — Service calls existing `dashboard-summary` internally**

- Pros: faster to integrate; fewer schema changes.
- Cons: preserves monolithic builder cost and hidden coupling.

**Option B2 — Service uses slice-native builders**

- Pros: aligns cost with UI sections; enables fast snapshot + targeted refresh; better long-term design.
- Cons: more work; requires contracts/tests per slice.

**Recommended:** **B2 as the target**, with B1 tolerated only as a temporary bridge.

Implementation rule:

- Do not block service-default rollout on perfect slice-native builders.
- But every new service refresh path should move toward slice-native builders.
- Do not add new hot paths that depend on full `dashboard-summary`.

---

### Decision C — Should CLI polling be deleted?

**Recommended:** No.

Keep CLI polling as:

- fallback when service is unavailable;
- debugging mode;
- compatibility path during service rollout;
- safety path for unusual workspaces.

But CLI polling should no longer be the normal dashboard hot path.

---

### Decision D — Should dashboard service perform mutations?

**Recommended:** No.

The service should be read-side only. Mutations should continue through the existing CLI/policy path.

After mutations complete, the extension should invalidate or refresh affected slices through the service.

---

### Decision E — How should freshness work?

**Recommended model:** slice freshness.

Each slice has:

- value;
- status: fresh/stale/loading/error;
- source;
- sourceArgs;
- planningGeneration;
- updatedAt;
- optional error;
- freshness SLA.

The service should expose per-slice health and last refresh timing.

---

## 4. Target Architecture

```text
Cursor/VS Code Extension
  ├─ Webview shell
  ├─ DashboardDataStore
  ├─ DashboardReadPathCoordinator
  │   ├─ Preferred: ServiceDashboardDataSource
  │   │   ├─ GET /dashboard/snapshot
  │   │   ├─ GET /dashboard/slices/:name
  │   │   ├─ POST /dashboard/refresh
  │   │   └─ GET /dashboard/events
  │   └─ Fallback: CLI polling
  └─ CommandClient
      └─ CLI mutations + fallback reads

workspace-kit dashboard service
  ├─ long-lived process
  ├─ warmed SQLite/read handles where safe
  ├─ slice snapshot store
  ├─ slice refresh scheduler
  ├─ file/db/task-state watchers
  ├─ SSE event emitter
  └─ health/observability endpoint
```

### Mutation flow

```text
user action -> extension drawer/coordinator -> CLI mutation command -> success
  -> affected slices marked stale
  -> service refresh requested for affected slices
  -> service emits dashboard.slice.updated
  -> extension ingests slice and patches visible section
```

### Startup flow

```text
extension activates
  -> read dashboard.dataSource
  -> if auto/service: probe existing service
  -> if unhealthy and auto: attempt service start once
  -> if service healthy: start ServiceDashboardDataSource
      -> ingest snapshot
      -> subscribe SSE
      -> render dashboard from store
  -> else: fallback CLI polling and show badge
```

---

## 5. WBS Overview

| WBS | Workstream | Goal | Depends On |
| --- | --- | --- | --- |
| WBS-SU-000 | Baseline and Audit | Establish current service/CLI behavior and performance | None |
| WBS-SU-100 | Service Default and Lifecycle | Make service the primary auto-mode read path | WBS-SU-000 |
| WBS-SU-200 | Service Snapshot Robustness | Ensure service snapshot/slice ingestion is reliable | WBS-SU-100 |
| WBS-SU-300 | Slice-Native Service Builders | Replace broad summary internals with focused builders | WBS-SU-200 |
| WBS-SU-400 | Mutation Invalidation Bridge | Refresh service slices after CLI mutations | WBS-SU-200 |
| WBS-SU-500 | CLI Fallback Hardening | Keep CLI polling stable as fallback only | WBS-SU-100 |
| WBS-SU-600 | Observability and Diagnostics | Make failures and slow slices obvious | WBS-SU-100, WBS-SU-200 |
| WBS-SU-700 | Tests and Acceptance | Prove service-first behavior and fallback safety | All prior workstreams as applicable |
| WBS-SU-800 | Rollout and Documentation | Document config, commands, and support workflow | WBS-SU-700 |

---

## 6. Planner Import Task List

### WBS-SU-000 — Baseline and Audit

#### T-SU-001 — Audit current dashboard service readiness

**Type:** research / audit  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-010, T-SU-101, T-SU-601  
**Blocked by:** none

**Goal:** Determine exactly how much of the warm service path already works on `main`.

**Files to inspect:**

- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-read-path-coordinator.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/service-dashboard-data-source.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-service-store-sync.ts`
- `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-service-mapper.ts`
- `src/services/dashboard-service/*`
- `src/modules/task-engine/instructions/dashboard-service-*.md`
- command registration for `dashboard-service-start|stop|status|snapshot`

**Work:**

- Run or inspect the service lifecycle commands.
- Confirm whether the service can start, write runtime metadata, pass health, return snapshot, return individual slices, refresh slices, and emit SSE.
- Identify gaps between existing behavior and the target service-first architecture.
- Capture current timings:
  - service start;
  - health probe;
  - full snapshot;
  - slice fetch for overview;
  - slice fetch for queue;
  - slice fetch for status;
  - CLI fallback overview.

**Acceptance criteria:**

- Audit notes list what already works and what is missing.
- Current timing table is produced.
- Any failing service route/command has a concise reproduction command.
- Follow-up tasks are adjusted if current code already satisfies part of this plan.

---

#### T-SU-010 — Define service-first success metrics

**Type:** design / metrics  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-101, T-SU-601, T-SU-701  
**Blocked by:** T-SU-001

**Goal:** Set measurable acceptance thresholds for service-first dashboard behavior.

**Recommended metrics:**

- Existing healthy service detection: < 500ms.
- Warm snapshot fetch: < 1s.
- Service-backed first dashboard paint: < 2s after webview resolve.
- Service start + first usable snapshot: < 5s.
- Critical slice refresh: <= 2s target.
- Queue visible slice refresh: <= 5s target.
- Status/ops visible slice refresh: <= 10s target.
- Normal service-backed dashboard operation: zero CLI `dashboard-summary` spawns.
- CLI fallback first paint: remains functional, even if slower.

**Acceptance criteria:**

- Metrics are documented in this plan or companion docs.
- Tests/bench tasks reference these thresholds.
- Metrics distinguish service-backed mode from CLI fallback mode.

---

### WBS-SU-100 — Service Default and Lifecycle

#### T-SU-101 — Make `auto` mode start the dashboard service once per extension session

**Type:** extension / lifecycle  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-102, T-SU-201, T-SU-501  
**Blocked by:** T-SU-001, T-SU-010

**Goal:** In `dashboard.dataSource: "auto"`, make the extension prefer the warm service and start it if it is not already healthy.

**Context:** Current coordinator can probe health and use service when available. This task makes the service path practical as the normal default.

**Work:**

- In `DashboardReadPathCoordinator.activateReadPath()` or a helper, implement:
  1. read config;
  2. if `cli-polling`, do not start service;
  3. if `service`, require service start/health or show service failure;
  4. if `auto`, probe existing service;
  5. if unhealthy, attempt `dashboard-service-start` once;
  6. re-probe;
  7. if healthy, start service path;
  8. if still unhealthy, fall back to CLI polling.
- Prevent repeated start attempts in one activation/session unless user explicitly restarts service.
- Add clear mode badge detail for:
  - service active;
  - service start failed, using CLI fallback;
  - service disabled by config;
  - forced CLI session override.

**Acceptance criteria:**

- `auto` mode uses service when healthy.
- `auto` mode attempts service start once when not healthy.
- `auto` mode falls back to CLI polling without blocking dashboard render.
- `service` mode reports failure instead of silently falling back.
- `cli-polling` mode does not auto-start service.
- No start loop occurs.

---

#### T-SU-102 — Harden service runtime metadata and stale process handling

**Type:** service lifecycle  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-103, T-SU-602  
**Blocked by:** T-SU-101

**Goal:** Ensure `runtime.json`, pid, port, and service health are reliable enough for auto-start.

**Work:**

- Validate `.workspace-kit/dashboard-service/runtime.json` schema.
- Detect stale pid/port entries.
- Ensure service start overwrites stale runtime metadata safely.
- Ensure service stop handles missing/stale process gracefully.
- Ensure health includes process identity or generation so the extension can trust the runtime file.
- Ensure localhost binding is explicit.

**Acceptance criteria:**

- Stale runtime file does not prevent service start.
- Stale pid does not falsely report service healthy.
- Service status explains unhealthy/stale cases.
- Tests cover stale runtime, stale pid, missing runtime, and healthy service.

---

#### T-SU-103 — Add user-facing service control commands and badge states

**Type:** extension UX / command integration  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-SU-801  
**Blocked by:** T-SU-102

**Goal:** Make service mode understandable and controllable.

**Work:**

- Ensure commands exist and are discoverable:
  - Restart Dashboard Service;
  - Stop Dashboard Service, if appropriate;
  - Use CLI Dashboard Refresh Mode for this session;
  - Use Auto Dashboard Refresh Mode, if appropriate.
- Ensure dashboard badge shows active read path:
  - Warm service;
  - CLI polling;
  - Service unavailable — CLI fallback;
  - Service forced off.
- Add failure detail to the badge or nearby diagnostic panel.

**Acceptance criteria:**

- User can restart service without terminal.
- User can force CLI fallback for debugging.
- Badge accurately reflects active read path.
- Service failure is not silent.

---

### WBS-SU-200 — Service Snapshot Robustness

#### T-SU-201 — Validate full snapshot ingestion into `DashboardDataStore`

**Type:** extension / store integration  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-202, T-SU-701  
**Blocked by:** T-SU-101

**Goal:** Ensure service snapshots hydrate the same store/webview model as CLI polling.

**Work:**

- Inspect `DashboardServiceStoreSync.ingestFullSnapshot()` and mapper behavior.
- Ensure every service slice maps correctly into `DashboardDataStore`.
- Ensure stale/error/loading slice states are handled.
- Ensure snapshot ingestion preserves planning generation and freshness metadata.
- Ensure first webview render can use service-ingested store data without waiting on CLI polling.

**Acceptance criteria:**

- Full snapshot populates all fresh slices into store.
- Error slices appear as error state, not missing data.
- Planning generation is preserved.
- Webview can render from service snapshot data.

---

#### T-SU-202 — Validate individual slice fetch and refresh flow

**Type:** extension / service integration  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-203, T-SU-401, T-SU-701  
**Blocked by:** T-SU-201

**Goal:** Ensure visible sections can refresh one slice without triggering broad CLI summary reads.

**Work:**

- Validate `ServiceDashboardDataSource.refreshSlice(name)` calls `POST /dashboard/refresh` with one slice.
- Validate `DashboardServiceStoreSync.refreshSlice(name)` refreshes and ingests one slice.
- Validate `GET /dashboard/slices/:name` returns a service slice record the mapper understands.
- Confirm extension-side tab activation or stale refresh calls service slice refresh when in service mode.

**Acceptance criteria:**

- Refreshing one service slice updates only that slice in store.
- A failed slice refresh marks only that slice error/stale.
- No CLI `dashboard-summary` runs in service mode for normal slice refresh.

---

#### T-SU-203 — Validate SSE event ingestion and reconnect behavior

**Type:** extension / service events  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-SU-401, T-SU-702  
**Blocked by:** T-SU-202

**Goal:** Ensure service events keep the extension store current without polling.

**Work:**

- Validate event types:
  - `dashboard.slice.updated`;
  - `dashboard.snapshot.updated`;
  - `task-sync.status.changed`;
  - service error events.
- Confirm service event normalization still handles `agentActivity.updated` compatibility.
- Confirm reconnect loop does not duplicate listeners.
- Confirm SSE failure does not kill the dashboard; it should reconnect or mark service degraded.

**Acceptance criteria:**

- Slice update event fetches and ingests only that slice.
- Snapshot update event ingests full snapshot.
- Task sync status event updates status slice.
- SSE reconnect works after temporary service drop.
- No duplicate event handling after reconnect.

---

### WBS-SU-300 — Slice-Native Service Builders

#### T-SU-301 — Inventory current slice dependencies and heavy builder calls

**Type:** research / backend audit  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-302, T-SU-303, T-SU-304, T-SU-305  
**Blocked by:** T-SU-201

**Goal:** Map every dashboard slice to the minimum data it actually needs.

**Work:**

- Review `DASHBOARD_SLICE_REGISTRY`.
- Review render functions for each section.
- For each slice, record:
  - fields needed;
  - current command/projection;
  - expensive builders invoked;
  - whether it can be stale/deferred;
  - whether it is visible-only;
  - target slice builder.

**Acceptance criteria:**

- Slice dependency matrix exists.
- Heavy calls are identified for queue/status/ops/phase-journal/config.
- Follow-up builder tasks have clear field scopes.

---

#### T-SU-302 — Create slice-native overview and phase builders

**Type:** backend / service builder  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-306, T-SU-701  
**Blocked by:** T-SU-301

**Goal:** Ensure service snapshot can build overview/phase quickly without broad summary work.

**Work:**

- Reuse or refine existing lightweight overview builder.
- Create explicit slice builder outputs for:
  - overview;
  - phase.
- Avoid full system status and full task-state sync checks.
- Use safe stubs for deferred status/config/diagnostics.

**Acceptance criteria:**

- Overview slice builds without full `dashboard-summary` base.
- Phase slice builds without full status diagnostics.
- First service snapshot can include these quickly.

---

#### T-SU-303 — Create slice-native queue builder

**Type:** backend / service builder  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-306, T-SU-701  
**Blocked by:** T-SU-301

**Goal:** Build queue data without status diagnostics, full task-state projection, wishlist, or terminal archive rows.

**Queue slice should include:**

- ready/proposed/blocked summaries;
- queue counts;
- phase buckets needed by Queue tab;
- dependency overview if needed and bounded;
- completed/cancelled count-only lazy summaries;
- wishlist empty/disabled unless explicitly enabled.

**Queue slice must not include:**

- full `systemStatus`;
- full `taskStateProjection`;
- full doctor/CAE diagnostics;
- completed/cancelled row lists;
- full phase delivery history;
- unrelated ops/team/subagent data.

**Acceptance criteria:**

- Queue slice builder is independent of broad status builders.
- Queue slice returns quickly in large workspaces.
- Terminal lazy loading remains separate.

---

#### T-SU-304 — Create slice-native status/ops builders

**Type:** backend / service builder  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-SU-306, T-SU-701  
**Blocked by:** T-SU-301

**Goal:** Separate slow status diagnostics from unrelated dashboard sections.

**Work:**

- Create focused builders for:
  - status;
  - plan artifact;
  - team;
  - subagents;
  - checkpoints;
  - config.
- Status may call full system/task-state diagnostics, but it should not build queue rows or queue buckets.
- Ops slices should not call status diagnostics unless they need them.

**Acceptance criteria:**

- Status slice can be slow without blocking overview/queue.
- Team/subagents/checkpoints can refresh independently.
- Config slice uses cheap config/system stubs unless full status is visible/requested.

---

#### T-SU-305 — Create slice-native agent activity builder

**Type:** backend / service builder  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-SU-306  
**Blocked by:** T-SU-301

**Goal:** Keep live agent activity cheap and independent.

**Work:**

- Ensure agent activity slice reads only current agent activity leases/state.
- Avoid queue/status/full summary work.
- Ensure live interval/SSE updates remain cheap.

**Acceptance criteria:**

- Agent activity slice refresh does not invoke broad summary builders.
- Live updates stay responsive.

---

#### T-SU-306 — Wire service snapshot store to slice-native builders

**Type:** service backend  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-401, T-SU-701  
**Blocked by:** T-SU-302, T-SU-303, T-SU-304, T-SU-305

**Goal:** Make the service compute and cache slices using focused builders.

**Work:**

- Update service slice refreshers to call slice-native builders.
- Ensure service snapshot combines cached slice records rather than recomputing everything synchronously on request.
- Ensure slice records include status, updatedAt, source, sourceArgs, planningGeneration, and errors.
- Ensure `GET /dashboard/snapshot` is mostly a cache read.
- Ensure `POST /dashboard/refresh` recomputes selected slices only.

**Acceptance criteria:**

- Snapshot route does not synchronously build all heavy slices from scratch.
- Refreshing queue does not refresh status.
- Refreshing status does not refresh queue.
- Slice errors are isolated.

---

### WBS-SU-400 — Mutation Invalidation Bridge

#### T-SU-401 — Route CLI mutation completion to service slice refresh

**Type:** extension / invalidation  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-402, T-SU-701  
**Blocked by:** T-SU-202, T-SU-203, T-SU-306

**Goal:** After CLI mutations, refresh affected service slices rather than falling back to broad CLI refresh.

**Work:**

- Use existing mutation kind → slice mapping.
- When active read path is service:
  - mark affected slices stale/loading in store;
  - call service `refreshSlice()` for affected visible/eager slices;
  - rely on SSE events where available;
  - avoid CLI `dashboard-summary`.
- When active read path is CLI polling:
  - keep existing fallback behavior.

**Acceptance criteria:**

- Mutating task queue refreshes queue/overview/phase slices through service.
- Mutating config refreshes config/status through service.
- Mutating ideas refreshes ideas/queue through service.
- No service-mode mutation completion spawns CLI dashboard-summary.

---

#### T-SU-402 — Preserve last-good UI during service refresh/failure

**Type:** extension / UX resilience  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-SU-701  
**Blocked by:** T-SU-401

**Goal:** Ensure service refresh failures do not blank the dashboard.

**Work:**

- Last-good slice value remains visible when refresh fails.
- Slice state changes to stale/error with a section-level warning.
- Full service failure degrades to CLI fallback or stale mode according to config.
- Do not replace the whole webview root unless no prior usable data exists.

**Acceptance criteria:**

- Failed slice refresh preserves prior value.
- Service drop does not blank dashboard.
- Error is visible at badge/section level.

---

### WBS-SU-500 — CLI Fallback Hardening

#### T-SU-501 — Make CLI polling clearly fallback-only in `auto` mode

**Type:** extension / fallback  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-SU-502, T-SU-801  
**Blocked by:** T-SU-101

**Goal:** Prevent accidental normal operation on CLI polling when service is available.

**Work:**

- In `auto`, prefer service.
- If fallback occurs, record reason.
- Badge and logs should clearly say fallback is active.
- Avoid automatic repeated service start attempts.

**Acceptance criteria:**

- Service healthy → service path.
- Service unhealthy → CLI fallback with reason.
- User can force CLI fallback.
- Logs clearly distinguish fallback from preferred path.

---

#### T-SU-502 — Reduce CLI fallback damage from broad summary calls

**Type:** extension / fallback performance  
**Size:** single session  
**Priority:** P2  
**Blocks:** T-SU-701  
**Blocked by:** T-SU-501, T-SU-306

**Goal:** Keep fallback usable without reintroducing hot broad `dashboard-summary` calls.

**Work:**

- Point CLI poller slice descriptors to focused slice commands if they exist.
- Keep `dashboard-summary` full projection manual/debug only.
- Ensure visible-only slices do not poll when not visible.
- Ensure status/ops/queue polling does not block overview first paint.

**Acceptance criteria:**

- CLI fallback works.
- CLI fallback does not automatically call full projection.
- CLI fallback uses slice-native/focused commands where available.

---

### WBS-SU-600 — Observability and Diagnostics

#### T-SU-601 — Extend service health with slice metrics

**Type:** service observability  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-602, T-SU-701  
**Blocked by:** T-SU-001, T-SU-010

**Goal:** Make service health answer: what is slow, stale, or failing?

**Health should include:**

- ok;
- uptime;
- generation;
- planningGeneration;
- active refreshes;
- per-slice status;
- last refresh duration per slice;
- last successful refresh per slice;
- error count;
- slowest slice;
- whether watchers are active;
- runtime pid/port/version.

**Acceptance criteria:**

- `/health` exposes enough diagnostics for extension badge/logging.
- `dashboard-service-status` returns the same useful detail.
- Slowest/failing slices are visible without CLI dashboard-summary.

---

#### T-SU-602 — Add extension diagnostics for service path

**Type:** extension observability  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-SU-701, T-SU-801  
**Blocked by:** T-SU-102, T-SU-601

**Goal:** Make the Workflow Cannon output and UI badge explain service behavior.

**Work:**

- Log read path activation:
  - configured mode;
  - active path;
  - health result;
  - fallback reason;
  - service pid/port/generation if active.
- Log service snapshot duration.
- Log slice refresh duration/failure.
- Avoid log spam; use trace gating where appropriate.

**Acceptance criteria:**

- A single startup log explains service vs CLI selection.
- Service failures include actionable reason.
- Slice performance can be diagnosed from logs.

---

### WBS-SU-700 — Tests and Acceptance

#### T-SU-701 — Add service-first integration tests

**Type:** tests  
**Size:** single session  
**Priority:** P0  
**Blocks:** T-SU-702, T-SU-801  
**Blocked by:** T-SU-201, T-SU-202, T-SU-306, T-SU-401, T-SU-501, T-SU-601

**Goal:** Prove service-first behavior and no normal CLI spawn in service mode.

**Tests:**

- auto mode starts/uses service when available;
- auto mode falls back to CLI when service unhealthy;
- service mode reports failure when service unavailable;
- service snapshot populates store;
- service slice event updates one slice;
- service mutation invalidation refreshes affected slices;
- normal service-backed startup does not call CLI `dashboard-summary`;
- CLI fallback still works;
- stale runtime file is handled.

**Acceptance criteria:**

- Tests pass in local CI/test command.
- Tests fail if service mode spawns CLI dashboard-summary for normal reads.
- Fallback behavior is covered.

---

#### T-SU-702 — Add performance benchmark / acceptance script

**Type:** bench / acceptance  
**Size:** single session  
**Priority:** P1  
**Blocks:** T-SU-801  
**Blocked by:** T-SU-203, T-SU-701

**Goal:** Measure whether service-first actually fixes dashboard latency.

**Script should measure:**

- service start;
- health probe;
- snapshot fetch;
- overview slice fetch;
- queue slice refresh;
- status slice refresh;
- first webview/store hydration if testable;
- CLI fallback baseline for comparison.

**Acceptance criteria:**

- Bench output is repeatable.
- Output distinguishes service vs CLI fallback.
- Results can be attached to release notes or final agent report.

---

### WBS-SU-800 — Rollout and Documentation

#### T-SU-801 — Document service-first dashboard operation

**Type:** docs  
**Size:** single session  
**Priority:** P1  
**Blocks:** none  
**Blocked by:** T-SU-103, T-SU-501, T-SU-602, T-SU-701, T-SU-702

**Goal:** Make the new read model understandable to maintainers and agents.

**Docs should cover:**

- service-first architecture;
- CLI fallback role;
- `dashboard.dataSource` values;
- service lifecycle commands;
- troubleshooting stale runtime/service unavailable;
- how to force CLI polling;
- how to interpret mode badge;
- performance expectations;
- mutation safety: service read-only, CLI mutations authoritative.

**Acceptance criteria:**

- Maintainer docs updated.
- Agent instructions mention service-first read path.
- Troubleshooting steps are concrete.

---

## 7. Dependency Graph

```text
T-SU-001
  -> T-SU-010
  -> T-SU-101
      -> T-SU-102
          -> T-SU-103
      -> T-SU-201
          -> T-SU-202
              -> T-SU-203
          -> T-SU-301
              -> T-SU-302
              -> T-SU-303
              -> T-SU-304
              -> T-SU-305
              -> T-SU-306
                  -> T-SU-401
                      -> T-SU-402
      -> T-SU-501
          -> T-SU-502
  -> T-SU-601
      -> T-SU-602

T-SU-201 + T-SU-202 + T-SU-306 + T-SU-401 + T-SU-501 + T-SU-601 -> T-SU-701
T-SU-203 + T-SU-701 -> T-SU-702
T-SU-103 + T-SU-501 + T-SU-602 + T-SU-701 + T-SU-702 -> T-SU-801
```

---

## 8. Recommended Release Slices

### Release Slice 1 — Make Service the Real Default

**Goal:** Service starts/activates in auto mode, with safe fallback.

Tasks:

1. T-SU-001 — Audit current dashboard service readiness
2. T-SU-010 — Define service-first success metrics
3. T-SU-101 — Make `auto` mode start the dashboard service once per extension session
4. T-SU-102 — Harden service runtime metadata and stale process handling
5. T-SU-501 — Make CLI polling clearly fallback-only in `auto` mode
6. T-SU-601 — Extend service health with slice metrics
7. T-SU-602 — Add extension diagnostics for service path

**Expected result:** Most users get service-backed dashboard reads automatically. CLI fallback is visible and explainable.

---

### Release Slice 2 — Service Store Reliability

**Goal:** Service snapshots/events are reliable enough to replace CLI polling for normal operation.

Tasks:

1. T-SU-201 — Validate full snapshot ingestion into `DashboardDataStore`
2. T-SU-202 — Validate individual slice fetch and refresh flow
3. T-SU-203 — Validate SSE event ingestion and reconnect behavior
4. T-SU-401 — Route CLI mutation completion to service slice refresh
5. T-SU-402 — Preserve last-good UI during service refresh/failure

**Expected result:** Dashboard remains live through service snapshots, slice refresh, and SSE without normal CLI summary reads.

---

### Release Slice 3 — Slice-Native Backend

**Goal:** Make service refresh cost match the visible UI slice.

Tasks:

1. T-SU-301 — Inventory current slice dependencies and heavy builder calls
2. T-SU-302 — Create slice-native overview and phase builders
3. T-SU-303 — Create slice-native queue builder
4. T-SU-304 — Create slice-native status/ops builders
5. T-SU-305 — Create slice-native agent activity builder
6. T-SU-306 — Wire service snapshot store to slice-native builders
7. T-SU-502 — Reduce CLI fallback damage from broad summary calls

**Expected result:** The service no longer hides a monolithic `dashboard-summary` backend under a slice API.

---

### Release Slice 4 — Acceptance and Rollout

**Goal:** Lock in behavior, performance, and support docs.

Tasks:

1. T-SU-701 — Add service-first integration tests
2. T-SU-702 — Add performance benchmark / acceptance script
3. T-SU-801 — Document service-first dashboard operation

**Expected result:** Service-first dashboard is testable, measurable, and maintainable.

---

## 9. Implementation Rules

1. **Service is read-only.** Do not route mutations through the service.
2. **CLI mutations remain authoritative.** Existing policy approval and mutation safety must remain intact.
3. **No normal service-mode CLI dashboard-summary.** Service-backed operation should not spawn `dashboard-summary` for normal reads.
4. **CLI fallback remains.** Do not delete fallback until service has been proven across workspaces.
5. **Snapshot route should be cache-first.** Avoid building every slice synchronously on request.
6. **Slice refresh is isolated.** A queue refresh should not refresh status unless the dependency is explicit.
7. **Last-good UI wins.** Never blank a useful dashboard because a service slice failed.
8. **Logs must explain mode.** A maintainer should know whether they are on service or CLI fallback.
9. **No infinite service start loops.** Auto-start once per session unless the user explicitly retries.
10. **Visible-section hydration.** Expensive slices should refresh only when visible or explicitly requested.

---

## 10. Definition of Done

The service-first dashboard upgrade is complete when:

1. `dashboard.dataSource: "auto"` uses the warm service by default when possible.
2. The extension can auto-start the service once per session when auto mode is enabled.
3. CLI polling is clearly labeled fallback/debug mode.
4. Service health and badge diagnostics explain active path and fallback reasons.
5. Service full snapshot hydrates `DashboardDataStore` without CLI dashboard-summary.
6. Service slice refresh updates individual slices without broad summary reads.
7. SSE events update slices or snapshots without polling loops.
8. CLI mutations refresh affected service slices after completion.
9. Service snapshots preserve last-good UI on slice failure.
10. Slice-native builders exist for overview, queue, status/ops, and agent activity.
11. Normal service-backed dashboard startup spawns zero CLI `dashboard-summary` commands.
12. CLI fallback still works when service is unavailable.
13. Tests cover service success, fallback, stale runtime, snapshot ingest, slice refresh, SSE, and mutation invalidation.
14. Benchmarks show service-backed first paint and warm snapshots meet the documented thresholds.
15. Maintainer docs explain config, lifecycle commands, mode badge, and troubleshooting.

---

## 11. Suggested Agent Execution Prompt

Use this when assigning the full initiative to a planner/orchestrator agent:

```text
Implement STORE_UPGRADE.md. Treat the warm dashboard service as the primary read path and CLI polling as fallback. Start with the audit and metrics tasks, then make auto mode start/use the service safely, then harden service snapshot/slice ingestion, then move backend refresh toward slice-native builders. Preserve CLI mutations and policy safety. Do not delete CLI fallback. Do not route mutations through the service. Each task should be completed in a single focused session with tests or validation notes. Keep service-backed normal operation free of CLI dashboard-summary reads.
```
