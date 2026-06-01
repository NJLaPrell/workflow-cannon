# TASK_SYNC_FIX.md

**Artifact:** `TASK_SYNC_FIX.md` (repo root)

| Document | Role |
| --- | --- |
| **`TASK_SYNC_FIX.md`** | Planner-ready implementation instructions for stabilizing task/planning sync across branches |
| `.ai/runbooks/task-state-sync-path-inventory.md` | Existing sync-path inventory and source-of-truth notes |
| `AGENT_ORCHESTRATION_FOUNDATION.md` | Related future orchestration foundation; depends on reliable task state |
| `AGENT_ORCHESTRATION_TASKS.md` | Related orchestration WBS; should not start deep multi-agent work until this stabilization is handled |

## Scope

This WBS fixes task/planning sync instability where tasks or planning rows can disappear from local SQLite after branch changes, hydrate/rebuild/apply cycles, or queue-mode canonical publishing delays.

The primary problem is not a normal delete. It is projection loss:

```text
local SQLite contains task/planning rows
canonical git event stream does not yet contain the matching events
hydrate/rebuild/apply overwrites local projection from canonical stream
the local-only rows disappear
```

This plan makes the architecture stable enough for branch-heavy and multi-agent workflows by preventing destructive projection overwrites, preserving pending local events, and introducing a path toward remote-base plus local-pending overlay semantics.

---

## 1. Product goal / success standard

Workflow Cannon should safely support this loop:

```text
Agent or human creates/updates tasks or planning rows
→ canonical events are published immediately or queued locally
→ branch changes, hydrate, rebuild, and dashboard refresh may occur
→ local pending work remains visible and recoverable
→ canonical remote state and local pending overlay reconcile cleanly
→ no task disappears unless an explicit supported removal/supersession flow exists
```

Success means:

```text
No task or planning row is silently dropped by sync.
Local pending work survives branch changes.
Hydrate/rebuild/apply is safe in queue-mode workflows.
Task ID allocation refuses stale state.
The extension sync coordinator obeys sync safety state instead of blindly hydrating.
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

## 3. Current failure mode to fix

The current architecture says git-event-log is canonical and SQLite is a projection. That is correct.

However, queue/local workflows temporarily make SQLite look canonical before the outbox publishes. Hydrate/rebuild/apply can then overwrite SQLite from a canonical stream that lacks local queued events.

Known danger paths:

```text
create-task / persist-planning-execution-drafts in git-canonical queue mode
→ local SQLite updated
→ canonical event queued but not published
→ branch checkout / merge / git HEAD change triggers sync
→ hydrate/rebuild/apply runs from canonical branch
→ canonical stream lacks local event
→ local task/planning row disappears
```

The immediate goal is to prevent this class of data loss before deeper architecture work begins.

---

## 4. Non-goals / constraints

| Constraint | Decision |
| --- | --- |
| Replace git-event-log immediately | No. Stabilize current architecture first. |
| Implement hosted canonical backend now | No. Track as future work only. |
| Rewrite the whole Task Engine | No. Add safety, overlay, and projection discipline. |
| Treat SQLite as branch-portable canonical DB | No. SQLite remains projection/cache plus local outbox. |
| Allow hydrate to overwrite local pending rows | No. This is the bug class being fixed. |
| Add normal task delete semantics | No. If task rows disappear without explicit supported event, treat as unsafe. |
| Let extension background sync choose destructive operations blindly | No. It must obey status/recommendedAction/outbox safety. |
| Allocate T### IDs from stale projections | No. Guard allocation until sync is safe. |
| Solve all multi-agent orchestration issues here | No. This is foundational stability work needed before deeper orchestration. |

---

## 5. Architecture anchors

### 5.1 Remote base + local pending overlay

Target model:

```text
remote_projection
  derived from canonical git event log

local_pending_overlay
  derived from canonical_event_outbox rows that are pending, publishing, failed, or conflict

effective_projection
  remote_projection + local_pending_overlay
```

All normal reads should use the effective projection.

Hydrate/rebuild may update remote projection, but must not erase local pending overlay.

### 5.2 Sync safety before destructive projection writes

Before any command overwrites task/planning projection tables, it must check:

```text
outbox.pending === 0
outbox.publishing === 0
outbox.failed === 0
outbox.conflict === 0
projectionMeta.syncStatus is not conflict/corrupt
new projection would not drop existing local task IDs unexpectedly
```

If unsafe, fail closed with an agent-readable error.

### 5.3 Branch/worktree safety

Git HEAD changes should trigger a status check, not immediate destructive hydrate.

Safe listener behavior:

```text
HEAD changed
→ task-state-status fetch:true
→ if outbox dirty: do not hydrate; surface local-ahead/wait
→ if conflict: surface repair required
→ if clean and behind: hydrate
→ if none: no-op/apply safe tail
```

### 5.4 Planning persistence must become non-destructive by default

Planning projection persistence currently replaces whole local domains. The stable model should use merge-preserve-local by default and reserve destructive replace for explicit repair paths.

Planning domains:

```text
phase_catalog
workspace_status
phase_notes
phase_note_suggestions
ideas
module_state
```

---

## 6. Recommended delivery phases

Use exactly three planner-facing phases.

| Phase | Theme | Exit criteria |
| --- | --- | --- |
| **Phase 1 — Data-Loss Hotfix & Safety Gates** | Inventory, safety contracts, sync guard, dirty-outbox blocking, would-drop detection, extension coordinator safety, regression tests | Hydrate/rebuild/apply cannot drop local pending tasks; extension does not hydrate while outbox is dirty; tests reproduce and prevent the bug. |
| **Phase 2 — Effective Projection Overlay** | Remote projection + local pending overlay, outbox replay as local event source, status metadata, safe hydrate/apply semantics | Reads can include pending local work; hydrate updates remote base without erasing overlay; status distinguishes remote/effective/local-ahead/conflict. |
| **Phase 3 — Planning Merge Safety & Branch Hardening** | Non-destructive planning persistence, domain-level sync posture, branch/worktree guards, task ID allocation guard, repair docs/E2E | Planning rows are preserved unless explicitly repaired; branch changes are guarded; stale task ID allocation is blocked; E2E proves branch-heavy workflows are stable. |

Phase mapping summary:

```text
Phase 1 = stop data loss immediately
Phase 2 = implement the right projection model
Phase 3 = harden planning, branch changes, and operator workflows
```

---

## 7. Required human-reviewed artifacts

These artifacts must be produced and approved before dependent coding starts.

| ID | Artifact | What it must contain | Produced by | Human approves | Blocks |
| --- | --- | --- | --- | --- | --- |
| **A-INV** | Task/planning sync surface inventory | Current hydrate/rebuild/apply/publish/outbox/status/extension/planning persistence paths; destructive write points; task-drop reproduction path; branch-change triggers | T-TSF-000 | Inventory complete; no missing destructive path | A-ARCH, A-SAFETY, implementation work |
| **A-ARCH** | Sync stabilization architecture note | Remote projection vs local overlay model; source-of-truth hierarchy; staged migration; outbox semantics; what remains git-backed; future hosted backend note | T-TSF-010 | Architecture direction approved | Phase 2, Phase 3 implementation |
| **A-SAFETY** | Sync safety contract | Dirty outbox rules; would-drop task detection; failure codes; command behavior for hydrate/rebuild/apply/status; exact data returned to agents | T-TSF-020 | Fail-closed behavior accepted | T-TSF-110, T-TSF-120, T-TSF-130 |
| **A-STATUS** | Task-state status contract update | New/reused fields: recommendedAction, outbox, localProjection, remoteAppliedSequence, effectiveAppliedSequence, pendingLocalEventCount, localOverlayStatus, dropRisk | T-TSF-030 | Status is sufficient for CLI/dashboard/extension decisions | T-TSF-140, T-TSF-230 |
| **A-PLANNING** | Planning merge-safety design | Domain-level persistence modes; merge-preserve-local default; repair-replace semantics; domain sync posture; local pending planning rows | T-TSF-040 | No destructive default planning writes | T-TSF-310, T-TSF-320 |
| **A-BRANCH** | Branch/worktree guard design | When to block checkout/merge/rebase/closeout; extension HEAD listener behavior; command/remediation wording; safe manual repair path | T-TSF-050 | Branch workflow policy accepted | T-TSF-330, T-TSF-340 |
| **A-TEST** | Regression and E2E test strategy | Bug reproduction fixtures; outbox states; branch change simulation; extension coordinator tests; planning preservation tests; task ID allocation stale-state tests | T-TSF-060 | Coverage adequate before implementation | All implementation phases |
| **A-COMPAT** | Compatibility/migration note | Current git-event-log behavior that stays; config compatibility; queue mode behavior; fallback for old projection metadata; operator impact | T-TSF-070 | Existing operators not broken silently | Phase 2/3 implementation |

### Requires column legend

| Mark | Meaning |
| --- | --- |
| — | No prerequisite artifact beyond normal task dependencies |
| **A-*** | Approved artifact must exist before starting |
| **→ A-*** | This task produces artifact A-* for human review |
| **⛔** | Hard stop until approved |

---

## 8. Work Breakdown Structure

## WP-A — Phase 1: Decision artifacts and bug proof

### T-TSF-000 — Inventory current task/planning sync surfaces

**Type:** research / inventory  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** —  
**Produces:** A-INV  
**Value:** Prevents missing a destructive projection path.

**Scope**

Inventory:

- `task-state-hydrate`
- `rebuild-task-state-cache`
- `apply-task-state-events`
- canonical event outbox store/runtime/publisher
- task-state status and recommended action behavior
- extension task-state sync coordinator
- Git HEAD listener
- planning projection persistence
- task ID allocation path
- planning draft persistence path
- current tests covering queue mode, hydrate, branch sync, and planning domains

**Acceptance criteria**

- A-INV lists destructive projection write points.
- A-INV identifies exactly where tasks/planning rows can be dropped.
- A-INV includes the minimum reproduction scenario.
- A-INV recommends which existing utilities to reuse.

---

### T-TSF-010 — Draft sync stabilization architecture note

**Type:** architecture  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-INV  
**Produces:** A-ARCH  
**Value:** Locks the remote-base/local-overlay direction before implementation.

**Scope**

Create `TASK_SYNC_ARCHITECTURE.md` or an approved sectioned artifact covering:

- source-of-truth hierarchy
- why SQLite-only rows are unsafe
- outbox as local pending event source
- remote projection + local pending overlay + effective projection
- hydrate/rebuild/apply safety rules
- planning domain merge strategy
- branch/worktree guard strategy
- future hosted backend note

**Acceptance criteria**

- Architecture explicitly says hydrate must not erase unpublished local events.
- Architecture identifies what is hotfix vs deeper refactor.
- Human approval is recorded before Phase 2 overlay implementation.

---

### T-TSF-020 — Draft sync safety contract

**Type:** contract / safety  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-INV  
**Produces:** A-SAFETY  
**Value:** Defines fail-closed behavior for destructive commands.

**Scope**

Define:

- dirty outbox detection
- dirty outbox failure code/message/data
- projection-would-drop-local-tasks detection
- conflict/corrupt projection behavior
- where the guard must run
- dry-run behavior
- override/repair behavior, if any
- agent-readable remediation text

Suggested failure codes:

```text
task-state-outbox-dirty
task-state-projection-would-drop-local-tasks
task-state-local-conflict
task-state-sync-repair-required
```

**Acceptance criteria**

- The contract fails closed by default.
- It defines exact data needed for agent/operator remediation.
- It distinguishes hotfix blocking from future overlay support.

---

### T-TSF-030 — Draft task-state status contract update

**Type:** command contract  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-SAFETY  
**Produces:** A-STATUS  
**Value:** Lets CLI, dashboard, and extension make safe sync decisions.

**Scope**

Define status output additions or clarified semantics for:

```text
recommendedAction
outbox.pending/publishing/failed/conflict
localProjection
remoteAppliedSequence
effectiveAppliedSequence
pendingLocalEventCount
localOverlayStatus
dropRisk
syncSafety
```

**Acceptance criteria**

- Extension coordinator can decide hydrate/wait/repair from status alone.
- Status distinguishes clean remote freshness from local-ahead pending work.
- Status response remains backward-compatible where possible.

---

### T-TSF-040 — Draft planning merge-safety design

**Type:** architecture / persistence design  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-INV, A-ARCH  
**Produces:** A-PLANNING  
**Value:** Prevents phase notes, ideas, module state, and other planning domains from being wiped by replay gaps.

**Scope**

Define persistence modes:

```text
merge-preserve-local
replace-safe
repair-replace
```

For each planning domain, define:

- default persistence mode
- local pending row behavior
- domain sync posture metadata
- when destructive replacement is allowed
- test fixtures

**Acceptance criteria**

- Destructive delete-replace is not the default for planning domains.
- Explicit repair path is separated from normal hydrate.
- Domain-level behavior is implementable without breaking current rows.

---

### T-TSF-050 — Draft branch/worktree guard design

**Type:** workflow / command contract  
**Priority:** P1  
**Severity:** High  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-SAFETY, A-STATUS  
**Produces:** A-BRANCH  
**Value:** Makes branch-heavy agent work safe.

**Scope**

Define:

- preflight before checkout/merge/rebase/phase closeout
- extension HEAD listener behavior
- what to do with dirty outbox
- what to do with conflict/failed outbox
- remediation commands/messages
- whether branch changes are blocked or warned in each context

**Acceptance criteria**

- Branch change flow cannot trigger destructive hydrate while outbox is dirty.
- Agent/operator remediation is explicit.
- Behavior is compatible with existing extension sync listener.

---

### T-TSF-060 — Draft regression and E2E test strategy

**Type:** test strategy  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-SAFETY, A-STATUS  
**Produces:** A-TEST  
**Value:** Ensures the bug cannot return.

**Scope**

Define tests for:

- pending outbox blocks hydrate
- pending outbox blocks rebuild
- pending outbox blocks unsafe apply
- would-drop task detection
- extension coordinator uses recommendedAction/outbox
- Git HEAD change does not hydrate dirty state
- planning merge-preserve-local
- task ID allocation stale-state guard
- failed/conflict outbox states
- clean hydrate still works

**Acceptance criteria**

- The test plan includes direct reproduction of the task-drop bug.
- Tests cover both CLI runtime and extension coordinator.
- Tests separate hotfix behavior from overlay behavior.

---

### T-TSF-070 — Draft compatibility and migration note

**Type:** compatibility  
**Priority:** P1  
**Severity:** Medium  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-ARCH  
**Produces:** A-COMPAT  
**Value:** Avoids breaking existing git-event-log users.

**Scope**

Document:

- existing config compatibility
- queue mode behavior after safety gates
- old projection metadata behavior
- repair command guidance
- operator-facing behavior changes
- known limitations until overlay is implemented

**Acceptance criteria**

- Existing clean hydrate/rebuild flows still work.
- Dirty local outbox behavior changes are documented.
- Compatibility note is referenced by implementation PRs.

---

## WP-1 — Phase 1: Immediate data-loss hotfix

### T-TSF-110 — Add shared task-state sync safety utility

**Type:** implementation / safety  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-SAFETY, A-TEST  
**Value:** Centralizes unsafe-sync detection.

**Likely files**

```text
src/modules/task-engine/persistence/task-state-sync-safety.ts
test/task-state-sync-safety.test.mjs
```

**Scope**

Implement shared checks for:

- dirty outbox counts
- failed/conflict outbox counts
- projection meta conflict/corrupt status
- current local task IDs vs next projected task IDs
- pending outbox touched task IDs
- would-drop task detection

**Acceptance criteria**

- Utility returns stable agent-readable failure codes.
- Unit tests cover clean, pending, publishing, failed, conflict, and would-drop cases.
- Utility is side-effect free.

---

### T-TSF-120 — Guard hydrate/rebuild/apply destructive projection writes

**Type:** implementation / runtime safety  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** T-TSF-110, A-SAFETY  
**Value:** Stops the immediate task-drop bug.

**Likely files**

```text
src/modules/task-engine/persistence/task-state-hydrate-runtime.ts
src/modules/task-engine/persistence/rebuild-task-state-cache-runtime.ts
src/modules/task-engine/persistence/apply-task-state-events-runtime.ts
```

**Scope**

Before calling projection persistence:

- read current local task IDs
- read outbox status
- compute next projected task IDs
- call sync safety utility
- fail closed if unsafe

**Acceptance criteria**

- Hydrate refuses to overwrite local projection when outbox is dirty.
- Rebuild refuses to overwrite local projection when outbox is dirty.
- Apply refuses unsafe projection overwrite.
- Would-drop task detection blocks unsafe replacement.
- Clean state behavior is unchanged.

---

### T-TSF-130 — Add task-drop regression tests

**Type:** testing  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** T-TSF-120, A-TEST  
**Value:** Proves the immediate bug is fixed.

**Scope**

Add regression tests:

```text
create task in git-canonical queue mode
confirm local task exists
confirm outbox pending
simulate hydrate/rebuild from canonical stream without that event
expect command fails safely
expect task still exists locally
```

Also cover:

- failed outbox blocks destructive hydrate
- conflict outbox blocks destructive hydrate
- clean hydrate still succeeds

**Acceptance criteria**

- Tests fail against old behavior and pass with guard.
- Test names clearly describe data-loss prevention.

---

### T-TSF-140 — Update extension sync coordinator to obey status safety

**Type:** implementation / extension runtime  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-STATUS, A-BRANCH, A-TEST  
**Value:** Prevents background sync from triggering destructive hydrate after branch changes.

**Likely files**

```text
extensions/cursor-workflow-cannon/src/runtime/task-state-sync-coordinator.ts
extensions/cursor-workflow-cannon/src/runtime/git-task-state-sync-listener.ts
```

**Scope**

Change coordinator behavior to use:

```text
data.recommendedAction
data.outbox
data.localProjection
```

Expected behavior:

```text
recommendedAction=wait → do not hydrate; report skipped/waiting
recommendedAction=resolve-conflict → do not hydrate; report skipped/conflict
recommendedAction=hydrate → hydrate only if outbox clean
recommendedAction=run-publish → publish/flush if supported, otherwise report needed action
recommendedAction=none → no-op or safe apply
```

**Acceptance criteria**

- Coordinator does not hydrate while outbox dirty.
- Git HEAD change path cannot wipe pending local work.
- Tests cover wait, hydrate, resolve-conflict, and none cases.

---

### T-TSF-150 — Add task ID allocation freshness guard

**Type:** implementation / safety  
**Priority:** P1  
**Severity:** High  
**Recommended phase:** Phase 1 — Data-Loss Hotfix & Safety Gates  
**Requires:** A-STATUS, A-SAFETY, A-TEST  
**Value:** Prevents duplicate/conflicting T### IDs from stale projections.

**Likely files**

```text
src/modules/task-engine/commands/task-row-mutation-commands.ts
src/modules/task-engine/mutation-utils.ts
```

**Scope**

Before `allocateId:true` in git-canonical workspaces, require safe/fresh sync posture.

Fail with:

```text
task-id-allocation-requires-fresh-sync
```

when projection is stale, dirty, local-conflicted, or not safe enough to allocate.

**Acceptance criteria**

- `allocateId:true` works in clean state.
- `allocateId:true` fails in stale/dirty outbox state.
- Error includes remediation.
- Explicit IDs retain existing validation behavior.

---

## WP-2 — Phase 2: Effective projection overlay

### T-TSF-210 — Add effective task projection builder

**Type:** implementation / projection  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 2 — Effective Projection Overlay  
**Requires:** A-ARCH, A-COMPAT, A-TEST  
**Value:** Implements remote-base plus local-pending overlay model.

**Likely files**

```text
src/modules/task-engine/persistence/task-state-effective-projection.ts
test/task-state-effective-projection.test.mjs
```

**Scope**

Build helper that accepts:

- remote canonical events/projection
- local pending outbox events
- overlay options

and returns:

- remote projection
- local overlay projection/status
- effective task document
- conflict/drop diagnostics

**Acceptance criteria**

- Remote-only replay matches existing behavior.
- Pending local create remains visible in effective projection.
- Pending local update overlays remote task.
- Conflict local overlay does not silently disappear.

---

### T-TSF-220 — Use outbox rows as local pending event source

**Type:** implementation / persistence  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 2 — Effective Projection Overlay  
**Requires:** T-TSF-210  
**Value:** Makes unpublished events durable and replayable.

**Likely files**

```text
src/modules/task-engine/persistence/canonical-event-outbox-store.ts
src/modules/task-engine/persistence/canonical-event-outbox-runtime.ts
src/modules/task-engine/persistence/task-state-effective-projection.ts
```

**Scope**

Add read helpers for local overlay events from outbox rows with statuses:

```text
pending
publishing
failed
conflict
```

**Acceptance criteria**

- Helper returns full event JSON in deterministic order.
- Published rows are excluded by default.
- Failed/conflict rows can be included with flagged overlay status.
- Tests cover all statuses.

---

### T-TSF-230 — Update hydrate/status to persist and report effective projection

**Type:** implementation / runtime  
**Priority:** P0  
**Severity:** Critical  
**Recommended phase:** Phase 2 — Effective Projection Overlay  
**Requires:** T-TSF-210, T-TSF-220, A-STATUS  
**Value:** Makes hydrate safe while preserving pending local work.

**Likely files**

```text
src/modules/task-engine/persistence/task-state-hydrate-runtime.ts
src/modules/task-engine/persistence/task-state-status-runtime.ts
src/modules/task-engine/persistence/task-state-projection-meta-store.ts
```

**Scope**

Hydrate should:

```text
fetch canonical
build remote projection
read pending local outbox events
build effective projection
persist effective task view
record remote/effective/local overlay metadata
```

Status should report:

```text
remoteAppliedSequence
effectiveAppliedSequence
pendingLocalEventCount
localOverlayStatus
dropRisk
```

**Acceptance criteria**

- Hydrate with pending outbox preserves local pending tasks.
- Status clearly reports local-ahead pending state.
- Clean hydrate behavior remains compatible.

---

### T-TSF-240 — Update apply/rebuild semantics for overlay model

**Type:** implementation / runtime  
**Priority:** P1  
**Severity:** High  
**Recommended phase:** Phase 2 — Effective Projection Overlay  
**Requires:** T-TSF-230  
**Value:** Aligns all projection writers with the overlay model.

**Likely files**

```text
src/modules/task-engine/persistence/apply-task-state-events-runtime.ts
src/modules/task-engine/persistence/rebuild-task-state-cache-runtime.ts
```

**Scope**

Update apply/rebuild to distinguish:

```text
remote canonical projection rebuild
effective projection persistence
explicit repair replacement
```

**Acceptance criteria**

- Apply/rebuild no longer drop pending local overlay rows.
- Explicit repair behavior is separate and documented.
- Tests cover dirty and clean outbox states.

---

## WP-3 — Phase 3: Planning merge safety and branch hardening

### T-TSF-310 — Add planning persistence modes

**Type:** implementation / planning persistence  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 3 — Planning Merge Safety & Branch Hardening  
**Requires:** A-PLANNING, A-TEST  
**Value:** Prevents planning tables from being wiped by incomplete replay.

**Likely files**

```text
src/modules/task-engine/task-state-events/planning-sqlite-persist.ts
```

**Scope**

Add persistence modes:

```text
merge-preserve-local
replace-safe
repair-replace
```

Default normal hydrate/apply behavior should be merge-preserve-local.

**Acceptance criteria**

- Normal sync does not delete local phase notes, ideas, or module state not represented in canonical replay.
- Repair-replace remains available only through explicit repair path.
- Tests cover each planning domain.

---

### T-TSF-320 — Add planning domain sync posture metadata

**Type:** implementation / metadata  
**Priority:** P1  
**Severity:** Medium  
**Recommended phase:** Phase 3 — Planning Merge Safety & Branch Hardening  
**Requires:** A-PLANNING, T-TSF-310  
**Value:** Makes planning sync state diagnosable.

**Scope**

Track domain-level status for:

```text
phase_catalog
workspace_status
phase_notes
phase_note_suggestions
ideas
module_state
```

Suggested metadata:

```text
remoteAppliedSequence
localPendingCount
lastCanonicalEventId
syncStatus
replaceSafe
```

**Acceptance criteria**

- Status/read path can explain which planning domains are pending/conflicted/fresh.
- Domain metadata survives hydrate/apply.

---

### T-TSF-330 — Add branch/worktree sync preflight

**Type:** implementation / command safety  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 3 — Planning Merge Safety & Branch Hardening  
**Requires:** A-BRANCH, A-STATUS  
**Value:** Prevents unsafe branch changes during pending local task/planning work.

**Scope**

Add or extend preflight command/check for:

- checkout
- merge
- rebase
- phase closeout
- release branch merge

Block/warn when:

```text
outbox.pending/publishing/failed/conflict > 0
localOverlayStatus !== clean
localProjection === conflict
```

**Acceptance criteria**

- Agents get clear remediation before branch changes.
- Phase closeout cannot proceed with dirty/conflicted task-state sync.
- Existing clean closeout remains unaffected.

---

### T-TSF-340 — Add branch-heavy E2E regression fixtures

**Type:** E2E / regression  
**Priority:** P0  
**Severity:** High  
**Recommended phase:** Phase 3 — Planning Merge Safety & Branch Hardening  
**Requires:** T-TSF-230, T-TSF-330, A-TEST  
**Value:** Proves the real workflow is stable.

**Scope**

Create E2E scenarios:

```text
create task in queue mode
switch branch / simulate HEAD change
extension coordinator syncs
pending task remains visible
outbox publishes
hydrate reconciles cleanly
```

And:

```text
create planning idea/note locally
canonical replay missing row
hydrate/apply runs
local row is preserved or flagged pending_local
```

**Acceptance criteria**

- E2E proves no task drop across branch changes.
- E2E proves planning rows are not silently removed.
- Evidence is suitable for release checklist.

---

### T-TSF-350 — Add operator repair and release readiness docs

**Type:** docs / release  
**Priority:** P1  
**Severity:** Medium  
**Recommended phase:** Phase 3 — Planning Merge Safety & Branch Hardening  
**Requires:** A-COMPAT, T-TSF-340  
**Value:** Gives humans and agents a safe recovery path.

**Scope**

Document:

- what dirty outbox means
- what local-ahead means
- what conflict means
- when to hydrate
- when not to hydrate
- how to flush/publish outbox
- how to run repair-replace intentionally
- branch-change preflight expectations
- release readiness checklist

**Acceptance criteria**

- Docs include copyable commands.
- Docs distinguish normal sync from repair sync.
- Agents have clear stop/escalate instructions.

---

## 9. Dependency summary

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

A-ARCH + A-COMPAT + A-TEST → T-TSF-210
T-TSF-210 → T-TSF-220
T-TSF-210 + T-TSF-220 + A-STATUS → T-TSF-230
T-TSF-230 → T-TSF-240

A-PLANNING + A-TEST → T-TSF-310
T-TSF-310 → T-TSF-320
A-BRANCH + A-STATUS → T-TSF-330
T-TSF-230 + T-TSF-330 + A-TEST → T-TSF-340
A-COMPAT + T-TSF-340 → T-TSF-350
```

---

## 10. Recommended work order

### Phase 1 — Data-Loss Hotfix & Safety Gates

1. T-TSF-000 — Inventory current task/planning sync surfaces.
2. T-TSF-010 — Draft sync stabilization architecture note.
3. T-TSF-020 — Draft sync safety contract.
4. T-TSF-030 — Draft task-state status contract update.
5. T-TSF-040 — Draft planning merge-safety design.
6. T-TSF-050 — Draft branch/worktree guard design.
7. T-TSF-060 — Draft regression and E2E test strategy.
8. T-TSF-070 — Draft compatibility and migration note.
9. T-TSF-110 — Add shared task-state sync safety utility.
10. T-TSF-120 — Guard hydrate/rebuild/apply destructive projection writes.
11. T-TSF-130 — Add task-drop regression tests.
12. T-TSF-140 — Update extension sync coordinator to obey status safety.
13. T-TSF-150 — Add task ID allocation freshness guard.

### Phase 2 — Effective Projection Overlay

14. T-TSF-210 — Add effective task projection builder.
15. T-TSF-220 — Use outbox rows as local pending event source.
16. T-TSF-230 — Update hydrate/status to persist and report effective projection.
17. T-TSF-240 — Update apply/rebuild semantics for overlay model.

### Phase 3 — Planning Merge Safety & Branch Hardening

18. T-TSF-310 — Add planning persistence modes.
19. T-TSF-320 — Add planning domain sync posture metadata.
20. T-TSF-330 — Add branch/worktree sync preflight.
21. T-TSF-340 — Add branch-heavy E2E regression fixtures.
22. T-TSF-350 — Add operator repair and release readiness docs.

---

## 11. Final acceptance criteria

The task/planning sync fix is complete when:

1. Hydrate cannot drop a locally created task while canonical outbox is dirty.
2. Rebuild cannot drop a locally created task while canonical outbox is dirty.
3. Apply cannot perform unsafe projection replacement when it would drop local task IDs.
4. Extension background sync does not hydrate while status says wait/resolve-conflict or while outbox is dirty.
5. Effective task reads can include local pending outbox events.
6. Status distinguishes remote sequence, effective sequence, pending local event count, overlay status, and drop risk.
7. Planning persistence preserves local rows by default and reserves destructive replacement for explicit repair paths.
8. Branch/worktree preflight blocks or escalates dirty task-state sync before checkout/merge/rebase/closeout.
9. Task ID allocation refuses stale or dirty canonical state.
10. Regression tests reproduce the original dropped-task bug and prove it is fixed.
11. Branch-heavy E2E fixture proves pending tasks survive branch changes and later reconcile.
12. Operator docs explain normal sync, dirty outbox, local-ahead, conflict, hydrate, flush/publish, and repair flows.

---

## 12. Planner registration guidance

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
extension-sync
projection-overlay
data-loss-prevention
```

Recommended task type:

```text
bugfix
```

Recommended task sizing rule:

```text
One WBS task should fit in one focused agent session.
If a task touches both core task-engine runtime and extension runtime, split it unless the acceptance criteria require the cross-boundary behavior.
```

Suggested first planner action:

```text
Register Phase 1 first and do not register Phase 2 implementation tasks until A-ARCH, A-SAFETY, A-STATUS, A-TEST, and A-COMPAT are approved.
```

---

## 13. Agent handoff expectations

Every implementation task handoff should include:

```text
files changed
commands/tests run
sync scenario covered
whether dirty outbox behavior was tested
whether clean hydrate/rebuild behavior was preserved
remaining risks
next recommended task
```

For any task touching destructive projection writes, include explicit evidence that local task IDs are not dropped unexpectedly.
