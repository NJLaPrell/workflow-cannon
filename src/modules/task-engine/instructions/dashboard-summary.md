<!--
agentCapsule|v=1|command=dashboard-summary|module=task-engine|schema_only=pnpm exec wk run dashboard-summary --schema-only '{}'
-->

# dashboard-summary

Return a single JSON payload for dashboard / cockpit UIs: task counts, ready-queue preview, blocked summary, suggested next task, and (when present) a shallow parse of `docs/maintainers/data/workspace-kit-status.yaml`.

Read-only. Does not mutate workspace state. Does **not** run `git fetch` — the VS Code extension **`TaskStateSyncCoordinator`** owns background fetch/hydrate/apply on an interval or via **Workflow Cannon: Sync Task State (Git)**.

## Usage

```
workspace-kit run dashboard-summary '{}'
```

## Arguments

Optional JSON object:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `wishlistPage` | integer (≥ 0) | `0` | 0-based page index for the **Wishlist · open** preview table in UIs. Out-of-range pages clamp to the last page. |
| `wishlistPageSize` | integer (1–100) | `10` | Rows per wishlist page (`openTop` length). |
| `includePhaseFocus` | boolean | `false` | When `true`, adds **`phaseFocus`** (`AgentPhaseFocusDashboard` v1) — same bounded slice as **`phase-focus-dashboard`**. |
| `phaseKey` | string | workspace current | Phase scope for **`phaseFocus`** when `includePhaseFocus` is set. |
| `projection` | string (`full`, `overview`, `queue`, `status`) | `full` | Section slice for lazy dashboard hydration. **`overview`** omits queue rollups and phase-journal SQLite reads; extension uses it for first paint after the shell (T100396). CLI default **`full`** preserves aggregate compatibility. |

Also accepts standard invocation `config` / `actor` overlays where applicable.

## Returns

`data` includes:

| Field | Description |
| --- | --- |
| `schemaVersion` | **`7`** adds **`agentStatus`** (schema-versioned derived WC Agent status) and **`planArtifact`** (bounded PlanArtifact lifecycle pointer). **`6`** adds **`systemStatus.identity`** (project/package/workspace-kit versions) and **`systemStatus.planningStore`** (SQLite path). **`5`** adds **`systemStatus`** (phase/drift slice, doctor contract issues, module activation ids, CAE posture lines). **`4`** was identical without **`systemStatus`**. **`3`** adds **`subagentRegistry`**; **`2`** added **`teamExecution`**; older clients must tolerate unknown fields |
| `taskStateProjection` | `{ schemaVersion: 1, available, backend, appliedSequence, sourceCommit, syncStatus, updatedAt, displayState, remediation, gitSyncState }` — read-only cursor + git alignment (`task-state-status` with **no** fetch); `displayState` is **`current`**, **`behind`**, **`offline`**, or **`conflict`** (extension may overlay **`syncing`** while background sync runs) |
| `dashboardProjection` | When set, names the section slice (`full`, `overview`, `queue`, `status`). Omitted or **`full`** on default aggregate responses. |
| `taskStoreLastUpdated` | ISO timestamp from task store document |
| `workspaceStatus` | `{ currentKitPhase, nextKitPhase, activeFocus, lastUpdated, blockers[], pendingDecisions[], nextAgentActions[] }` shallow-parse from `workspace-kit-status.yaml`; file-missing yields `null` |
| `planArtifact` | `null` when no PlanArtifact has been persisted; otherwise `{ schemaVersion: 1, count, current, recent }` where each row includes `{ planId, planRef, version, status, title, planningType, updatedAt, wbsRowCount, openQuestionCount }`. Full WBS/details stay in `.workspace-kit/planning/plan-artifacts/` and lifecycle commands. |
| `stateSummary` | Task counts by status + `total` (same shape as `get-next-actions`; **excludes** **`wishlist_intake`** so the grid matches execution/improvement work — wishlist stays in **`wishlist`** / open-wishlist rollups) |
| `proposedImprovementsSummary` | `{ schemaVersion: 1, count, top, phaseBuckets }` — `top` is up to 15 **proposed** improvement tasks globally; `phaseBuckets` mirrors the Tasks sidebar: ordered **current** / **next** phase (from maintainer YAML, including **0-count** slots), then other phase keys, then **Not Phased**; each bucket has `{ schemaVersion: 1, phaseKey, label, count, top, taskIds? }` where bucket `top` is up to 15 preview rows and **`taskIds`** (when present) lists **every** proposed improvement id in that phase for operator batch **Accept** UIs |
| `proposedExecutionSummary` | Same `phaseBuckets` shape for **proposed** non-improvement, non-wishlist tasks (**`taskIds`** on each bucket lists all ids in that phase) |
| `readyImprovementsSummary` | `{ schemaVersion: 1, count, top, phaseBuckets }` for the ready **improvement** slice |
| `readyExecutionSummary` | `{ schemaVersion: 1, count, top, phaseBuckets }` for the rest of the ready queue |
| `readyQueueTop` | Up to 15 ready tasks (id, title, priority, severity, components, features, phase) |
| `readyQueueCount` | Full ready queue length |
| `readyQueueBreakdown` | `{ schemaVersion: 1, improvement, other }` — split of the ready queue (`improvement` = `type: improvement` or legacy `imp-*` id; `other` = remainder; wishlist intake never appears in the ready queue) |
| `blockedSummary` | `{ count, top, phaseBuckets }` — `top` is up to 15 blocking analysis rows; `phaseBuckets` groups those rows by the **blocked task’s** phase (same ordering as above) |
| `completedSummary` | `{ schemaVersion: 1, count, top, phaseBuckets }` — **completed** tasks only; same `phaseBuckets` ordering as the Tasks sidebar / ready queues; `top` is up to 15 global preview rows (operator UIs may collapse this section by default) |
| `cancelledSummary` | Same shape as `completedSummary` for **cancelled** tasks |
| `suggestedNext` | First **ready** task after priority sort, or `null` when the ready queue is empty (proposed work does not appear here) |
| `planningSession` | Shallow `build-plan` session snapshot for the dashboard, or `null` when no session file |
| `blockingAnalysis` | Full blocking analysis list |
| `dependencyOverview` | `{ schemaVersion: 1, activeTaskCount, includedTaskCount, edgeCount, truncated, perfNote, nodes, edges, mermaidFlowchart, criticalPathReady }` — active-task dependency subgraph aligned with `get-dependency-graph` edge direction (`from` depends on `to`); degrades when there are many active tasks (see `perfNote`) |
| `wishlist.openTop` | Up to **`wishlistPageSize`** **open** wishlist items for the requested page (`{ id, title, taskId }`); W### namespace, separate from tasks until `convert-wishlist` |
| `wishlist.openPage` | 0-based page index actually used (after clamping) |
| `wishlist.openPageSize` | Page size used for this response |
| `wishlist.openTotalPages` | `Math.ceil(openCount / openPageSize)` when `openCount > 0`, else **0** |
| `teamExecution` | `{ schemaVersion: 1, available, totalCount, activeCount, byStatus, topActive }` — rollup of **`kit_team_assignments`** when kit SQLite **`user_version` ≥ 7**; **`topActive`** is up to 15 rows in **`assigned` / `submitted` / `blocked`** (most recently updated first), each with **`executionTaskTitle`** resolved from the task store when present |
| `subagentRegistry` | `{ schemaVersion: 1, available, definitionsCount, retiredDefinitionsCount, openSessionsCount, topOpenSessions }` — rollup of **`kit_subagent_*`** when kit SQLite **`user_version` ≥ 6**; **`topOpenSessions`** lists up to 15 **`status: open`** sessions (newest **`updatedAt`**) |
| `taskCheckpoints` | `{ schemaVersion: 1, available, totalCount, topRecent }` — rollup of **`kit_task_checkpoints`** when kit SQLite **`user_version` ≥ 9**; **`topRecent`** lists up to 15 newest checkpoints |
| `approvalQueue` | `{ schemaVersion: 1, count, top, policyArtifacts }` — improvement tasks in **`ready`** / **`in_progress`** for **`review-item`** (priority sort); **`top`** capped at 15; **`policyArtifacts`** lists audit paths under **`.workspace-kit/`** |
| `phaseFocus` | Optional **`AgentPhaseFocusDashboard`** v1 when **`includePhaseFocus`** is true — bounded phase queue, delivery slice, journal stats, evidence gaps (see **`phase-focus-dashboard`**) |
| `systemStatus` | **`schemaVersion` `2`** adds **`identity`** (`projectName`, `packageName`, `workspaceKitVersion`, `rootPackageVersion`) and **`planningStore`** (`backend: sqlite`, `databaseRelativePath`). **`schemaVersion` `1`** omitted those slices. Always includes **`generatedAt`**, **`phase`** (same as **`phase-status`** — canonical phase, export staleness, drift strings), **`doctor`** (contract-check issues, capped), **`modules`** (enabled vs disabled module ids), **`caeLines`** (CAE posture lines; shadow trace stays on merged CLI **`data.cae`** when CAE preflight runs) |
| `agentStatus` | `{ schemaVersion: 1, source, kind, label, confidence, updatedAt, taskId?, phaseKey?, command?, prNumber?, version?, detail? }`. `source: "derived"` is inferred from existing dashboard state; `source: "live_activity"` is a fresh expiring lease from planning SQLite table `kit_agent_activity_leases` and overrides derived state until `expiresAt`. Kinds include `unavailable`, `planning`, `blocked`, `working_task`, `delegating_task`, `ready_task`, `awaiting_instruction`, `reviewing_item`, `reviewing_pr`, `validating`, `releasing`, `awaiting_policy_approval`, and `awaiting_human_gate`. Derived precedence is unavailable/error, active planning, blocked current work, in-progress task, active team/subagent delegation, suggested next ready task, then `Awaiting Instruction`. |
| `pastPhaseNotes` | `{ phaseKey, notes[] }[]` — past-phase journal rollup for dashboard **Past Phases** (one batched SQLite read inside this command). Phases with zero notes are omitted. Same note projection shape as `list-phase-notes`. Empty array when journal tables are absent or no past notes exist. |

## WC Agent Status Trust Boundary

`agentStatus` is a dashboard hint, not audit evidence. Task lifecycle state, transition evidence, PR merge data, and release approvals remain authoritative in their normal stores.

Use derived status for facts already present in `dashboard-summary`: `Awaiting Instruction`, `Planning Interview`, `Blocked on Task T###`, `Working on Task T###`, delegation, or the suggested ready task. Use explicit live activity for intent that the task store cannot infer, such as `Reviewing Pull Request 192`, `Reviewing Item review-item:T100060`, `Validating pnpm run check`, `Releasing Build 0.9.1`, `Awaiting Policy Approval for T###`, or `Awaiting Human Gate`.

Live activity leases are short-lived. Expired rows are ignored and the dashboard falls back to derived status. If the activity table is unavailable or a lease is malformed, `dashboard-summary` should degrade to derived or `unavailable` status without making network calls. PR and release labels must come from explicit activity fields or metadata already in the store, never from GitHub lookups during dashboard rendering.
