# AGENT_ORCHESTRATION_PROJECTION.md

**Artifact:** A-PROJECTION (dashboard activity projection source contract)  
**WBS:** WBS-AO-080 / task **T100631**  
**Requires:** [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) (A-SCHEMA), [AGENT_ORCHESTRATION_ACTIVITY.md](./AGENT_ORCHESTRATION_ACTIVITY.md) (A-ACTIVITY), [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md) §7 (A-ARCH), [AGENT_ORCHESTRATION_FOUNDATION.md](./AGENT_ORCHESTRATION_FOUNDATION.md) §15  
**Blocks:** T-AO-610 (projection builder), T-AO-620 (projection tests), T-AC-050 / T-AC-101 / T-AC-201 (Agent Card implementation), T-AO-520 (Task Work Agent prompt)  
**Produced:** 2026-05-31  
**Status:** Approved for implementation  

---

## 1. Executive summary

A-PROJECTION defines how orchestration **read paths** assemble **`DashboardAgentActivitySummary`** — the stable view model for the Agent Activity Board in [AGENT_CARD_PLAN.md](./AGENT_CARD_PLAN.md).

| Principle | Rule |
| --- | --- |
| **Read-only** | Dashboard and projection builder **never mutate** orchestration tables |
| **Multi-source merge** | One row per logical agent/work unit; duplicate source rows **collapse** via merge keys |
| **Precedence** | Live activity wins for freshness; assignment/session/registry **enrich** rather than fork |
| **Confidence** | Every row carries `sourceConfidence` derived from source tier + lifecycle freshness |
| **Attention** | `blocked`, policy/human gates, stale leases, and failed handoffs surface in `needsAttention` |

```text
Orchestration SQLite + task store  →  buildDashboardAgentActivitySummary (read-only)
                                              ↓
                              DashboardAgentActivitySummary
                                              ↓
                         dashboardSummary.agentActivitySummary (new slice)
                         dashboardSummary.agentStatus (legacy single-status compat)
```

**Normative output shape:** AGENT_CARD_PLAN.md §7.3. **Activity lifecycle:** A-ACTIVITY §6. **Storage bridges:** A-SCHEMA §2–7; A-ARCH §7.

---

## 2. Scope and non-goals

### 2.1 In scope (this artifact)

- Input source inventory and field mapping into `DashboardAgentActivityRow`
- **Merge keys** and **duplicate collapse** rules
- **Source precedence** when fields conflict
- **`sourceConfidence`** calculation
- **`freshness.state`** and **`attention.state`** derivation (stale, blocked, needs-attention)
- **No-dashboard-mutation** invariant
- **AGENT_CARD_PLAN** compatibility (`agentActivitySummary` vs `agentStatus`)
- **Empty-store / first-run** dashboard behavior
- Worked merge examples for T-AO-620 test matrix

### 2.2 Out of scope (downstream tasks)

| Item | Owner |
| --- | --- |
| TypeScript implementation (`build-dashboard-agent-activity-summary.ts`) | T-AO-610 |
| Unit/integration tests | T-AO-620 |
| Extension UI render (`agentActivityBoard` slice) | T-AC-201+ |
| Event-stream realtime projection | Foundation §15 future work |
| Replacing `team-execution` command names | A-ARCH §8 |

---

## 3. Output contract

### 3.1 Aggregate: `DashboardAgentActivitySummary`

Canonical TypeScript (AGENT_CARD_PLAN §7.3):

```ts
export type DashboardAgentActivitySummary = {
  schemaVersion: 1;
  generatedAt: string;
  source: "live_activity" | "derived_only" | "mixed";
  activeCount: number;
  staleCount: number;
  needsAttentionCount: number;
  main: DashboardAgentActivityRow | null;
  active: DashboardAgentActivityRow[];
  needsAttention: DashboardAgentActivityRow[];
  inferredFallback: DashboardAgentStatusSummary | null;
  sourceMap: {
    liveActivityCount: number;
    teamExecutionCount: number;
    subagentSessionCount: number;
    derivedFallbackUsed: boolean;
  };
};
```

| Field | Semantics |
| --- | --- |
| `generatedAt` | Builder wall clock (UTC ISO-8601) at read time |
| `source` | `live_activity` if any row has `source: "live_activity"`; `derived_only` if all rows are derived/registry/team_execution; `mixed` otherwise |
| `activeCount` | Rows in `active` with `freshness.state` ∈ `{ fresh, aging }` |
| `staleCount` | Rows with `freshness.state === "stale"` (live lease still within TTL) |
| `needsAttentionCount` | Rows in `needsAttention` |
| `main` | Primary row for compact Agent Card header — §5.4 |
| `inferredFallback` | Legacy single-status mirror when no merged rows exist — §10 |
| `sourceMap` | Diagnostic counts of raw source rows **before** collapse |

### 3.2 Row: `DashboardAgentActivityRow`

Each row is a **collapsed** view of zero or more source records sharing a merge key (§4).

| Section | Purpose |
| --- | --- |
| `rowId` | Stable id for UI keys — §4.1 |
| `displayName` | Human label — §4.3 |
| `role` | Orchestration role for chip styling |
| `status` / `statusLabel` | Dashboard kind + label (from winning source per §5) |
| `source` | Highest-precedence contributing source tier |
| `sourceConfidence` | Aggregated confidence — §6 |
| `work` | Task/phase/command context for board rows |
| `refs` | Opaque ids for drill-down (read-only links) |
| `freshness` | Lifecycle from live lease or synthetic — §6–7 |
| `attention` | Operator signal — §7 |

**Schema version:** Rows and summary use `schemaVersion: 1`. Breaking field changes require a new schema version and coordinated Agent Card update.

---

## 4. Merge keys and duplicate collapse

### 4.1 Primary merge key (v1 normative)

Collapse sources into one row when **any** of these equality sets match:

```text
Tier A (strongest):  agentId + sessionId
Tier B:              agentId + assignmentId        (when sessionId absent on one side)
Tier C:              agentId + taskId              (when both refer to same T### execution)
Tier D (fallback):   subagentDefinitionId + taskId (registry-only rows, no agentId)
```

**Algorithm (deterministic):**

1. Collect candidate rows from each source (§5.1).
2. Assign each candidate a **merge bucket** using first matching tier (A → D).
3. Within a bucket, **merge fields** per precedence (§5.2); never emit two rows for the same bucket.
4. If Tier A and Tier C would split the same physical worker, **Tier A wins** — session-scoped identity beats task-only heuristics.

### 4.2 `rowId` construction

```text
rowId = "row:" + base64url(sha256(mergeKeyCanonical))
mergeKeyCanonical = "A|{agentId}|{sessionId}" | "B|{agentId}|{assignmentId}" | ...
```

Implementations MAY use a simpler v1 scheme `row:{agentId}:{sessionId}` when both are present; tests must assert stability across rebuilds.

### 4.3 Display name precedence

When merging, pick the first non-empty:

```text
1. activity.details.agentDisplayName
2. activity.details.customAgentName
3. AgentDefinition.displayName (from registry / metadata bridge)
4. subagent definition label
5. agentId (last resort)
```

### 4.4 Duplicate source rows (same table)

| Situation | Collapse rule |
| --- | --- |
| Multiple non-expired leases for same `agentId` + `sessionId` | Keep lease with **latest `updatedAt`**; discard others for projection (storage may retain until TTL) |
| Multiple open sessions same `agentId` | **Separate rows** — distinct `sessionId` → distinct Tier A keys |
| Assignment + session + activity for same worker | **Single row** — merge per §5 |
| Orchestrator + worker on same task | **Separate rows** — different `agentId` |

---

## 5. Source inventory and precedence

### 5.1 Input sources (v1)

| # | Source | SQLite / API | Provides |
| --- | --- | --- | --- |
| 1 | **Live activity lease** | `kit_agent_activity_leases` | `kind`, `label`, heartbeat, `taskId`, `command`, TTL |
| 2 | **AgentSession** (metadata bridge) | `kit_subagent_sessions.metadata.agentSession` | `currentAssignmentId`, `currentActivityId`, session status |
| 3 | **Team assignment** | `kit_team_assignments` | `status`, worker/supervisor ids, `executionTaskId`, handoff summary |
| 4 | **Subagent session** | `kit_subagent_sessions` | `definitionId`, `executionTaskId`, session `status` |
| 5 | **AgentDefinition** | `kit_subagent_definitions` + metadata | Role, display name, host hints |
| 6 | **Derived agent status** | `buildDashboardAgentStatus()` heuristics | Single-status fallback from task/planning/team facts |
| 7 | **Task row** (read-only enrich) | Task store via planning SQLite | Title, status, blockers, phase — **never** a standalone row source |

Future sources (`future_runtime`, assignment metadata v2 fields) attach at tier 2–3 without changing merge key tiers.

### 5.2 Field precedence (conflicts within one merged row)

When sources disagree on a displayed field, apply **first non-null winner**:

| Field group | Precedence order |
| --- | --- |
| `status` / `statusLabel` | live activity → assignment status mapping → session status → derived |
| `work.taskId` | live activity → assignment.executionTaskId → session.executionTaskId → derived |
| `work.title` | task title (by taskId) → activity.label → assignment title metadata → null |
| `work.command` | live activity → handoff last command → null |
| `refs.*` | Union of all sources; live activity ids win on conflict |
| `freshness.*` | live activity only; else synthetic `unknown` with `updatedAt` from best source |
| `role` | AgentDefinition.role → assignment role inference → `unknown` |

**Assignment status → dashboard kind mapping (when no live lease):**

| Assignment `status` | Suggested `status` | `attention.state` |
| --- | --- | --- |
| `assigned` | `ready_task` or `working_task` | `none` |
| `blocked` | `blocked` | `blocked` |
| `submitted` | `validating` or `awaiting_instruction` | `none` unless handoff terminal is `needs_review` → `needs_human` |
| `reconciled` / `cancelled` | Row **omitted** from `active` (may appear in history slice later) |

### 5.3 Source tier precedence (row-level `source` field)

```text
1. live_activity
2. team_execution        (assignment-driven row without lease)
3. subagent_registry     (open session, no assignment)
4. derived               (heuristic-only row)
5. future_runtime        (reserved)
```

The row's `source` is the **highest tier** that contributed the winning `status` field.

### 5.4 Main agent selection (`summary.main`)

Pick **one** row for compact header / legacy `agentStatus` compat:

```text
1. Row with live_activity + freshness fresh/aging + role orchestrator|supervisor
2. Else row with live_activity + freshness fresh/aging (any role)
3. Else row with attention.state != none (highest severity: blocked > needs_policy > needs_human > stale)
4. Else first row in active sorted by updatedAt desc
5. Else null → use inferredFallback (§10)
```

---

## 6. Confidence derivation

### 6.1 `sourceConfidence` on each row

Start from base tier, then adjust for freshness:

| Base (from row `source`) | Base confidence |
| --- | --- |
| `live_activity` + lifecycle `fresh` | `high` |
| `live_activity` + lifecycle `aging` | `medium` |
| `live_activity` + lifecycle `stale` | `low` |
| `team_execution` (open assignment, no lease) | `medium` |
| `subagent_registry` | `low` |
| `derived` | `low` |
| Malformed metadata skipped in permissive mode | `low` (row may be omitted — §8) |

**A-ACTIVITY alignment:** lifecycle → confidence mapping matches A-ACTIVITY §6.4 for live leases.

### 6.2 Aggregate `summary.source`

| Condition | `summary.source` |
| --- | --- |
| At least one row with `source === "live_activity"` and non-expired lease | Includes `live_activity` component |
| All rows derived/registry/team only | `derived_only` |
| Both live and non-live rows | `mixed` |

---

## 7. Freshness and attention derivation

### 7.1 `freshness.state` (live lease)

Use A-ACTIVITY §6.1 formulas on `updatedAt` / `expiresAt`:

```text
expired:  now >= expiresAt        → lease excluded from live merge; fall back
stale:    NOT expired AND age > 60s
aging:    NOT expired AND 30s < age <= 60s
fresh:    NOT expired AND age <= 30s
unknown:  no live lease on row     → use best source updatedAt only
```

**Visibility rule:** `stale` leases **remain in `active`** until `expiresAt` — operators see degraded signal, not silent drop (A-ACTIVITY §6.3).

### 7.2 `attention.state` (deterministic priority)

Evaluate in order; first match wins:

| Priority | Condition | `attention.state` | Typical `message` |
| --- | --- | --- | --- |
| 1 | Assignment `status === "blocked"` OR activity `kind === "blocked"` | `blocked` | Blocker summary from handoff/assignment metadata |
| 2 | Activity `kind === "awaiting_policy_approval"` | `needs_policy` | Policy operation label |
| 3 | Activity `kind === "awaiting_human_gate"` OR task human-gate metadata | `needs_human` | Gate description |
| 4 | Handoff terminal `needs_review` / `failed` on open assignment | `failed` or `needs_human` | Truncated handoff summary |
| 5 | `freshness.state === "stale"` on live row | `stale` | "Heartbeat overdue" |
| 6 | Activity `kind === "unavailable"` OR no sources | `unavailable` | "No agent signal" |
| 7 | Else | `none` | `null` |

**`needsAttention` array:** All rows where `attention.state !== "none"`, sorted by priority above then `updatedAt` desc.

**`staleCount`:** Count rows with `freshness.state === "stale"` (not the same as `attention.state === "stale"` — a row can be stale with attention stale).

### 7.3 Blocked vs stale (disambiguation)

| Signal | Meaning | Authoritative store |
| --- | --- | --- |
| **Blocked** | Work cannot proceed; orchestrator action required | Assignment `blocked` + handoff/blocker tasks |
| **Stale** | Live lease heartbeat degraded; worker may still be healthy | Activity lease only |
| **Expired** | Lease dead; projection uses fallback sources | Activity TTL |

Blocked **does not** imply stale and vice versa. A `blocked` row with `fresh` lease is valid (worker reported blocker promptly).

---

## 8. No-dashboard-mutation rule

### 8.1 Normative invariant

```text
dashboard-summary / extension UI / projection builder  →  READ ONLY
wk run (Tier A/B) + agents                             →  WRITE PATH
```

| Forbidden on dashboard interaction | Allowed |
| --- | --- |
| INSERT/UPDATE/DELETE on orchestration tables | Render `DashboardAgentActivitySummary` |
| Implicit `set-agent-activity` on refresh | Explicit `wk run` with `policyApproval` when required |
| Assignment reconcile / handoff accept from card clicks (v1) | Link to operator docs / copy CLI argv |

**Policy cross-ref:** A-POLICY P-CMD-08; A-ACTIVITY §10; A-ARCH §7.1.

### 8.2 Builder placement

Future module path (T-AO-610): `src/modules/task-engine/dashboard/build-dashboard-agent-activity-summary.ts`

- Called from `build-dashboard-base.ts` during `dashboard-summary`
- **Must not** import command handlers or call mutating store APIs
- **May** read task store, planning SQLite orchestration tables, and pure helpers (`dashboard-agent-status.ts`, `agent-activity-store.ts` read fns)

### 8.3 Degraded read behavior

| Failure | Behavior |
| --- | --- |
| Activity table missing / query error | Omit live rows; use team/session/derived; set `sourceMap.liveActivityCount = 0` |
| Malformed lease row | Skip row; log advisory; do not fail entire summary |
| Malformed assignment metadata (permissive) | Skip orchestration enrich; legacy heuristics (A-COMPAT) |
| Empty orchestration store | §10 |

---

## 9. AGENT_CARD_PLAN compatibility

### 9.1 Dual field strategy

| Field | Role |
| --- | --- |
| `dashboardSummary.agentStatus` | **Legacy** single-status compat — `main` row condensed to `DashboardAgentStatusSummary` OR `inferredFallback` |
| `dashboardSummary.agentActivitySummary` | **New** stable board view model — full `DashboardAgentActivitySummary` |

**Compatibility rule (AGENT_CARD_PLAN §7.2):**

```text
agentStatus ≈ condense(main row) ?? inferredFallback ?? unavailable derived
```

Existing extension slices (`agentStatus`, `teamExecution`, `subagentRegistry`) **remain**. Agent Activity Board reads **`agentActivitySummary` only**.

### 9.2 Renderer rule

Dashboard renderer **must not** query task-engine internals directly. It consumes:

```ts
dashboardSummary.agentActivitySummary: DashboardAgentActivitySummary
```

Optional v1.1 enrichments parse `details` best-effort (AGENT_CARD_PLAN §7.4) — projection passes through unknown `details` keys without loss.

### 9.3 Type alignment checklist

| AGENT_CARD_PLAN §7.3 field | A-PROJECTION section |
| --- | --- |
| `DashboardAgentActivityRow` | §3.2 |
| `source` / `sourceConfidence` | §5.3, §6 |
| `freshness.state` | §7.1 |
| `attention.state` | §7.2 |
| Precedence list §7.5 | §5.2–5.3 |
| Input data §9 | §5.1 |

---

## 10. Empty-store and first-run behavior

When **no orchestration rows exist** (fresh workspace, pre–Phase 127 implementation, or idle kit):

| Store state | Projection behavior |
| --- | --- |
| `kit_agent_activity_leases` empty | `sourceMap.liveActivityCount = 0`; no live rows |
| No open team assignments | `sourceMap.teamExecutionCount = 0` |
| No open subagent sessions | `sourceMap.subagentSessionCount = 0` |
| Task store may still have tasks | Derived heuristics **may** produce `inferredFallback` via existing `buildDashboardAgentStatus` |

**Expected summary shape (empty orchestration, idle workspace):**

```json
{
  "schemaVersion": 1,
  "source": "derived_only",
  "activeCount": 0,
  "staleCount": 0,
  "needsAttentionCount": 0,
  "main": null,
  "active": [],
  "needsAttention": [],
  "inferredFallback": {
    "schemaVersion": 1,
    "source": "derived",
    "kind": "awaiting_instruction",
    "label": "Awaiting Instruction",
    "confidence": "low"
  },
  "sourceMap": {
    "liveActivityCount": 0,
    "teamExecutionCount": 0,
    "subagentSessionCount": 0,
    "derivedFallbackUsed": true
  }
}
```

**First-run operator experience:**

- Agent Activity Board shows **empty active list** with compact fallback chip from `inferredFallback` (or "No agents active" UX copy in A-UX).
- **No errors** — empty store is valid v1 state.
- Dashboard **does not** seed demo leases or assignments.
- Once worker calls `set-agent-activity`, `activeCount >= 1` without restart.

**Today vs target:** `build-dashboard-base.ts` currently sets only `agentStatus = liveActivity ?? derived` (single lease). T-AO-610 adds `agentActivitySummary` without changing empty-store fallback semantics for `agentStatus`.

---

## 11. Merge examples (T-AO-620 matrix)

Examples reference A-TEST §9 cases.

### 11.1 P1 — Live activity + assignment + session

**Inputs:**

- Lease: `agent-activity-working-task.v1.json` (`kind: working_task`, fresh)
- Assignment: `assigned`, same `agentId`, `taskId: T100631`
- Session: `open`, same `agentId` + `sessionId`

**Output:** One row; `source: live_activity`, `sourceConfidence: high`, `refs` union populated.

### 11.2 P2 — Subagent session fallback (no lease)

**Inputs:** Open session linked to `T100625`; no lease row.

**Output:** One row; `source: subagent_registry`, `status: ready_task`, `sourceConfidence: low`.

### 11.3 P3 — Active assignment, no activity

**Inputs:** Assignment `assigned`, worker id present; no lease.

**Output:** One row; `source: team_execution`, `status: ready_task`, `attention: none`.

### 11.4 P4 — Stale activity lease

**Inputs:** Lease with `updatedAt` 90s ago, `expiresAt` in future.

**Output:** Row in `active` + `needsAttention`; `freshness.state: stale`, `attention.state: stale`, `sourceConfidence: low`. `agentStatus` compat may still use lease kind until expired (A-ACTIVITY §6.3).

### 11.5 P5 — Blocked assignment

**Inputs:** Assignment `blocked`; lease optional.

**Output:** `attention.state: blocked`; handoff summary truncated to 120 chars in `attention.message`.

### 11.6 P6 — Completed handoff / reconciled

**Inputs:** Assignment `reconciled`.

**Output:** Row **excluded** from `active` and `needsAttention` (terminal).

### 11.7 P7 — Malformed metadata (permissive)

**Inputs:** Assignment metadata fails schema; permissive mode.

**Output:** Row omitted or `sourceConfidence: low` with registry fallback only.

### 11.8 P8 — Legacy assignment (no `schemaVersion`)

**Inputs:** Pre-orchestration assignment row.

**Output:** Same as today's dashboard heuristics; no regression vs `agentStatus` derived path.

### 11.9 E1 — Empty store (first-run)

**Inputs:** All orchestration tables empty; task store default.

**Output:** §10 JSON shape; `derivedFallbackUsed: true`.

---

## 12. Verification and human approval

### 12.1 Acceptance mapping (T100631 / A-PROJECTION)

| Criterion | Section |
| --- | --- |
| Projection contract feeds `DashboardAgentActivitySummary` | §3, §9 |
| Dashboard remains read-only for orchestration state | §8 |
| Duplicate source rows collapsible | §4 |
| Empty-store / first-run behavior documented | §10 |
| Verification evidence + operator sign-off | §12.2–12.3 |

### 12.2 Operator review sign-off (required)

| Field | Value |
| --- | --- |
| Artifact | A-PROJECTION / `AGENT_ORCHESTRATION_PROJECTION.md` |
| Reviewer | Antigravity |
| Decision | ☑ Approve as written |
| Notes | Approved per user request. |
| Date | 2026-06-02 |

Dependent tasks (**T-AO-610**, **T-AO-620**, **T-AC-050+**) should treat merge precedence, attention derivation, and empty-store rules as **draft** until the table above records approval.

### 12.3 Verification evidence (automated / agent)

| Check | Result |
| --- | --- |
| Aligns with foundation §15 projection decision | §1, §8 |
| Aligns with A-ARCH §7 dashboard boundary | §8 |
| Aligns with A-ACTIVITY lifecycle + confidence | §6, §7.1 |
| Aligns with A-SCHEMA identifiers and activity kinds | §4, §5 |
| AGENT_CARD_PLAN §7.3–7.6 type compatibility | §9 |
| Merge examples cover A-TEST §9 P1–P8 + empty store | §11 |
| No-dashboard-mutation invariant explicit | §8 |
| Phase 126 task manifest intact (12 tasks, planRef unchanged) | Verified — §12.4 |
| `pnpm run check` (repo gate) | Pass — exit 0 on 2026-05-31 (feature/T100631-orchestration-projection) |

### 12.4 Phase 126 manifest spot-check

Verified via `workspace-kit run list-tasks '{"phaseKey":"126","limit":20}'` on delivery branch — **12 tasks**, shared `metadata.planRef: plan-artifact:1b4555aa-842a-439e-8ab5-6911df648c16`, WBS ids AO-010 through AO-100 present. No plan-artifact or task-batch edits in this deliverable.

---

## 13. Related artifacts

| Doc / path | Role |
| --- | --- |
| [AGENT_CARD_PLAN.md](./AGENT_CARD_PLAN.md) | UX + TypeScript view model (§7) |
| [AGENT_ORCHESTRATION_ACTIVITY.md](./AGENT_ORCHESTRATION_ACTIVITY.md) | Lifecycle + TTL (A-ACTIVITY) |
| [AGENT_ORCHESTRATION_CONTRACTS.md](./AGENT_ORCHESTRATION_CONTRACTS.md) | Field tables (A-SCHEMA) |
| [AGENT_ORCHESTRATION_ARCHITECTURE.md](./AGENT_ORCHESTRATION_ARCHITECTURE.md) | Storage boundary (A-ARCH §7) |
| [AGENT_ORCHESTRATION_TEST_STRATEGY.md](./AGENT_ORCHESTRATION_TEST_STRATEGY.md) | Projection test matrix (A-TEST §9) |
| [AGENT_ORCHESTRATION_TASKS.md](./AGENT_ORCHESTRATION_TASKS.md) | WBS T-AO-080, T-AO-610 |
| `src/modules/task-engine/dashboard/build-dashboard-base.ts` | Current `agentStatus` assembly |
| `src/modules/task-engine/dashboard/dashboard-agent-status.ts` | Derived heuristics |
| `fixtures/agent-orchestration/agent-activity-working-task.v1.json` | Golden lease for P1 |

---

## 14. Document history

| Date | Change |
| --- | --- |
| 2026-05-31 | Initial A-PROJECTION for Phase 126 / T100631 |
