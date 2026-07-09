# Workflow Cannon Dashboard Loading and Sync Remediation Report

## Summary

The dashboard loading problem appears to be less about one slow query and more about a brittle multi-read-path startup and synchronization system. The current dashboard can read through direct startup summaries, the dashboard service, service-side targeted refresh, extension CLI pollers, kit-state watcher refreshes, mutation invalidation refreshes, cached partial summaries, and manual refresh.

That creates ambiguous data ownership. Manual refresh often appears to fix the issue because it bypasses that ambiguity and forces a known refresh path.

The best remediation path is to simplify ownership:

```text
one startup controller
one authoritative read owner
one dashboard store
mutation patches first
background reconciliation second
```

---

## 1. Startup races before the read path is settled

### Brief description

The dashboard paints the shell immediately, starts the read-path coordinator asynchronously, and simultaneously triggers startup rendering. The webview can also trigger additional startup renders from boot, ready, timeout, and manual startup refresh messages.

This creates several competing startup paths before the dashboard knows whether it should read from the service or CLI fallback. The visible symptom is a shell that says it is loading while the actual ownership of the data path is still unsettled.

### Best path forward

Make startup a single deterministic pipeline:

```text
paint shell
resolve read path
fetch one bootstrap snapshot
hydrate root
enable background hydration
```

Introduce a dedicated `DashboardStartupController` with an explicit state machine:

```text
idle → shell-painted → bootstrap-loading → hydrated → background-hydrating → ready/error
```

Webview boot, ready, timeout, and refresh messages should not directly invoke full startup renders. They should report diagnostics or request a retry through the same startup controller.

The dashboard should have exactly one startup owner and one startup promise.

---

## 2. Dashboard service startup is on the critical UI path

### Brief description

Auto mode may spend up to 30 seconds trying to start and health-check the dashboard service before falling back. That directly matches the observed behavior where the dashboard says it is still loading, never finishes, or only recovers after manual refresh.

The service is useful, but cold service startup should not be a prerequisite for the first usable dashboard paint.

### Best path forward

Move service startup off the critical paint path.

The dashboard should first render from the fastest available source:

1. cached last snapshot, if available
2. lightweight CLI/bootstrap snapshot
3. service snapshot, only if already healthy
4. service promotion in the background

Starting the warm service should be treated as a background optimization. If the service becomes healthy later, switch the read path quietly and patch slices through the store.

The first user-visible dashboard paint should never wait on detached service startup or service runtime-file negotiation.

---

## 3. Pollers are slice-based, but several slices share the same underlying commands

### Brief description

Multiple dashboard slices independently invoke the same or similar command paths. The poller is single-flight per slice, not per underlying command and argument set.

That means different slices can produce redundant reads, mismatched generations, and out-of-order section updates even when they depend on the same source payload.

For example, overview-like slices should not each cause separate equivalent reads.

### Best path forward

Introduce command-level fanout.

Instead of this model:

```text
overview slice → dashboard-overview-slice
phase slice → dashboard-overview-slice
agent slice → dashboard-overview-slice
```

Use this model:

```text
dashboard-overview-slice → overview + phase + agent + related metadata
```

Refactor polling around command execution, not slice identity:

```text
poll group → execute minimal command set → fan out results into store slices
```

This reduces duplicate work and makes generation consistency easier to reason about.

---

## 4. Store equality depends on `JSON.stringify`

### Brief description

The dashboard store suppresses duplicate updates by stringifying entire slice payloads. This is expensive for large payloads and unstable when object key order or incidental array order changes.

It can cause unnecessary store updates, section rendering, and DOM patches even when the displayed data has not meaningfully changed.

This is likely a hidden source of UI churn.

### Best path forward

Replace generic deep string comparison with per-slice fingerprints.

Each slice builder should emit a stable `fingerprint` or `revision` derived only from meaningful display data.

Example:

```ts
{
  value,
  revision: "queue:planningGen=42:ready=8:proposed=3:blocked=1:hash=..."
}
```

Then the store update rule becomes:

```text
if previous.revision === next.revision and status unchanged, do nothing
```

The queue fingerprint pattern already points in the right direction. Generalize that approach across all slices.

---

## 5. Mutation invalidation marks slices stale, then relies on refresh reconciliation

### Brief description

CRUD operations appear to write data, mark affected slices stale, pause pollers, patch visible sections, and then force a refresh through either the service or CLI path.

If that refresh is paused, preempted, slow, or fails, the UI can remain stale or loading until manual refresh. This makes manual refresh act as a recovery mechanism for mutation sync rather than a user convenience.

### Best path forward

Make mutations return authoritative dashboard patch data.

The flow should be:

```text
mutation
authoritative patch
update store
render affected sections
background reconcile
```

For CRUD operations, mutation results should include enough information to update the dashboard store immediately.

Example mutation response shape:

```ts
{
  ok: true,
  mutationId,
  changedSlices: {
    queue: { patch /* or fullSlice */ },
    overview: { patch /* or fullSlice */ },
    phase: { patch /* or fullSlice */ }
  },
  planningGeneration
}
```

Do not make the dashboard rediscover the truth after every write. Rediscovery should be a safety check, not the primary UI update mechanism.

---

## Recommended remediation sequence

### Phase 1: Stabilize first paint

Remove service startup from the critical dashboard startup path.

Create a `DashboardStartupController` and make it the only owner of startup, retries, timeout handling, and webview boot/ready coordination.

Target result:

```text
The dashboard always paints usable overview data quickly, even if the service is cold or broken.
```

---

### Phase 2: Establish one authoritative read owner

Pick one source of truth for dashboard reads.

Recommended model:

```text
Dashboard service owns the store when available.
CLI is bootstrap/fallback only.
```

The extension should not treat service push sync, CLI pollers, direct dashboard-summary calls, kit-state refreshes, and manual patch reads as equivalent authorities.

Target architecture:

```text
service snapshot/SSE → DashboardDataStore → renderer
```

Fallback architecture:

```text
CLI bootstrap → DashboardDataStore → renderer
```

Once the service is active, CLI reads should only run when the service is explicitly unhealthy or unavailable.

---

### Phase 3: Fan out shared reads

Refactor pollers around command execution instead of slice identity.

One shared source read should update all dependent slices in the store. This should reduce startup and steady-state churn substantially.

Target result:

```text
fewer reads
fewer generation mismatches
fewer out-of-order patches
less webview churn
```

---

### Phase 4: Make CRUD optimistic and authoritative

Every dashboard mutation should return a structured patch result that can update the dashboard store immediately.

The dashboard should apply mutation patches first, then reconcile in the background.

Target result:

```text
CRUD feels instant.
Manual refresh is no longer required to recover from normal mutations.
```

---

### Phase 5: Replace deep payload comparison with slice revisions

Give each slice a stable revision or fingerprint.

The store should compare revisions instead of serializing whole payloads.

Target result:

```text
less CPU work
fewer unnecessary section patches
more predictable UI refresh behavior
```

---

## Best possible end-state

The ideal dashboard architecture is:

```text
Webview
  ↓ user intent
Extension host
  ↓ mutation/read request
Dashboard service
  ↓ snapshot events / mutation patches
DashboardDataStore
  ↓ section patch rendering
Webview DOM
```

With only one fallback:

```text
If service unavailable:
CLI bootstrap → DashboardDataStore → Webview
```

The current system has too many parallel recovery mechanisms. The remediation path is not adding another cache or timeout. It is simplifying ownership:

```text
one startup controller
one read owner
one store
mutation patches first
reconciliation second
```
