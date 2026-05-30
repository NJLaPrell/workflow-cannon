# Workflow Cannon Dashboard Data Loading: Option 1 → Option 2 Implementation Handoff

## Purpose

This handoff is for implementing the dashboard performance redesign in two stages:

1. **Option 1: Dashboard State Store with targeted pollers** — implement first.
2. **Option 2: Long-lived dashboard read service / daemon** — implement after Option 1 stabilizes.

The goal is to make the dashboard:

- Paint a usable UI in **under 5 seconds**.
- Keep all important dashboard data points **fresh and internally synchronized within 10 seconds or less**.
- Avoid blocked transactions and slow UI caused by serial dashboard data loading.
- Preserve correctness, mutation safety, planning-generation handling, and Workflow Cannon's existing policy model.

The current dashboard is already partially optimized with shell-first paint, lazy sections, projections, refresh coalescing, mutation preemption, and targeted invalidation. The problem is that dashboard freshness still depends too heavily on repeated serialized `workspace-kit run ...` child-process reads, especially `dashboard-summary`.

---

## Current State Summary

### Existing good pieces

The dashboard already has several important foundations:

- `DashboardViewProvider` paints a shell synchronously before waiting on dashboard data.
- `DashboardRefreshController` coalesces refreshes, prevents overlapping refresh loops, and defers refreshes during UI locks or suppressed mutation windows.
- `CommandClient` has a dual-lane queue where mutations can preempt refresh reads.
- Dashboard sections are lazy-loaded:
  - `overview`, `ideas`, and `queue` are eager.
  - `status`, `config`, `cae`, and `phase-journal` are on-tab-activate.
- `dashboard-summary` supports projections:
  - `full`
  - `overview`
  - `queue`
  - `status`
- Queue rows are partially lazy-loaded through `list-tasks`.

### Current weakness

The dashboard still relies on repeated serialized CLI process calls:

```text
webview event
  → DashboardViewProvider
    → CommandClient.run(...)
      → spawn workspace-kit CLI process
        → rebuild dashboard summary
          → render/push patch
```

Even with projection support, the refresh model still bottlenecks through `CommandClient` and spawned CLI invocations. Refresh reads are coalesced and preemptable, but they are not a proper live dashboard read model.

### High-level direction

Move from:

```text
Repeated dashboard-summary CLI reads → render
```

To:

```text
Small targeted read pollers → DashboardDataStore → section-level patches
```

Then eventually:

```text
Long-lived dashboard read service → live snapshot/event stream → DashboardDataStore → section-level patches
```

---

# Option 1: Dashboard State Store with Targeted Pollers

## Recommendation

Implement Option 1 first.

This is the safest and highest-value next step because it works within the current extension/CLI architecture while changing the dashboard from a monolithic refresh model into a live read-side model.

Do **not** jump straight to the daemon/service. First create the state-store abstraction and targeted slice model. The daemon in Option 2 should later replace the pollers without changing the UI/rendering model again.

---

## Option 1 Goal

Create an extension-side dashboard state store that:

- Maintains the latest known value for each dashboard slice.
- Refreshes slices on different intervals depending on importance and cost.
- Emits section-level updates when a slice changes.
- Allows stale-but-visible rendering.
- Keeps visible sections fresh within 10 seconds.
- Does not block mutations.
- Does not require every dashboard update to call full `dashboard-summary`.

---

## New Files to Add

Recommended files:

```text
extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-data-store.ts
extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-slice-registry.ts
extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-pollers.ts
extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-snapshot-types.ts
extensions/cursor-workflow-cannon/test/dashboard-data-store.test.mjs
extensions/cursor-workflow-cannon/test/dashboard-pollers.test.mjs
```

Optional instrumentation file:

```text
extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-load-trace.ts
```

---

## Core Types

Create a formal slice model.

```ts
export type DashboardSliceName =
  | "overview"
  | "queue"
  | "ideas"
  | "phase"
  | "phaseJournal"
  | "status"
  | "agent"
  | "team"
  | "subagents"
  | "checkpoints"
  | "cae"
  | "config";

export type DashboardSliceStatus =
  | "empty"
  | "loading"
  | "fresh"
  | "stale"
  | "error";

export type DashboardSlice<T = unknown> = {
  name: DashboardSliceName;
  value: T | null;
  status: DashboardSliceStatus;
  updatedAt: number | null;
  startedAt?: number | null;
  source: string;
  sourceArgs?: Record<string, unknown>;
  planningGeneration?: number | null;
  error?: string;
};

export type DashboardSnapshot = {
  schemaVersion: 1;
  generation: number;
  createdAt: number;
  updatedAt: number;
  planningGeneration: number | null;
  slices: Record<DashboardSliceName, DashboardSlice>;
};

export type DashboardSliceUpdate = {
  name: DashboardSliceName;
  previous: DashboardSlice | null;
  next: DashboardSlice;
  changed: boolean;
};
```

---

## DashboardDataStore Responsibilities

`DashboardDataStore` should:

1. Hold the latest `DashboardSnapshot`.
2. Track stale/fresh/error/loading status per slice.
3. Track per-slice `updatedAt`, source command, and source args.
4. Ingest planning-generation metadata from any payload that includes it.
5. Emit slice updates to subscribers.
6. Debounce/coalesce section patches.
7. Support stale-but-visible rendering.
8. Avoid kicking off overlapping refreshes for the same slice.
9. Refuse to start refresh reads while mutations are suppressing refreshes.
10. Keep old data visible when a refresh fails.

Suggested API:

```ts
export class DashboardDataStore {
  getSnapshot(): DashboardSnapshot;
  getSlice<T = unknown>(name: DashboardSliceName): DashboardSlice<T>;
  subscribe(listener: (update: DashboardSliceUpdate, snapshot: DashboardSnapshot) => void): vscode.Disposable;

  markLoading(name: DashboardSliceName, source: string, args?: Record<string, unknown>): void;
  markStale(name: DashboardSliceName, reason?: string): void;
  markError(name: DashboardSliceName, error: unknown): void;
  updateSlice<T>(name: DashboardSliceName, value: T, meta?: {
    source?: string;
    sourceArgs?: Record<string, unknown>;
    planningGeneration?: number | null;
  }): void;

  isFresh(name: DashboardSliceName, maxAgeMs: number): boolean;
  staleSlices(now?: number): DashboardSliceName[];
}
```

---

## Slice Registry

Create a slice registry separate from the existing section registry.

The existing section registry describes UI sections. The new slice registry describes data freshness, source, and polling.

```ts
export type DashboardSliceDescriptor = {
  name: DashboardSliceName;
  label: string;
  priority: "critical" | "normal" | "heavy" | "manual";
  defaultIntervalMs: number | null;
  freshnessSlaMs: number | null;
  visibleFreshnessSlaMs: number | null;
  command: string | null;
  args: Record<string, unknown>;
  sections: DashboardSectionId[];
  staleOnMutationKinds: DashboardMutationKind[];
  lazyUntilVisible?: boolean;
};
```

Recommended initial registry:

| Slice | Priority | Poll interval | Freshness SLA | Source |
|---|---:|---:|---:|---|
| `overview` | critical | 2s | 5s | `dashboard-summary { projection: "overview", skipHeavyFetches: true }` |
| `queue` | critical/normal | 5s | 10s | `dashboard-summary { projection: "queue" }` |
| `ideas` | normal | 5s | 10s | initially from queue projection, later separate projection/command |
| `phase` | critical | 5s | 10s | `dashboard-summary { projection: "overview" }` or new phase projection |
| `agent` | normal | 5s | 10s | dashboard summary / future agent projection |
| `team` | normal | 10s | 10s | dashboard summary / future agentOps projection |
| `subagents` | normal | 10s | 10s | dashboard summary / future agentOps projection |
| `checkpoints` | normal | 10s | 10s | dashboard summary / future agentOps projection |
| `status` | heavy | 30s or visible-only | 30s | `dashboard-summary { projection: "status" }` |
| `phaseJournal` | normal/heavy | visible-only, then 10s while visible | 10s visible | `list-phase-notes` + `get-phase-context` |
| `cae` | heavy | visible-only/manual | 30–120s | `cae-authoring-summary` |
| `config` | manual/event | null | null | config-specific host refresh |

---

## Poller Strategy

Do not use one global `setInterval(pushUpdate, 5000)`.

Use multiple targeted pollers with single-flight protection.

### Poll groups

```text
CriticalPoller
  interval: 2s
  slices: overview, phase, agent
  purpose: keep top-level dashboard responsive

QueuePoller
  interval: 5s
  slices: queue, ideas
  purpose: keep ready/blocked/proposed/wishlist/ideas current

OpsPoller
  interval: 10s
  slices: team, subagents, checkpoints
  purpose: keep operational panels reasonably fresh

StatusPoller
  interval: 30s or only when status tab visible
  slices: status
  purpose: avoid frequent doctor/system reads

PhaseJournalPoller
  interval: 10s only while task-engine tab/phase-journal section visible
  slices: phaseJournal

CaePoller
  interval: only on tab activation/manual
  slices: cae

ConfigPoller
  interval: none
  trigger: config file watcher/manual
```

### Single-flight rule

Each slice or poll group should be single-flight:

```text
If overview refresh is running, do not start another overview refresh.
If a newer refresh completes first, discard older results.
If a mutation starts, abort or ignore refresh results.
```

You already have generation tokens in `DashboardRefreshController`. Preserve that pattern.

---

## Required DashboardViewProvider Changes

`DashboardViewProvider` should stop directly owning most data refresh behavior.

Current responsibilities to move out:

- Data freshness timing.
- Repeated `dashboard-summary` calls.
- Deciding which slices are stale.
- Background poll interval.
- Last dashboard payload as the main data source.

Keep in `DashboardViewProvider`:

- Webview lifecycle.
- Message handling.
- Drawer/session operations.
- Rendering.
- Section patches.
- Mutation invalidation wiring.

Add dependencies:

```ts
private readonly dashboardStore: DashboardDataStore;
private readonly dashboardPollers: DashboardPollerCoordinator;
```

On view resolve:

```ts
webview.html = this.buildHtml(webview, renderDashboardShellInnerHtml());
this.dashboardStore.start();
this.dashboardPollers.start();
this.renderFromSnapshot({ preferCached: true });
this.dashboardPollers.refreshCriticalNow();
```

On store update:

```ts
dashboardStore.subscribe((update, snapshot) => {
  const sections = sectionsForSlice(update.name);
  this.patchSectionsFromSnapshot(sections, snapshot);
});
```

On dispose:

```ts
this.dashboardPollers.stop();
this.dashboardStore.dispose();
```

---

## Rendering Model

The UI should render in this order:

1. Paint static shell immediately.
2. Render cached/stale snapshot if present.
3. Mark stale sections visually.
4. Refresh critical slices.
5. Patch changed sections.
6. Refresh normal slices.
7. Lazy-load heavy slices only when visible.

Every visible section should display freshness state:

```text
Updated 3s ago
Refreshing…
Stale: 14s old
Failed: last good data 41s ago
```

This is important because the dashboard should prefer stale-but-visible over blank-or-blocked.

---

## Source Mapping Work

As part of Option 1, create a dashboard data map.

Recommended file:

```text
docs/maintainers/dashboard-data-map.md
```

Or agent-facing source:

```text
.ai/runbooks/dashboard-data-map.md
```

The map should include this shape for every field:

```text
Data point:
Source command/query:
SQLite table / file / task store source:
Current builder/function:
Used by dashboard section:
Freshness target:
Can be stale on first paint:
Can be lazily loaded:
Mutation invalidation trigger:
Fallback if failed:
```

Initial known map:

| Data | Source | Builder / read path | Used by |
|---|---|---|---|
| state summary | task store active tasks | `getNextActions(tasks)` | overview |
| suggested next | task store active tasks + workspace phase focus | `getNextActions(tasks)` | overview |
| ready queue | task store active tasks | `getNextActions(tasks).readyQueue` | overview, queue |
| wishlist | task store all tasks | `listWishlistIntakeTasksAsItems(store.getAllTasks())` | ideas/queue |
| ideas | planning SQLite | `listIdeas`, `listPlanningChatSessions` | ideas |
| blocked tasks | task store active tasks | filter `status === "blocked"` | overview, queue |
| proposed execution/improvements | task store active tasks | status/type filters | queue |
| completed/cancelled | task store active tasks | status filters | queue terminal buckets |
| dependency overview | task graph | `buildDashboardDependencyOverview(tasks)` | queue |
| phase buckets | task store + workspace status | `buildDashboardPhaseBucketsForTasks` | queue |
| workspace phase status | planning SQLite/workspace status | `readWorkspaceStatusSnapshotFromDual` | overview, phase, queue |
| plan artifacts | artifact storage | `listPlanArtifactSummaries` | overview/status/planning |
| team execution | SQLite | `summarizeTeamAssignmentsForDashboard` | ops/team |
| subagent registry | SQLite | `summarizeSubagentsForDashboard` | ops/subagents |
| checkpoints | SQLite/git checkpoint store | `summarizeCheckpointsForDashboard` | ops/checkpoints |
| system status | mixed config/status/doctor/module reads | `buildDashboardSystemStatus` | status |
| task-state projection | SQLite projection metadata | `buildDashboardTaskStateProjectionSummary` | status/overview |
| current phase delivery | tasks + SQLite + config | `buildDashboardCurrentPhaseDelivery` | overview/phase |
| human gates | task store + current phase | `buildDashboardHumanGatesSummary` | overview/queue |
| approval queue | task store | `buildDashboardApprovalQueueSummary` | overview/queue |
| phase journal stats | SQLite | `buildDashboardPhaseJournalStats` | queue/phase journal |
| phase journal details | SQLite | `list-phase-notes`, `get-phase-context` | phase journal |
| CAE authoring | CAE registry/artifacts | `cae-authoring-summary` | CAE tab |
| config | config host | config panel host methods | config tab |

---

## Dashboard Summary Refactor

The current `dashboard-summary` command builds many values before slicing with `finalizeDashboardSummaryProjection`.

Refactor toward builder functions that compute only what each projection requires.

Recommended structure:

```ts
const base = await buildDashboardBase(ctx, store, planningGeneration, sqliteDual, commandArgs);

switch (projection) {
  case "overview":
    return buildDashboardOverviewProjection(base);
  case "queue":
    return buildDashboardQueueProjection(base);
  case "status":
    return buildDashboardStatusProjection(base);
  case "full":
  default:
    return buildDashboardFullProjection(base);
}
```

Then add smaller projections:

```ts
export type DashboardSummaryProjection =
  | "full"
  | "overview"
  | "queue"
  | "status"
  | "critical"
  | "ideas"
  | "phase"
  | "agentOps"
  | "systemLight";
```

However, prefer separate commands long-term:

```text
dashboard-overview
dashboard-queue-summary
dashboard-ideas-summary
dashboard-phase-summary
dashboard-agent-ops-summary
dashboard-system-summary
```

For Option 1, adding projections is acceptable if it is faster and less invasive.

---

## Mutation Behavior

All mutating flows must remain CLI/policy-governed.

Option 1 must not make the dashboard store authoritative for mutations.

Rules:

1. Dashboard store is read-side only.
2. Mutations still call existing command paths.
3. Mutations still use policy approvals where required.
4. Mutations should call `client.setRefreshPaused(true)` / existing suppression paths.
5. On mutation start:
   - pause pollers,
   - preempt refresh reads,
   - mark affected slices stale.
6. On mutation success:
   - resume pollers,
   - force refresh affected slices immediately.
7. On mutation failure:
   - resume pollers,
   - keep old visible state,
   - show error.

---

## Option 1 Acceptance Criteria

### Performance

- Dashboard shell paints immediately without waiting on CLI.
- First useful dashboard state appears in under 5 seconds on normal workspace.
- Critical slices refresh within 5 seconds.
- All visible non-heavy slices refresh within 10 seconds.
- Queue updates are reflected within 10 seconds after task state changes.
- Mutations are not queued behind dashboard refresh reads.

### Correctness

- Planning generation is captured from read payloads and used by existing mutation flows.
- Existing drawer/mutation workflows continue to work.
- Existing targeted invalidation behavior remains or improves.
- Stale-but-visible sections do not show misleading “fresh” state.
- Failed refreshes preserve last known good data.

### Tests

Add or update tests for:

```text
dashboard-data-store.test.mjs
  - updates slices
  - emits only changed slices
  - marks stale/error/loading correctly
  - preserves last good data on error
  - tracks planningGeneration

dashboard-pollers.test.mjs
  - starts/stops pollers
  - enforces single-flight
  - does not poll hidden heavy slices
  - refreshes critical slices within configured interval
  - pauses during mutation suppression

dashboard-targeted-invalidation.test.mjs
  - affected mutation kinds mark expected slices stale
  - visible sections refresh immediately
  - hidden sections remain stale until activated

dashboard-ui-interaction-locks.test.mjs
  - refreshes defer during interaction locks
  - deferred refresh flushes after lock clears
```

### Instrumentation

Add a dashboard load trace that can answer:

```text
Which slice took longest?
Which command caused the slow refresh?
Was the delay queue wait, CLI spawn, query/build, render, or postMessage?
Did a mutation preempt a refresh?
Did stale data remain visible?
```

---

# Option 2: Long-Lived Dashboard Read Service / Daemon

## Recommendation

Implement Option 2 after Option 1.

Option 2 should replace the poller read implementation, not the UI/store abstraction.

If Option 1 is done correctly, Option 2 becomes mostly an internal source swap:

```text
Option 1:
CLI poller → DashboardDataStore → webview

Option 2:
Dashboard read service/event stream → DashboardDataStore → webview
```

---

## Option 2 Goal

Create a long-lived dashboard read-side service that:

- Keeps SQLite connections warm.
- Avoids repeated CLI process spawn.
- Maintains a current dashboard snapshot.
- Watches file/SQLite/task-state changes.
- Pushes or exposes small data slices.
- Provides sub-second local reads for most dashboard sections.
- Keeps the dashboard synchronized within 10 seconds or less.
- Preserves CLI authority for mutations.

---

## Service Placement Options

### Option 2A: Extension-host service

Run the dashboard read service inside the Cursor extension host.

Pros:
- Fastest to implement after Option 1.
- No extra process lifecycle.
- Can directly feed `DashboardDataStore`.
- Less IPC complexity.

Cons:
- Native SQLite compatibility can be tricky inside extension host.
- Current code intentionally uses external Node for `better-sqlite3` ABI compatibility.
- A heavy extension-host service can impact editor responsiveness.

### Option 2B: Workspace-kit service process

Start a long-lived service process through `workspace-kit start` or a new launcher.

Pros:
- Uses proper Node/runtime stamp.
- Keeps SQLite and better-sqlite3 in the expected runtime.
- Clean separation between editor and kit backend.
- Better long-term architecture.

Cons:
- Requires service lifecycle management.
- Requires IPC/HTTP protocol.
- More failure modes.

### Preferred Option

Prefer **2B: Workspace-kit service process** for the final architecture.

It aligns with Workflow Cannon as a real operating layer behind chat and dashboard surfaces.

---

## Service Responsibilities

The service should:

1. Open and reuse task/planning SQLite connections safely.
2. Watch relevant files and task-state changes.
3. Maintain a `DashboardSnapshot`.
4. Maintain per-slice freshness metadata.
5. Expose read endpoints or IPC messages.
6. Emit events when slices change.
7. Keep expensive slices separate from critical slices.
8. Never bypass CLI/policy mutation rules.
9. Support versioned contracts.
10. Degrade gracefully when unavailable.

---

## Transport Choices

### Preferred: local HTTP server bound to localhost

Example endpoints:

```text
GET /health
GET /dashboard/snapshot
GET /dashboard/slices/overview
GET /dashboard/slices/queue
GET /dashboard/slices/status
GET /dashboard/slices/phase-journal
GET /dashboard/events
POST /dashboard/refresh
```

Use Server-Sent Events for updates:

```text
GET /dashboard/events
```

Example event:

```json
{
  "type": "dashboard.slice.updated",
  "slice": "queue",
  "generation": 42,
  "updatedAt": "2026-05-29T21:00:00.000Z"
}
```

### Alternative: stdio IPC

Good if you want no port management, but HTTP/SSE is easier to inspect and debug.

---

## Service Snapshot Contract

Create shared contracts:

```text
src/contracts/dashboard-snapshot.ts
src/contracts/dashboard-events.ts
```

Suggested shape:

```ts
export type DashboardServiceSnapshot = {
  schemaVersion: 1;
  serviceVersion: string;
  generatedAt: string;
  generation: number;
  planningGeneration: number | null;
  slices: Record<string, {
    status: "empty" | "loading" | "fresh" | "stale" | "error";
    updatedAt: string | null;
    source: string;
    value: unknown;
    error?: string;
  }>;
};

export type DashboardServiceEvent =
  | {
      type: "dashboard.snapshot.updated";
      generation: number;
      changedSlices: string[];
      updatedAt: string;
    }
  | {
      type: "dashboard.slice.updated";
      generation: number;
      slice: string;
      updatedAt: string;
    }
  | {
      type: "dashboard.service.error";
      message: string;
      code?: string;
    };
```

---

## Service Polling / Watching Model

The service can still use pollers internally, but without CLI process spawn.

Recommended watchers:

```text
Task store watcher
  - watches task-state SQLite/event log metadata
  - invalidates overview/queue/phase/agent slices

Planning SQLite watcher
  - watches planning generation / ideas / phase journal
  - invalidates ideas/phaseJournal/plan artifacts

Config watcher
  - invalidates status/config/agent guidance

Git task-state watcher
  - invalidates taskStateProjection/status

Manual refresh endpoint
  - forces selected slices
```

Internal refresh intervals:

```text
critical slices: 1–2s or event-driven
queue slices: 3–5s
ops slices: 5–10s
status slices: 30s or event/manual
heavy slices: on demand
```

Because connections stay warm, these intervals become much safer.

---

## Extension Integration for Option 2

Do not rewrite the webview again.

`DashboardDataStore` should support pluggable sources:

```ts
export interface DashboardDataSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  refreshSlice(name: DashboardSliceName): Promise<void>;
  getSnapshot(): Promise<DashboardSnapshot>;
  subscribe?(listener: (event: DashboardServiceEvent) => void): vscode.Disposable;
}
```

Option 1 source:

```ts
class CliPollingDashboardDataSource implements DashboardDataSource
```

Option 2 source:

```ts
class ServiceDashboardDataSource implements DashboardDataSource
```

Then the provider/store does not care whether data came from CLI pollers or service events.

---

## Service Lifecycle

Add commands:

```text
workspace-kit dashboard-service start
workspace-kit dashboard-service stop
workspace-kit dashboard-service status
workspace-kit dashboard-service snapshot
```

Or under `wk run` if you want to preserve the command router model:

```text
workspace-kit run dashboard-service-start '{}'
workspace-kit run dashboard-service-status '{}'
workspace-kit run dashboard-service-snapshot '{}'
```

Recommended runtime metadata:

```text
.workspace-kit/dashboard-service/runtime.json
.workspace-kit/dashboard-service/service.log
.workspace-kit/dashboard-service/service.pid
```

Example runtime metadata:

```json
{
  "schemaVersion": 1,
  "pid": 12345,
  "port": 43117,
  "startedAt": "2026-05-29T21:00:00.000Z",
  "workspaceRoot": "/path/to/repo",
  "version": "0.0.0"
}
```

---

## Option 2 Fallback Behavior

The extension should gracefully fall back to Option 1.

Startup behavior:

```text
Try service health check.
If service healthy:
  use ServiceDashboardDataSource.
If service unavailable:
  use CliPollingDashboardDataSource.
Optionally prompt user to start service.
```

Manual fallback command:

```text
Workflow Cannon: Restart Dashboard Service
Workflow Cannon: Use CLI Dashboard Refresh Mode
```

---

## Option 2 Acceptance Criteria

### Performance

- Extension receives a usable dashboard snapshot in under 1 second when service is warm.
- Cold service start plus first snapshot completes in under 5 seconds for normal workspaces.
- Critical slices update within 2 seconds.
- Visible slices update within 10 seconds.
- Dashboard refresh does not spawn repeated CLI processes during normal operation.

### Reliability

- Service restarts cleanly.
- Extension falls back to CLI polling when service is unavailable.
- Service does not bypass policy/mutation command paths.
- SQLite connections are read-safe and do not block mutation transactions for long.
- Snapshot contract is versioned.

### Observability

Service exposes:

```text
health
uptime
last refresh by slice
last error by slice
average refresh duration by slice
current generation
planningGeneration
data source mode
```

### Tests

Add tests for:

```text
dashboard-service-snapshot.test.ts
dashboard-service-events.test.ts
dashboard-service-lifecycle.test.ts
dashboard-service-fallback.test.mjs
dashboard-data-source-switch.test.mjs
```

---

# Implementation Sequence

## Step 1: Instrument current dashboard

Add timing traces around:

```text
dashboard-summary overview
dashboard-summary queue
dashboard-summary status
cae-authoring-summary
list-phase-notes
get-phase-context
list-tasks lazy bucket calls
render root
postMessage section patch
queue wait time
CLI execution time
```

Output:

```text
Dashboard Load Trace
- command
- args/projection
- queuedAt
- startedAt
- completedAt
- durationMs
- ok/code
- section/slice
```

## Step 2: Create slice registry and snapshot types

Add the data-slice layer without changing behavior yet.

## Step 3: Create DashboardDataStore

Add tests. Feed it manually from existing `pushUpdate` initially.

## Step 4: Move current refresh results into DashboardDataStore

Keep existing rendering but source from snapshot.

## Step 5: Add critical/queue/status pollers

Start with:

```text
CriticalPoller: overview every 2s
QueuePoller: queue every 5s
StatusPoller: status visible-only or 30s
```

## Step 6: Replace 45-second global poll

Remove or downgrade the existing 45-second `pushNow` interval after targeted pollers are active.

## Step 7: Add smaller projections or commands

At minimum:

```text
critical
ideas
phase
agentOps
systemLight
```

Better:

```text
dashboard-overview
dashboard-queue-summary
dashboard-ideas-summary
dashboard-phase-summary
dashboard-agent-ops-summary
dashboard-system-summary
```

## Step 8: Implement stale/fresh UI markers

Every visible section should expose last updated time and stale/error state.

## Step 9: Add mutation invalidation to slices

Map each mutation kind to affected slices.

Example:

```text
task-queue mutation:
  stale: overview, queue, phase, agent

idea mutation:
  stale: ideas, overview

phase-journal mutation:
  stale: phaseJournal, phase, queue

config mutation:
  stale: status, config, agent

cae mutation:
  stale: cae, status
```

## Step 10: Stabilize Option 1

Measure:

```text
first shell paint
first overview data
first queue data
all visible slices fresh
mutation recovery time
blocked transaction frequency
```

Only after this is stable, start Option 2.

---

# Option 2 Sequence

## Step 1: Define service contracts

Add:

```text
src/contracts/dashboard-snapshot.ts
src/contracts/dashboard-events.ts
```

## Step 2: Implement service behind feature flag

Example config:

```json
{
  "dashboard": {
    "dataSource": "cli-polling"
  }
}
```

Allowed values:

```text
cli-polling
service
auto
```

## Step 3: Implement service process

Add:

```text
src/services/dashboard-service/
```

Suggested files:

```text
src/services/dashboard-service/server.ts
src/services/dashboard-service/snapshot-store.ts
src/services/dashboard-service/slice-refreshers.ts
src/services/dashboard-service/watchers.ts
src/services/dashboard-service/routes.ts
src/services/dashboard-service/events.ts
```

## Step 4: Add service lifecycle commands

Add start/stop/status/snapshot commands.

## Step 5: Add extension-side ServiceDashboardDataSource

Add:

```text
extensions/cursor-workflow-cannon/src/views/dashboard/service-dashboard-data-source.ts
```

## Step 6: Auto mode

In `auto` mode:

```text
try service
fallback to cli-polling
surface mode badge
```

## Step 7: Promote service after reliability

Once stable, make `auto` the default.

---

# Important Guardrails

## Do not make the dashboard store authoritative for mutations

The dashboard store is read-side only.

All writes remain governed by existing Workflow Cannon command/policy paths.

## Do not lower polling intervals blindly

Do not simply change the existing poll from 45 seconds to 5 seconds. That could worsen blocking with the current CLI process model.

## Do not keep expanding full dashboard-summary

Full `dashboard-summary` should become a compatibility/debug endpoint, not the normal live dashboard refresh path.

## Do not blank sections during refresh

Keep last known good data visible. Mark it stale or refreshing.

## Do not let hidden heavy sections dominate refresh time

CAE, config, doctor/system status, and phase journal details should be visible-only or lower frequency.

## Do not lose planningGeneration

Any slice payload that contains planning generation must update the shared planning-generation cache/store.

---

# Definition of Done

## Option 1 Done

- Dashboard shell paints immediately.
- Overview usable under 5 seconds.
- Queue/ideas/phase state fresh within 10 seconds.
- Visible sections have freshness indicators.
- Refreshes are slice-based, not one global `pushUpdate`.
- Mutations preempt/pause pollers and refresh affected slices after completion.
- Failed refreshes preserve last good data.
- Tests cover store, pollers, invalidation, stale states, and mutation suppression.
- Dashboard data map exists and is updated.

## Option 2 Done

- Long-lived dashboard read service exists behind feature flag.
- Extension can use service or fallback to CLI polling.
- Service exposes health/snapshot/events.
- Warm service returns snapshot under 1 second.
- Critical updates flow to dashboard within 2 seconds.
- Visible dashboard data stays fresh within 10 seconds.
- Service does not bypass mutation/policy model.
- Observability exposes per-slice timing and errors.

---

# Strong Recommendation

Implement Option 1 as an abstraction boundary, not a one-off performance patch.

The key design is:

```text
DashboardDataStore + slice freshness model + targeted pollers
```

Then Option 2 becomes:

```text
replace CLI poller source with dashboard service source
```

That lets Workflow Cannon evolve toward a serious live dashboard architecture without rewriting the UI twice.
