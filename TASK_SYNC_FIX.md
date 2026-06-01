# TASK_SYNC_FIX.md

**Artifact:** `TASK_SYNC_FIX.md` (repo root)

## Scope

This is the planner-ready WBS for stabilizing Workflow Cannon task/planning sync across branches, startup sync, hydrate/rebuild/apply cycles, queue-mode canonical publishing, and multi-worktree agent activity.

The core bug class is projection loss:

```text
local SQLite contains task/planning rows
canonical git event stream does not yet contain the matching events
hydrate/rebuild/apply replaces local projection from canonical stream
the local-only rows disappear
```

This plan prevents that by treating SQLite as a cache plus local outbox, not as a branch-portable database.

---

## 1. Product goal / success standard

Workflow Cannon should safely support this loop:

```text
Agent or human creates/updates tasks or planning rows
→ canonical events are published immediately or queued locally
→ branch changes, startup sync, hydrate, rebuild, and dashboard refresh may occur
→ local pending work remains visible and recoverable
→ canonical remote state and local pending overlay reconcile cleanly
→ no task disappears unless an explicit supported removal/supersession flow exists
```

Success means:

```text
No task or planning row is silently dropped by sync.
Local pending work survives startup sync and branch changes.
Hydrate/rebuild/apply is safe in queue-mode workflows.
Task ID allocation refuses stale state.
The extension sync coordinator obeys sync safety state instead of blindly hydrating.
Agents have an explicit flush/publish path before hydrate/branch/closeout.
```

---

## 2. Source-of-truth hierarchy

```text
Canonical event log        = published source of truth for accepted task/planning events
Canonical outbox           = durable local source of truth for unpublished local events
Remote projection          = cache rebuilt from canonical event log only
Local pending overlay      = replay of unpublished local outbox events
Effective projection       = remote projection + local pending overlay; used for reads/dashboard
Local SQLite tables        = projection/cache, not sole authority
Git/code branches          = code history, not task-state authority
Dashboard/extension views  = read surfaces, not source of truth
```

Important rule:

```text
Do not sync the database across branches.
Sync canonical events.
Rebuild projections.
Preserve local pending event overlays.
Never let hydrate overwrite unpublished local events.
```

---

## 3. Non-goals / constraints

| Constraint | Decision |
| --- | --- |
| Replace git-event-log immediately | No. Stabilize current architecture first. |
| Implement hosted canonical backend now | No. Track as future work only. |
| Rewrite the whole Task Engine | No. Add safety, overlay, and projection discipline. |
| Treat SQLite as branch-portable canonical DB | No. SQLite remains projection/cache plus local outbox. |
| Allow hydrate to overwrite local pending rows | No. This is the bug class being fixed. |
| Add normal task delete semantics | No. If task rows disappear without explicit supported event, treat as unsafe. |
| Let extension background/startup sync choose replacement operations blindly | No. It must obey status/recommendedAction/outbox safety. |
| Allocate T### IDs from stale projections | No. Guard allocation until sync is safe. |
| Solve all multi-agent orchestration issues here | No. This is foundational stability work needed before deeper orchestration. |

---

## 4. Architecture anchors

### 4.1 Remote base + local pending overlay

```text
remote_projection
  derived from canonical git event log

local_pending_overlay
  derived from canonical_event_outbox rows that are pending, publishing, failed, or conflict

effective_projection
  remote_projection + local_pending_overlay
```

All normal reads should use the effective projection. Hydrate/rebuild may update remote projection, but must not erase local pending overlay.

### 4.2 Sync safety before projection replacement

Before any command replaces task/planning projection tables, it must check:

```text
outbox.pending === 0
outbox.publishing === 0
outbox.failed === 0
outbox.conflict === 0
projectionMeta.syncStatus is not conflict/corrupt
new projection would not drop existing local task IDs unexpectedly
```

If unsafe, fail closed with an agent-readable error.

### 4.3 Explicit flush/publish path

Blocking unsafe hydrate is not enough. Agents and the extension need a clean next action:

```text
task-state-status says local-ahead / run-publish / wait
→ run explicit flush/publish command
→ verify outbox is clean or conflict is surfaced
→ then hydrate/rebuild/branch/closeout may proceed
```

### 4.4 Branch/worktree/startup safety

Git HEAD changes and extension/workspace startup should trigger status checks, not immediate hydrate.

```text
sync requested because HEAD changed or workspace opened
→ task-state-status fetch:true
→ if outbox dirty: do not hydrate; surface local-ahead/wait/run-publish
→ if conflict: surface repair required
→ if clean and behind: hydrate
→ if none: no-op/apply safe tail
```

### 4.5 Planning persistence must be non-replacing by default

Planning projection persistence should use `merge-preserve-local` by default and reserve `repair-replace` for explicit repair paths.

Planning domains:

```text
phase_catalog
workspace_status
phase_notes
phase_note_suggestions
ideas
module_state
```

Planning mutations in git-canonical mode must not create silent SQLite-only rows. They must publish/enqueue canonical planning events or mark rows as pending local overlay state.

### 4.6 Repair replacement must be explicit and policy-gated

Normal hydrate/rebuild/apply must never use repair-replace semantics.

```text
repair-replace requires explicit repair command or flag + policyApproval + clear operator-facing warning
```

### 4.7 Failed/conflict overlay events are visible but not clean

```text
pending/publishing overlay rows = local-ahead effective state
failed/conflict overlay rows = visible at-risk local state requiring repair/retry
```

### 4.8 Projection metadata invariants

```text
remoteAppliedSequence must never move backward except explicit repair
effectiveAppliedSequence >= remoteAppliedSequence when local overlay exists
sourceCommit/sourceRef/headSha should be recorded for remote projection
lastCanonicalEventId should be recorded when available
local overlay count/status should be recorded
```

---

## 5. Recommended delivery phases

Use exactly three planner-facing phases.

| Phase | Theme | Exit criteria |
| --- | --- | --- |
| **Phase 1 — Data-Loss Hotfix & Safety Gates** | Inventory, safety contracts, sync guard, dirty-outbox blocking, would-drop detection, extension/startup coordinator safety, explicit flush path, regression tests | Hydrate/rebuild/apply cannot drop local pending tasks; extension/startup sync does not hydrate while outbox is dirty; agents can flush/publish or receive repair guidance; tests reproduce and prevent the bug. |
| **Phase 2 — Effective Projection Overlay** | Remote projection + local pending overlay, outbox replay as local event source, status metadata, invariant checks, safe hydrate/apply semantics | Reads can include pending local work; hydrate updates remote base without erasing overlay; status distinguishes remote/effective/local-ahead/conflict; metadata invariants catch stale/corrupt projections. |
| **Phase 3 — Planning Merge Safety & Branch Hardening** | Non-replacing planning persistence, domain-level sync posture, branch/worktree guards, task ID allocation guard, multi-worktree E2E, repair docs | Planning rows are preserved unless explicitly repaired; branch changes are guarded; stale task ID allocation is blocked; branch-heavy and multi-worktree E2E prove stability. |

---

## 6. Required human-reviewed artifacts

| ID | Artifact | What it must contain | Produced by | Blocks |
| --- | --- | --- | --- | --- |
| **A-INV** | Task/planning sync surface inventory | hydrate/rebuild/apply/publish/outbox/status/extension/startup/planning paths; replacement points; task-drop repro; branch/startup triggers | T-TSF-000 | A-ARCH, A-SAFETY, implementation |
| **A-ARCH** | Sync stabilization architecture note | remote projection vs overlay; outbox semantics; failed/conflict overlay rules; metadata invariants; future hosted backend note | T-TSF-010 | Phase 2/3 implementation |
| **A-SAFETY** | Sync safety contract | dirty outbox rules; would-drop detection; failure codes; command behavior; repair boundary; data returned to agents | T-TSF-020 | T-TSF-110, T-TSF-120, T-TSF-130 |
| **A-STATUS** | Task-state status contract update | recommendedAction, outbox, localProjection, remote/effective sequence, pending count, overlay status, dropRisk, syncSafety, source commit/ref, last canonical event | T-TSF-030 | T-TSF-140, T-TSF-170, T-TSF-230, T-TSF-250 |
| **A-PLANNING** | Planning merge-safety design | persistence modes; domain posture; pending planning rows; no silent SQLite-only planning mutations | T-TSF-040 | T-TSF-310, T-TSF-320 |
| **A-BRANCH** | Branch/worktree/startup guard design | checkout/merge/rebase/closeout/startup behavior; HEAD listener behavior; remediation wording; repair path | T-TSF-050 | T-TSF-140, T-TSF-170, T-TSF-330, T-TSF-340 |
| **A-TEST** | Regression and E2E test strategy | bug repro; outbox states; startup; branch; multi-worktree; extension coordinator; planning preservation; task ID stale-state tests | T-TSF-060 | All implementation phases |
| **A-COMPAT** | Compatibility/migration note | existing git-event-log behavior; queue mode behavior; old projection metadata fallback; operator impact | T-TSF-070 | Phase 2/3 implementation |

---

## 7. Work Breakdown Structure

### T-TSF-000 — Inventory current task/planning sync surfaces

**Phase:** Phase 1  
**Type:** research / inventory  
**Priority:** P0  
**Severity:** Critical  
**Produces:** A-INV

Inventory hydrate, rebuild, apply, publish/outbox, status, extension coordinator, startup sync, Git HEAD listener, planning persistence, task ID allocation, planning draft persistence, and current tests.

**Acceptance criteria:** destructive projection paths, task-drop reproduction, startup/branch triggers, and reusable utilities are documented.

### T-TSF-010 — Draft sync stabilization architecture note

**Phase:** Phase 1  
**Type:** architecture  
**Priority:** P0  
**Severity:** Critical  
**Requires:** A-INV  
**Produces:** A-ARCH

Define source-of-truth hierarchy, overlay architecture, safety rules, planning merge strategy, branch/startup guard, failed/conflict overlay semantics, projection metadata invariants, and future hosted backend note.

### T-TSF-020 — Draft sync safety contract

**Phase:** Phase 1  
**Type:** contract / safety  
**Priority:** P0  
**Severity:** Critical  
**Requires:** A-INV  
**Produces:** A-SAFETY

Define dirty outbox detection, would-drop detection, conflict/corrupt behavior, repair boundary, dry-run behavior, and remediation text.

Suggested codes:

```text
task-state-outbox-dirty
task-state-projection-would-drop-local-tasks
task-state-local-conflict
task-state-sync-repair-required
task-state-repair-requires-policy-approval
```

### T-TSF-030 — Draft task-state status contract update

**Phase:** Phase 1  
**Type:** command contract  
**Priority:** P0  
**Severity:** High  
**Requires:** A-SAFETY  
**Produces:** A-STATUS

Define status fields for safe CLI/dashboard/extension decisions, including recommendedAction, outbox counts, localProjection, remote/effective sequences, overlay status, dropRisk, syncSafety, source commit/ref, and last canonical event.

### T-TSF-040 — Draft planning merge-safety design

**Phase:** Phase 1  
**Type:** architecture / persistence design  
**Priority:** P0  
**Severity:** High  
**Requires:** A-INV, A-ARCH  
**Produces:** A-PLANNING

Define `merge-preserve-local`, `replace-safe`, and `repair-replace`; domain defaults; local pending row behavior; canonical planning mutation requirements; and tests.

### T-TSF-050 — Draft branch/worktree/startup guard design

**Phase:** Phase 1  
**Type:** workflow / command contract  
**Priority:** P1  
**Severity:** High  
**Requires:** A-SAFETY, A-STATUS  
**Produces:** A-BRANCH

Define branch preflight, startup sync behavior, HEAD listener behavior, dirty/failed/conflict outbox handling, remediation, and block/warn policy.

### T-TSF-060 — Draft regression and E2E test strategy

**Phase:** Phase 1  
**Type:** test strategy  
**Priority:** P0  
**Severity:** Critical  
**Requires:** A-SAFETY, A-STATUS  
**Produces:** A-TEST

Cover pending/failed/conflict outbox, hydrate/rebuild/apply guards, startup sync, HEAD change, flush/publish, planning preservation, task ID guard, metadata invariants, multi-worktree concurrency, and clean hydrate.

### T-TSF-070 — Draft compatibility and migration note

**Phase:** Phase 1  
**Type:** compatibility  
**Priority:** P1  
**Severity:** Medium  
**Requires:** A-ARCH  
**Produces:** A-COMPAT

Document config compatibility, queue mode behavior, old metadata fallback, repair guidance, and operator-facing changes.

### T-TSF-110 — Add shared task-state sync safety utility

**Phase:** Phase 1  
**Type:** implementation / safety  
**Priority:** P0  
**Severity:** Critical  
**Requires:** A-SAFETY, A-TEST

Likely files:

```text
src/modules/task-engine/persistence/task-state-sync-safety.ts
test/task-state-sync-safety.test.mjs
```

Implement dirty outbox checks, projection conflict checks, local-vs-next task ID comparison, pending touched task detection, would-drop detection, and at-risk overlay diagnostics.

### T-TSF-120 — Guard hydrate/rebuild/apply projection replacement

**Phase:** Phase 1  
**Type:** implementation / runtime safety  
**Priority:** P0  
**Severity:** Critical  
**Requires:** T-TSF-110, A-SAFETY

Likely files:

```text
src/modules/task-engine/persistence/task-state-hydrate-runtime.ts
src/modules/task-engine/persistence/rebuild-task-state-cache-runtime.ts
src/modules/task-engine/persistence/apply-task-state-events-runtime.ts
```

Before projection persistence, read local IDs, read outbox status, compute next IDs, call safety utility, and fail closed if unsafe.

### T-TSF-130 — Add task-drop regression tests

**Phase:** Phase 1  
**Type:** testing  
**Priority:** P0  
**Severity:** Critical  
**Requires:** T-TSF-120, A-TEST

Tests must prove queued local task creation cannot disappear after hydrate/rebuild/apply, including failed/conflict outbox and repair policy cases.

### T-TSF-140 — Update extension sync coordinator to obey status safety

**Phase:** Phase 1  
**Type:** implementation / extension runtime  
**Priority:** P0  
**Severity:** High  
**Requires:** A-STATUS, A-BRANCH, A-TEST

Likely files:

```text
extensions/cursor-workflow-cannon/src/runtime/task-state-sync-coordinator.ts
extensions/cursor-workflow-cannon/src/runtime/git-task-state-sync-listener.ts
```

Coordinator must obey recommendedAction/outbox/localProjection/syncSafety and skip hydrate when unsafe.

### T-TSF-150 — Add task ID allocation freshness guard

**Phase:** Phase 1  
**Type:** implementation / safety  
**Priority:** P1  
**Severity:** High  
**Requires:** A-STATUS, A-SAFETY, A-TEST

Before `allocateId:true` in git-canonical workspaces, require safe/fresh sync posture. Fail with `task-id-allocation-requires-fresh-sync` when stale or dirty.

### T-TSF-160 — Add explicit task-state flush/publish command path

**Phase:** Phase 1  
**Type:** implementation / command  
**Priority:** P0  
**Severity:** High  
**Requires:** A-STATUS, A-SAFETY, A-TEST

Add or clarify a command path to publish pending outbox rows. It must be idempotent and report published/skipped/failed/conflict counts.

### T-TSF-170 — Add startup/open-workspace sync safety behavior

**Phase:** Phase 1  
**Type:** implementation / extension runtime  
**Priority:** P0  
**Severity:** High  
**Requires:** A-BRANCH, A-STATUS, A-TEST

On extension activation/workspace open, use the same status-driven safety behavior as Git HEAD sync.

### T-TSF-210 — Add effective task projection builder

**Phase:** Phase 2  
**Type:** implementation / projection  
**Priority:** P0  
**Severity:** Critical  
**Requires:** A-ARCH, A-COMPAT, A-TEST

Likely files:

```text
src/modules/task-engine/persistence/task-state-effective-projection.ts
test/task-state-effective-projection.test.mjs
```

Build remote projection + local overlay + effective document helper. Conflict overlay must remain visible and at-risk.

### T-TSF-220 — Use outbox rows as local pending event source

**Phase:** Phase 2  
**Type:** implementation / persistence  
**Priority:** P0  
**Severity:** High  
**Requires:** T-TSF-210

Add helpers to read pending, publishing, failed, and conflict outbox events in deterministic order. Published rows are excluded by default.

### T-TSF-230 — Update hydrate/status to persist and report effective projection

**Phase:** Phase 2  
**Type:** implementation / runtime  
**Priority:** P0  
**Severity:** Critical  
**Requires:** T-TSF-210, T-TSF-220, A-STATUS

Hydrate should fetch canonical state, build remote projection, replay pending local outbox events, persist effective task view, and record remote/effective/local overlay metadata.

### T-TSF-240 — Update apply/rebuild semantics for overlay model

**Phase:** Phase 2  
**Type:** implementation / runtime  
**Priority:** P1  
**Severity:** High  
**Requires:** T-TSF-230

Apply/rebuild must distinguish remote canonical rebuild, effective projection persistence, and explicit repair replacement.

### T-TSF-250 — Add projection metadata invariant checks

**Phase:** Phase 2  
**Type:** implementation / metadata safety  
**Priority:** P1  
**Severity:** High  
**Requires:** A-STATUS, T-TSF-230

Enforce/report sequence, source commit/ref, last event, and overlay status invariants. Violations surface as unsafe/conflict unless an explicit repair flow is used.

### T-TSF-310 — Add planning persistence modes

**Phase:** Phase 3  
**Type:** implementation / planning persistence  
**Priority:** P0  
**Severity:** High  
**Requires:** A-PLANNING, A-TEST

Likely file:

```text
src/modules/task-engine/task-state-events/planning-sqlite-persist.ts
```

Add merge-preserve-local, replace-safe, and repair-replace. Normal hydrate/apply uses merge-preserve-local.

### T-TSF-320 — Add planning domain sync posture metadata

**Phase:** Phase 3  
**Type:** implementation / metadata  
**Priority:** P1  
**Severity:** Medium  
**Requires:** A-PLANNING, T-TSF-310

Track domain-level remoteAppliedSequence, localPendingCount, lastCanonicalEventId, syncStatus, and replaceSafe.

### T-TSF-330 — Add branch/worktree sync preflight

**Phase:** Phase 3  
**Type:** implementation / command safety  
**Priority:** P0  
**Severity:** High  
**Requires:** A-BRANCH, A-STATUS

Preflight checkout, merge, rebase, phase closeout, and release branch merge. Block or escalate dirty/conflicted task-state sync.

### T-TSF-340 — Add branch-heavy E2E regression fixtures

**Phase:** Phase 3  
**Type:** E2E / regression  
**Priority:** P0  
**Severity:** High  
**Requires:** T-TSF-230, T-TSF-330, A-TEST

Prove pending tasks survive branch changes and planning rows are preserved or marked pending_local.

### T-TSF-350 — Add operator repair and release readiness docs

**Phase:** Phase 3  
**Type:** docs / release  
**Priority:** P1  
**Severity:** Medium  
**Requires:** A-COMPAT, T-TSF-340

Document dirty outbox, local-ahead, conflict, hydrate, flush/publish, repair replacement, branch preflight, and release readiness.

### T-TSF-360 — Add multi-worktree/concurrent sync E2E fixture

**Phase:** Phase 3  
**Type:** E2E / concurrency  
**Priority:** P1  
**Severity:** High  
**Requires:** T-TSF-230, T-TSF-250, A-TEST

Create scenario where worktree A queues local task event, worktree B publishes remote event, A fetches/hydrates/statuses, A remains local-ahead with overlay visible, and publish either succeeds or conflicts without data loss.

---

## 8. Dependency summary

```text
T-TSF-000 → T-TSF-010
T-TSF-000 → T-TSF-020
T-TSF-020 → T-TSF-030
T-TSF-010 → T-TSF-040
T-TSF-020 + T-TSF-030 → T-TSF-050
T-TSF-020 + T-TSF-030 → T-TSF-060
T-TSF-010 → T-TSF-070

A-SAFETY + A-TEST → T-TSF-110
T-TSF-110 → T-TSF-120
T-TSF-120 → T-TSF-130
A-STATUS + A-BRANCH → T-TSF-140
A-STATUS + A-SAFETY → T-TSF-150
A-STATUS + A-SAFETY → T-TSF-160
A-BRANCH + A-STATUS → T-TSF-170

A-ARCH + A-COMPAT + A-TEST → T-TSF-210
T-TSF-210 → T-TSF-220
T-TSF-210 + T-TSF-220 + A-STATUS → T-TSF-230
T-TSF-230 → T-TSF-240
T-TSF-230 + A-STATUS → T-TSF-250

A-PLANNING + A-TEST → T-TSF-310
T-TSF-310 → T-TSF-320
A-BRANCH + A-STATUS → T-TSF-330
T-TSF-230 + T-TSF-330 + A-TEST → T-TSF-340
A-COMPAT + T-TSF-340 → T-TSF-350
T-TSF-230 + T-TSF-250 + A-TEST → T-TSF-360
```

---

## 9. Recommended work order

### Phase 1 — Data-Loss Hotfix & Safety Gates

1. T-TSF-000 — Inventory current task/planning sync surfaces.
2. T-TSF-010 — Draft sync stabilization architecture note.
3. T-TSF-020 — Draft sync safety contract.
4. T-TSF-030 — Draft task-state status contract update.
5. T-TSF-040 — Draft planning merge-safety design.
6. T-TSF-050 — Draft branch/worktree/startup guard design.
7. T-TSF-060 — Draft regression and E2E test strategy.
8. T-TSF-070 — Draft compatibility and migration note.
9. T-TSF-110 — Add shared task-state sync safety utility.
10. T-TSF-120 — Guard hydrate/rebuild/apply projection replacement.
11. T-TSF-130 — Add task-drop regression tests.
12. T-TSF-140 — Update extension sync coordinator to obey status safety.
13. T-TSF-150 — Add task ID allocation freshness guard.
14. T-TSF-160 — Add explicit task-state flush/publish command path.
15. T-TSF-170 — Add startup/open-workspace sync safety behavior.

### Phase 2 — Effective Projection Overlay

16. T-TSF-210 — Add effective task projection builder.
17. T-TSF-220 — Use outbox rows as local pending event source.
18. T-TSF-230 — Update hydrate/status to persist and report effective projection.
19. T-TSF-240 — Update apply/rebuild semantics for overlay model.
20. T-TSF-250 — Add projection metadata invariant checks.

### Phase 3 — Planning Merge Safety & Branch Hardening

21. T-TSF-310 — Add planning persistence modes.
22. T-TSF-320 — Add planning domain sync posture metadata.
23. T-TSF-330 — Add branch/worktree sync preflight.
24. T-TSF-340 — Add branch-heavy E2E regression fixtures.
25. T-TSF-350 — Add operator repair and release readiness docs.
26. T-TSF-360 — Add multi-worktree/concurrent sync E2E fixture.

---

## 10. Final acceptance criteria

The task/planning sync fix is complete when:

1. Hydrate cannot drop a locally created task while canonical outbox is dirty.
2. Rebuild cannot drop a locally created task while canonical outbox is dirty.
3. Apply cannot perform unsafe projection replacement when it would drop local task IDs.
4. Extension background sync does not hydrate while status says wait/run-publish/resolve-conflict or while outbox is dirty.
5. Startup/open-workspace sync follows the same safety rules as Git HEAD sync.
6. Agents have an explicit flush/publish command path for local-ahead outbox state.
7. Effective task reads can include local pending outbox events.
8. Failed/conflict overlay events remain visible but are marked at-risk, not clean committed state.
9. Status distinguishes remote sequence, effective sequence, pending local event count, overlay status, drop risk, source commit/ref, and last canonical event.
10. Projection metadata invariant violations are surfaced as unsafe/conflict.
11. Planning persistence preserves local rows by default and reserves replacement for explicit repair paths.
12. Planning mutations in git-canonical mode do not create silent SQLite-only rows.
13. Branch/worktree preflight blocks or escalates dirty task-state sync before checkout/merge/rebase/closeout.
14. Task ID allocation refuses stale or dirty canonical state.
15. Regression tests reproduce the original dropped-task bug and prove it is fixed.
16. Branch-heavy E2E fixture proves pending tasks survive branch changes and later reconcile.
17. Multi-worktree E2E fixture proves concurrent remote movement does not erase local pending work.
18. Operator docs explain normal sync, dirty outbox, local-ahead, conflict, hydrate, flush/publish, and repair flows.
19. Repair replacement requires explicit repair command or flag plus policy approval.

---

## 11. Planner registration guidance

When an agent enters this WBS into the planner, use this document as the plan source:

```json
{
  "planRef": "TASK_SYNC_FIX.md",
  "planArea": "task-state-sync-stabilization",
  "requiresPhaseBranch": true,
  "maintainerDeliveryProfile": "github-pr",
  "recommendedPhaseCount": 3
}
```

Recommended tags:

```text
task-state-sync
git-event-log
canonical-outbox
hydrate
rebuild-task-state-cache
apply-task-state-events
planning-sync
branch-safety
startup-sync
extension-sync
projection-overlay
multi-worktree
data-loss-prevention
```

Recommended task type:

```text
bugfix
```

Suggested first planner action:

```text
Register Phase 1 first and do not register Phase 2 implementation tasks until A-ARCH, A-SAFETY, A-STATUS, A-TEST, and A-COMPAT are approved.
```

---

## 12. Agent handoff expectations

Every implementation task handoff should include:

```text
files changed
commands/tests run
sync scenario covered
whether dirty outbox behavior was tested
whether clean hydrate/rebuild behavior was preserved
whether startup or branch sync behavior was affected
whether projection metadata invariants were affected
remaining risks
next recommended task
```

For any task touching projection replacement writes, include explicit evidence that local task IDs are not dropped unexpectedly.
