# Dashboard data map (Option 1)

**Status:** machine canon for dashboard slice → source → UI wiring.  
**Related:** [dashboard-option-1-state-store-and-pollers.md](../plans/dashboard-option-1-state-store-and-pollers.md), `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-slice-registry.ts`, `dashboard-section-registry.ts`.

Each row documents: data point, source command, builder/read path, UI section, freshness SLA, mutation invalidation (`DashboardMutationKind`), lazy behavior, fallback.

**Freshness SLA legend:** critical **5s**, queue/ops **10s**, status **30s**, CAE **120s**, config **manual/event**.

---

## Core dashboard-summary slices

| Data point | Source command | Builder / read path | UI section | Slice | Freshness SLA | Mutation invalidation | Lazy | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| State summary | `dashboard-summary` `{ projection: "overview", skipHeavyFetches: true }` | `getNextActions(tasks)` in `task-engine-dashboard-on-command.ts` | overview | overview | 5s | `task-queue`, `ideas`, `overview`, `workspace-wide` | no (eager) | last good slice |
| Suggested next action | same | `getNextActions(tasks)` | overview | overview | 5s | `task-queue`, `overview`, `workspace-wide` | no | last good slice |
| Ready queue rollups | `dashboard-summary` `{ projection: "queue" }` | `getNextActions(tasks).readyQueue` + phase buckets | overview, queue | queue | 10s | `task-queue`, `phase-journal`, `workspace-wide` | queue stub until hydrate | last good slice |
| Blocked tasks | queue projection | filter `status === "blocked"` on active tasks | overview, queue | queue | 10s | `task-queue`, `workspace-wide` | bucket lazy | last good slice |
| Proposed execution / improvements | queue projection | status/type filters on active tasks | queue | queue | 10s | `task-queue`, `workspace-wide` | bucket lazy | last good slice |
| Completed / cancelled terminal | queue projection | status filters on active tasks | queue | queue | 10s | `task-queue`, `workspace-wide` | bucket lazy | last good slice |
| Dependency overview | queue projection | `buildDashboardDependencyOverview(tasks)` | queue | queue | 10s | `task-queue`, `workspace-wide` | no | last good slice |
| Phase buckets | queue projection | `buildDashboardPhaseBucketsForTasks` + workspace status | queue | queue | 10s | `task-queue`, `phase-journal`, `workspace-wide` | bucket lazy | last good slice |
| Human gates | overview/queue projection | `buildDashboardHumanGatesSummary` | overview, queue | overview, queue | 5s / 10s | `task-queue`, `overview`, `workspace-wide` | no | last good slice |
| Approval queue | overview/queue projection | `buildDashboardApprovalQueueSummary` | overview, queue | overview, queue | 5s / 10s | `task-queue`, `overview`, `workspace-wide` | no | last good slice |
| Wishlist intake | queue projection (ideas path) | `listWishlistIntakeTasksAsItems(store.getAllTasks())` | ideas, queue | ideas | 10s | `ideas`, `task-queue`, `workspace-wide` | no | last good slice |
| Ideas board | queue projection (initial); future `ideas` projection | `listIdeas`, `listPlanningChatSessions` (planning SQLite) | ideas | ideas | 10s | `ideas`, `workspace-wide` | no (eager) | last good slice |
| Workspace phase status | overview projection | `readWorkspaceStatusSnapshotFromDual` | overview, phase, queue | phase | 10s (poll 2s) | `task-queue`, `phase-journal`, `overview`, `workspace-wide` | no | last good slice |
| Current phase delivery | overview projection | `buildDashboardCurrentPhaseDelivery` | overview, phase | phase | 10s | `task-queue`, `phase-journal`, `overview`, `workspace-wide` | no | last good slice |
| Plan artifacts | overview/status projection | `listPlanArtifactSummaries` | overview, status | overview, status | 5s / 30s | `overview`, `status`, `workspace-wide` | status tab lazy | last good slice |
| Agent guidance / RPG party | overview projection | `buildDashboardAgentStatus` / agent guidance builders | overview, status | agent | 10s (poll 2s) | `task-queue`, `config`, `workspace-wide` | no | last good slice |
| Agent activity summary | agentActivity projection | `buildDashboardAgentActivitySummary` | overview | agentActivity | 10s (poll 2s) | `task-queue`, `workspace-wide` | no | last good slice |
| Task-state projection | status projection | `buildDashboardTaskStateProjectionSummary` | status, overview | status, overview | 30s / 5s | `status`, `workspace-wide` | status tab lazy | last good slice |
| System status (doctor/modules/phase) | `dashboard-summary` `{ projection: "status" }` | `buildDashboardSystemStatus` | status | status | 30s | `status`, `config`, `cae`, `workspace-wide` | on-tab-activate | last good slice |
| Team execution | status projection (ops) | `summarizeTeamAssignmentsForDashboard` (SQLite `kit_team_assignments`) | status | team | 10s | `task-queue`, `workspace-wide` | on-tab-activate | last good slice |
| Subagent registry | status projection (ops) | `summarizeSubagentsForDashboard` (SQLite `kit_subagent_*`) | status | subagents | 10s | `task-queue`, `workspace-wide` | on-tab-activate | last good slice |
| Task checkpoints | status projection (ops) | `summarizeCheckpointsForDashboard` (SQLite/git checkpoint store) | status | checkpoints | 10s | `task-queue`, `workspace-wide` | on-tab-activate | last good slice |
| Phase journal stats | queue projection | `buildDashboardPhaseJournalStats` | queue, phase-journal | phaseJournal | 10s visible | `phase-journal`, `workspace-wide` | on-tab-activate | last good slice |
| Phase journal notes | `list-phase-notes` + `get-phase-context` | `phase-journal-commands.ts` / SQLite phase notes | phase-journal | phaseJournal | 10s visible | `phase-journal`, `workspace-wide` | on-tab-activate | last good slice |
| CAE authoring panel | `cae-authoring-summary` | CAE registry/artifacts module | cae | cae | 120s | `cae`, `workspace-wide` | on-tab-activate | last good slice |
| Config key rows | extension host (`loadConfigKeyRows`) | `explain-config` / config registry metadata — not `dashboard-summary` | config | config | manual/event | `config`, `workspace-wide` | on-tab-activate | last good + file watcher refresh |

---

## Lazy `list-tasks` queue buckets (extension-only)

Loaded when operator expands a closed phase bucket (`dashboard-queue-bucket-lazy.ts` → `buildListTasksArgsForQueueBucket`).

| Data point | Source command | Builder / read path | UI section | Slice | Freshness SLA | Mutation invalidation | Lazy | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ready bucket rows | `list-tasks` `{ status: "ready", phaseKey, limit, cursor? }` | `renderDashboardQueueTaskRowsHtml` | queue | queue | 10s | `task-queue`, `workspace-wide` | yes (per bucket) | placeholder hint |
| Proposed improvement rows | `list-tasks` `{ status: "proposed", type: "improvement", phaseKey, limit }` | same | queue | queue | 10s | `task-queue`, `workspace-wide` | yes | placeholder hint |
| Proposed execution rows | `list-tasks` `{ status: "proposed", phaseKey, limit }` | same | queue | queue | 10s | `task-queue`, `workspace-wide` | yes | placeholder hint |
| Transcript churn rows | `list-tasks` `{ status: "research", type: "transcript_churn", phaseKey, limit }` | same | queue | queue | 10s | `task-queue`, `workspace-wide` | yes | placeholder hint |
| Blocked bucket rows | `list-tasks` `{ status: "blocked", phaseKey, limit }` | same | queue | queue | 10s | `task-queue`, `workspace-wide` | yes | placeholder hint |
| Completed bucket rows | `list-tasks` `{ status: "completed", phaseKey, limit }` | same | queue | queue | 10s | `task-queue`, `workspace-wide` | yes | placeholder hint |
| Cancelled bucket rows | `list-tasks` `{ status: "cancelled", phaseKey, limit }` | same | queue | queue | 10s | `task-queue`, `workspace-wide` | yes | placeholder hint |

---

## Config host reads (extension-only)

| Data point | Source command | Builder / read path | UI section | Slice | Freshness SLA | Mutation invalidation | Lazy | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Config registry rows | `explain-config` (per key) | `loadConfigKeyRows` → `renderConfigSectionsHtml` | config | config | manual/event | `config`, `workspace-wide` | on-tab-activate | empty panel + error toast |
| Config validate preview | host `validateConfigInputValue` | `config-host.ts` | config | config | n/a (interactive) | `config` | on demand | inline validation message |
| Config set/unset | `config set` / `config unset` via CLI | `handleConfigSetMessage` / `handleConfigUnsetMessage` | config | config | n/a (mutation) | `config`, `status`, `agent` | n/a | restart banner when required |

---

## Mutation → slice invalidation (Step 9)

| `DashboardMutationKind` | Stale slices |
| --- | --- |
| `task-queue` | overview, queue, phase, agent, team, subagents, checkpoints |
| `ideas` | ideas, overview |
| `overview` | overview |
| `phase-journal` | phaseJournal, phase, queue |
| `status` | status |
| `config` | config, status, agent |
| `cae` | cae, status |
| `workspace-wide` | all slices |

Registry source of truth: `dashboard-slice-registry.ts` (`staleOnMutationKinds` per slice).

---

## Poll groups → slices

| Poll group | Interval | Slices | Visible-only |
| --- | ---: | --- | --- |
| critical | 2s | overview, phase, agent | no |
| queue | 5s | queue, ideas | no |
| ops | 10s | team, subagents, checkpoints | status tab |
| status | 30s | status | status tab |
| phaseJournal | 10s | phaseJournal | task-engine / phase-journal |
| cae | manual | cae | cae tab |
| config | event/manual | config | config tab |

---

## SQLite / file sources (read-side)

| Store | Tables / paths | Slices fed |
| --- | --- | --- |
| Task engine SQLite / JSON opt-out | active tasks, transitions | overview, queue, phase, agent |
| Planning SQLite | ideas, phase notes, workspace status row, planning generation | ideas, phaseJournal, phase, overview |
| Team / subagent / checkpoint SQLite | `kit_team_assignments`, `kit_subagent_*`, `kit_task_checkpoints` | team, subagents, checkpoints |
| CAE artifacts | `.ai/cae/**`, registry DB | cae |
| Config | `.workspace-kit/config.json`, registry metadata | config, status, agent |
| Git task-state projection | task-state sync metadata | status, overview |

---

## Cross-links

- Section lazy policy: `dashboard-section-registry.ts`
- Slice freshness + poll intervals: `dashboard-slice-registry.ts`
- Store API: `dashboard-data-store.ts`
- Freshness labels: `dashboard-slice-freshness.ts`
- Load trace: `dashboard-load-trace.ts` (`WORKSPACE_KIT_DEBUG_DASHBOARD=1`)
