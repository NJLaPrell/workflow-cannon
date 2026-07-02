# PlanArtifact v1 — schema specification

**Artifact:** `PLANNER_SCHEMA.md` (repo root)  
**Status:** Draft for human review (**A-SCHEMA**)  
**Architecture:** [`PLANNER_ARCHITECTURE.md`](./PLANNER_ARCHITECTURE.md) (**A-ARCH**)  
**Product direction:** [`PLANNER.md`](./PLANNER.md)  
**Implementation target:** `schemas/planning/plan-artifact.v1.schema.json`, `src/core/planning/plan-artifact-v1.ts` (WP-1)

This document is the **field-level contract** for PlanArtifact v1 **plan-section content** embedded in the **unified IdeaPlan document** (Phase 140). JSON Schema (WP-1.2) and TypeScript types (WP-1.1) must match this spec after **A-SCHEMA** approval.

---

## Unified IdeaPlan document (Phase 140)

A single persisted **IdeaPlan document** (`planRef` like `plan-artifact:<planId>`) traces an idea from inception through delivery. The document envelope and per-state sections are defined by **per-state schema files** under [`schemas/ideas/states/`](./schemas/ideas/states/). Each file includes an **`agentDirective`** section that is **machine-authoritative** for agent behavior in that state.

| State | Schema file | Active section(s) |
| --- | --- | --- |
| `idea` | [`schemas/ideas/states/idea.schema.json`](./schemas/ideas/states/idea.schema.json) | envelope only |
| `brainstorming` | [`schemas/ideas/states/brainstorming.schema.json`](./schemas/ideas/states/brainstorming.schema.json) | `brainstorm` |
| `planning` | [`schemas/ideas/states/planning.schema.json`](./schemas/ideas/states/planning.schema.json) | `brainstorm`, `plan` |
| `reviewed` | [`schemas/ideas/states/reviewed.schema.json`](./schemas/ideas/states/reviewed.schema.json) | `brainstorm`, `plan`, `review` |
| `accepted` | [`schemas/ideas/states/accepted.schema.json`](./schemas/ideas/states/accepted.schema.json) | + `acceptance` |
| `delivered` | [`schemas/ideas/states/delivered.schema.json`](./schemas/ideas/states/delivered.schema.json) | + `delivery` |

**Storage:** `.workspace-kit/planning/plan-artifacts/{planId}/artifact.v{version}.json` — one versioned file per document write, not separate artifact identities per lifecycle stage.

**Human companion playbooks:** [`.ai/playbooks/brainstorm-session.md`](./.ai/playbooks/brainstorm-session.md) (brainstorming), [`.ai/playbooks/planner-chat.md`](./.ai/playbooks/planner-chat.md) (planning). Playbooks defer to each state's `agentDirective`; they do not redefine question sequences or formulas.

The sections below (§1 onward) describe the **`plan` section** fields (PlanArtifact v1 content) that `draft-plan-artifact`, `review-plan-artifact`, and `accept-plan-artifact` read and write on the unified document during `planning` and later states.

---

## 1. Envelope and versioning

Every persisted document is a **PlanArtifact document** with a fixed envelope:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | `1` (literal) | Yes | PlanArtifact major version. Bump only with migration story. |
| `planId` | string | Yes | Stable id (UUID v4 recommended). Assigned on first persist. |
| `version` | integer ≥ 1 | Yes | Monotonic per `planId`. New draft/review/accept writes increment. |
| `planRef` | string | Yes | Stable reference for task provenance (e.g. `plan-artifact:{planId}` or `planning:new-feature:2026-05-27T…`). |
| `status` | enum | Yes | `draft` \| `reviewed` \| `accepted` \| `finalized` \| `superseded`. |
| `identity` | object | Yes | See §2.1. |
| `provenance` | object | Yes | See §2.18. |
| `approvalRecord` | object | No* | Required when `status` is `accepted` or `finalized`. See §2.14. |
| …sections | various | Profile-dependent | See §3. |

\* `approvalRecord` may be present as an empty stub in `draft`; `accept-plan-artifact` must populate `confirmed`, `approvedVersion`, and actor fields.

**File layout (per A-ARCH):** `.workspace-kit/planning/plan-artifacts/{planId}/artifact.v{version}.json` — unified IdeaPlan document versions; the `plan` section carries PlanArtifact v1 fields when `status` is `planning` or later.

---

## 2. Section reference

### 2.1 `identity` (required)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | Yes | Human-readable plan title. |
| `planningType` | enum | Yes | Aligns with `build-plan` types: `task-breakdown`, `sprint-phase`, `task-ordering`, `new-feature`, `change`. |
| `summary` | string | No | One-paragraph elevator pitch. |
| `tags` | string[] | No | Free-form labels for dashboard filter. |

### 2.2 `goals` (required)

Non-empty `string[]`. Each entry is a measurable outcome statement.

### 2.3 `nonGoals` (required)

`string[]` (may be empty but field must be present). Explicit out-of-scope statements.

### 2.4 `userStories` (profile-dependent)

Array of:

```json
{ "id": "US-1", "asA": "…", "iWant": "…", "soThat": "…", "priority": "must|should|could" }
```

Required for **`full-feature`** profile; optional for **`minimal`** / **`refactor`**.

### 2.5 `valueAssessment` (required)

| Field | Type | Required |
| --- | --- | --- |
| `impact` | string | Yes |
| `confidence` | `high\|medium\|low` | Yes |
| `rationale` | string | No |

### 2.6 `riskAssessment` (required)

Array of `{ "id", "description", "severity": "high|medium|low", "mitigation"?: string }`. May be empty array.

### 2.7 `technicalImpact` (required)

| Field | Type | Required |
| --- | --- | --- |
| `systemsTouched` | string[] | Yes (may be empty) |
| `compatibilityNotes` | string | No |
| `migrationImpact` | string | No |

### 2.8 `architecture` (profile-dependent)

| Field | Type | Required |
| --- | --- | --- |
| `overview` | string | Yes when section required |
| `decisions` | `{ "id", "decision", "rationale" }[]` | No |
| `diagrams` | `{ "title", "mermaid"?: string, "caption"?: string }[]` | No |

Required for **`full-feature`** and **`change`** with cross-module touch; optional for **`minimal`**.

### 2.9 `uiUxDirection` (profile-dependent)

| Field | Type | Required |
| --- | --- | --- |
| `hasUiChanges` | boolean | Yes when section present |
| `summary` | string | Yes if `hasUiChanges` |
| `mockupRefs` | string[] | No | URLs or repo paths, not binary blobs in v1. |

Required when `technicalImpact.systemsTouched` includes dashboard/extension surfaces or `identity.planningType` is `new-feature` with UI scope.

### 2.10 `testingStrategy` (required)

| Field | Type | Required |
| --- | --- | --- |
| `layers` | string[] | Yes | e.g. `unit`, `integration`, `extension`, `e2e-cli`. |
| `criticalPaths` | string[] | Yes |
| `outOfScopeTesting` | string[] | No |

### 2.11 `implementationGuidance` (required)

`string[]` — concrete tips for implementers (patterns, files, commands).

### 2.12 `whatNotToDo` (required)

`string[]` — anti-patterns and forbidden shortcuts.

### 2.13 `assumptions` / `openQuestions` (required)

Both are `string[]`. `openQuestions` may be non-empty at `draft`; **accept** requires either empty `openQuestions` or explicit `approvalRecord.openQuestionsAccepted: string[]` listing deferred ids.

### 2.14 `approvalRecord` (required at accept/finalize)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | `1` | Yes | |
| `confirmed` | boolean | Yes | Must be `true` on accept. |
| `approvedVersion` | integer | Yes | Pins artifact version accepted. |
| `approvedAt` | ISO-8601 | Yes | |
| `approvedBy` | string | Yes | Actor id/email. |
| `planRef` | string | Yes | **Gap 4:** duplicate of envelope `planRef` for task metadata copy-through. |
| `reviewSummary` | string | No | Last review outcome shorthand. |
| `openQuestionsAccepted` | string[] | No | Deferred OQ text or ids. |

### 2.15 `wbs` (required)

Non-empty array of **WBS items** (§4). Minimum one row for any plan intended to finalize.

### 2.16 `phaseRecommendations` (required)

Array of:

```json
{
  "phaseKey": "111",
  "label": "Phase 111",
  "rationale": "…",
  "isPrimary": true
}
```

At least one entry; exactly one should have `isPrimary: true` when multiple phases suggested.

### 2.17 `taskGenerationPayloads` (optional denormalized)

**Decision (v1):** Canonical task materialization source is **`wbs[].generatedTaskPayload`** (§4). Top-level `taskGenerationPayloads[]` is **optional** read-only denormalization produced by `finalize-plan-to-phase` dry-run for dashboard preview — not required on draft input.

### 2.18 `provenance` (required)

| Field | Type | Required |
| --- | --- | --- |
| `createdAt` | ISO-8601 | Yes |
| `updatedAt` | ISO-8601 | Yes |
| `createdBy` | string | Yes |
| `source` | enum | Yes | `draft-plan-artifact` \| `import-build-plan` \| `import-wishlist` |
| `chatSessionRef` | string | No | Opaque id, not full transcript. |
| `parentPlanId` | string | No | When forked from prior plan. |
| `sourceIdeaId` | string | No | Idea id that seeded the plan artifact, when the plan originates from an Ideas row. |
| `previousPlanArtifacts` | string[] | No | Prior plan artifact refs or ids superseded or carried forward for the same idea. |

---

## 3. Conditional section profiles

Review command selects a **profile** (default derived from `identity.planningType`):

| Profile | When | Extra required sections beyond core |
| --- | --- | --- |
| **`minimal`** | Small fix, single WBS row | Core only; `userStories` optional. |
| **`refactor`** | `planningType: change`, no UI | `architecture` required; `uiUxDirection` omitted or `hasUiChanges: false`. |
| **`full-feature`** | `new-feature`, multi WBS | `userStories`, `architecture`, `uiUxDirection` (if UI in scope). |
| **`sprint-phase`** | Phase/sprint planning | `phaseRecommendations` must cover multiple phases; WBS may reference existing tasks. |

**Core (all profiles):** `identity`, `goals`, `nonGoals`, `valueAssessment`, `riskAssessment`, `technicalImpact`, `testingStrategy`, `implementationGuidance`, `whatNotToDo`, `assumptions`, `openQuestions`, `wbs`, `phaseRecommendations`, `provenance`.

---

## 4. WBS item shape

Each `wbs[]` element:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `wbsId` | string | Yes | Stable within plan (e.g. `WBS-1`, `1.2`). |
| `path` | string | No | Hierarchical path (`1`, `1.1`) for ordering/display. |
| `title` | string | Yes | |
| `goalMapping` | string[] | Yes | References goal text or goal index ids. |
| `suggestedTaskTitle` | string | Yes | Becomes task `title` unless overridden. |
| `approach` | string | Yes | |
| `technicalScope` | string[] | Yes | Non-empty. |
| `acceptanceCriteria` | string[] | Yes | Non-empty. |
| `testingVerification` | string[] | Yes | Non-empty. |
| `dependsOn` | string[] | Yes | WBS ids; may be empty. |
| `recommendedPhase` | string | No | Phase key hint. |
| `recommendedOrder` | integer | No | Sort key within phase. |
| `sizingConfidence` | `high\|medium\|low` | Yes | Session-fit signal, not calendar estimate. |
| `riskNotes` | string | No | |
| `doneMeans` | string | Yes | Plain-language completion definition. |
| `generatedTaskPayload` | object | Yes | convert-wishlist-compatible row (§5). |

---

## 5. `generatedTaskPayload` (task-engine alignment)

Must be sufficient for `persist-planning-execution-drafts` / `buildTaskFromConversionPayload`:

| Field | Type | Required |
| --- | --- | --- |
| `id` | `T###` | No | Allocated at finalize if omitted. |
| `title` | string | Yes |
| `type` | string | No | Default `workspace-kit`. |
| `priority` | `P1\|P2\|P3` | No |
| `phase` | string | No |
| `phaseKey` | string | No | Overridden by finalize argv `targetPhaseKey`. |
| `approach` | string | Yes |
| `technicalScope` | string[] | Yes |
| `acceptanceCriteria` | string[] | Yes |
| `dependsOn` | string[] | No |
| `status` | `proposed\|ready` | No |

**Provenance on materialized tasks** (written by finalize, not in plan file):

```json
"metadata": {
  "planRef": "<envelope.planRef>",
  "planningProvenance": {
    "planId": "…",
    "planVersion": 2,
    "wbsId": "WBS-3",
    "wbsPath": "1.3",
    "source": "finalize-plan-to-phase"
  }
}
```

---

## 6. Legacy mapping notes

### 6.1 `build-plan` wishlist artifact → PlanArtifact v1

| `PlanningWishlistArtifact` (v1) | PlanArtifact v1 |
| --- | --- |
| `schemaVersion` | `schemaVersion` (plan envelope) |
| `planningType` | `identity.planningType` |
| `generatedAt` | `provenance.createdAt` |
| `goals` | `goals` |
| `approach` | First `implementationGuidance[]` entry or WBS aggregate |
| `majorTechnicalDecisions` | `architecture.decisions[]` |
| `candidateFeaturesOrChanges` | `technicalImpact.systemsTouched` + WBS scope seeds |
| `assumptions` | `assumptions` |
| `openQuestions` | `openQuestions` |
| `risksAndConstraints` | `riskAssessment[]` |
| `sourceAnswers` | `provenance` extension `sourceAnswers` (optional, redacted in dashboard) |

Import path (WP-8 / A-COMPAT): `source: import-build-plan` creates `draft` with single WBS row; operator refines before review.

### 6.2 `build-plan` session snapshot

`DashboardPlanningSessionV1` (`src/core/planning/build-plan-session-file.ts`) remains **interview state only**. It does not satisfy PlanArtifact schema. On finalize interview → agent calls `draft-plan-artifact` with mapped fields.

### 6.3 Wishlist intake task rows

Wishlist tasks in task-engine are **intake**, not PlanArtifact. Conversion: operator accepts plan → `finalize-plan-to-phase` creates execution tasks; optional future command links wishlist id in `provenance.parentPlanId`.

---

## 7. JSON examples

### 7.1 Minimal plan (single WBS)

```json
{
  "schemaVersion": 1,
  "planId": "550e8400-e29b-41d4-a716-446655440000",
  "version": 1,
  "planRef": "plan-artifact:550e8400-e29b-41d4-a716-446655440000",
  "status": "draft",
  "identity": {
    "title": "Add plan artifact JSON schema file",
    "planningType": "change",
    "summary": "Introduce schemas/planning/plan-artifact.v1.schema.json"
  },
  "goals": ["PlanArtifact v1 validates in CI"],
  "nonGoals": ["Dashboard UI"],
  "valueAssessment": { "impact": "Unblocks command implementation", "confidence": "high" },
  "riskAssessment": [],
  "technicalImpact": { "systemsTouched": ["src/core/planning", "schemas/planning"] },
  "testingStrategy": {
    "layers": ["unit"],
    "criticalPaths": ["schema validates minimal fixture"]
  },
  "implementationGuidance": ["Mirror fields in PLANNER_SCHEMA.md"],
  "whatNotToDo": ["Do not hand-edit task store for plan status"],
  "assumptions": ["A-SCHEMA approved before WP-1 coding"],
  "openQuestions": [],
  "wbs": [
    {
      "wbsId": "WBS-1",
      "title": "Add JSON Schema",
      "goalMapping": ["PlanArtifact v1 validates in CI"],
      "suggestedTaskTitle": "Add plan-artifact.v1.schema.json",
      "approach": "Author schema from PLANNER_SCHEMA.md",
      "technicalScope": ["schemas/planning/plan-artifact.v1.schema.json"],
      "acceptanceCriteria": ["Minimal fixture passes validation"],
      "testingVerification": ["test/plan-artifact-schema.test.mjs"],
      "dependsOn": [],
      "sizingConfidence": "medium",
      "doneMeans": "Schema file committed and referenced in WP-1.2",
      "generatedTaskPayload": {
        "title": "Add plan-artifact.v1.schema.json",
        "approach": "Author schema from PLANNER_SCHEMA.md",
        "technicalScope": ["schemas/planning/plan-artifact.v1.schema.json"],
        "acceptanceCriteria": ["Minimal fixture passes validation"]
      }
    }
  ],
  "phaseRecommendations": [
    { "phaseKey": "110", "label": "Phase 110", "rationale": "Current planner phase", "isPrimary": true }
  ],
  "provenance": {
    "createdAt": "2026-05-27T06:00:00.000Z",
    "updatedAt": "2026-05-27T06:00:00.000Z",
    "createdBy": "agent",
    "source": "draft-plan-artifact"
  }
}
```

### 7.2 Full feature plan (excerpt)

Truncated for review — shows optional sections and multiple WBS rows:

```json
{
  "schemaVersion": 1,
  "planId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "version": 3,
  "planRef": "plan-artifact:7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "status": "reviewed",
  "identity": {
    "title": "PlanArtifact lifecycle in Dashboard",
    "planningType": "new-feature",
    "tags": ["planner", "dashboard"]
  },
  "goals": ["Operators complete draft→accept→finalize in Dashboard"],
  "nonGoals": ["Replace build-plan in v1"],
  "userStories": [
    { "id": "US-1", "asA": "maintainer", "iWant": "see WBS preview", "soThat": "I can accept with confidence", "priority": "must" }
  ],
  "valueAssessment": { "impact": "High — closes PLANNER Gap 7", "confidence": "medium", "rationale": "Depends on kit commands" },
  "riskAssessment": [{ "id": "R1", "description": "Dual UX with build-plan wizard", "severity": "medium", "mitigation": "A-COMPAT copy" }],
  "technicalImpact": {
    "systemsTouched": ["extensions/cursor-workflow-cannon", "task-engine/dashboard-summary"],
    "compatibilityNotes": "planningSession remains for interview resume"
  },
  "architecture": {
    "overview": "Dashboard calls wk run; plan summary on dashboard-summary",
    "decisions": [{ "id": "D1", "decision": "No extension-side SQLite", "rationale": "PLANNER_ARCHITECTURE §6" }]
  },
  "uiUxDirection": { "hasUiChanges": true, "summary": "Plan panel per A-UX mockups", "mockupRefs": ["docs/maintainers/planner-ux/plan-lifecycle-v1.png"] },
  "testingStrategy": { "layers": ["unit", "extension"], "criticalPaths": ["accept disabled until review pass"] },
  "implementationGuidance": ["Extend dashboard-summary before webview panels"],
  "whatNotToDo": ["Do not embed review rubric in TypeScript strings only"],
  "assumptions": ["A-UX approved before T-7.1"],
  "openQuestions": ["Use strict accept on warnings?"],
  "wbs": [
    { "wbsId": "WBS-1", "path": "1", "title": "Kit contract", "goalMapping": ["Operators complete draft→accept→finalize in Dashboard"], "suggestedTaskTitle": "dashboard-summary planArtifact contract", "approach": "Extend projection", "technicalScope": ["dashboard-summary-projection.ts"], "acceptanceCriteria": ["Schema validates"], "testingVerification": ["kit unit tests"], "dependsOn": [], "sizingConfidence": "medium", "doneMeans": "T-7.1 complete", "generatedTaskPayload": { "title": "dashboard-summary planArtifact contract", "approach": "Extend projection", "technicalScope": ["dashboard-summary-projection.ts"], "acceptanceCriteria": ["Schema validates"] } },
    { "wbsId": "WBS-2", "path": "2", "title": "Plan draft panel", "goalMapping": ["Operators complete draft→accept→finalize in Dashboard"], "suggestedTaskTitle": "Dashboard plan draft panel", "approach": "Read-only render", "technicalScope": ["render-dashboard.ts"], "acceptanceCriteria": ["Fixture render test"], "testingVerification": ["extension tests"], "dependsOn": ["WBS-1"], "sizingConfidence": "medium", "doneMeans": "T-7.2 complete", "generatedTaskPayload": { "title": "Dashboard plan draft panel", "approach": "Read-only render", "technicalScope": ["render-dashboard.ts"], "acceptanceCriteria": ["Fixture render test"] } }
  ],
  "phaseRecommendations": [{ "phaseKey": "110", "label": "Phase 110", "rationale": "Planner tranche", "isPrimary": true }],
  "provenance": {
    "createdAt": "2026-05-27T05:00:00.000Z",
    "updatedAt": "2026-05-27T06:30:00.000Z",
    "createdBy": "NJLaPrell@gmail.com",
    "source": "draft-plan-artifact"
  }
}
```

### 7.3 Accepted plan (approvalRecord fragment)

```json
{
  "approvalRecord": {
    "schemaVersion": 1,
    "confirmed": true,
    "approvedVersion": 3,
    "approvedAt": "2026-05-27T07:00:00.000Z",
    "approvedBy": "NJLaPrell@gmail.com",
    "planRef": "plan-artifact:7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "reviewSummary": "0 blockers, 1 warning (open question deferred)",
    "openQuestionsAccepted": ["Use strict accept on warnings?"]
  },
  "status": "accepted"
}
```

---

## 8. Validation rules (implementation checklist)

| Rule | Enforced by |
| --- | --- |
| `schemaVersion === 1` | JSON Schema |
| `wbs.length >= 1` for finalize | `review-plan-artifact`, `finalize-plan-to-phase` |
| Each WBS `generatedTaskPayload` has non-empty scope + AC | `review-plan-artifact` + `review-planning-execution-drafts` |
| `approvalRecord.approvedVersion === version` on accept | `accept-plan-artifact` |
| No finalize when `status !== accepted` | `finalize-plan-to-phase` |
| Profile-specific sections present | `review-plan-artifact` (A-RUBRIC) |

---

## 9. Open questions (for A-SCHEMA review)

1. Allow `wbs` with **zero** rows for `draft` only, but block accept? **Recommendation:** yes.
2. Store `sourceAnswers` inside `provenance` for audit? **Recommendation:** optional, dashboard-redacted.
3. Embed binary mockups in plan JSON? **Recommendation:** no — refs only (§2.9).

---

## 10. References

| Resource | Purpose |
| --- | --- |
| [`schemas/ideas/states/`](./schemas/ideas/states/) | Unified IdeaPlan per-state schemas and `agentDirective` |
| [`.ai/playbooks/brainstorm-session.md`](./.ai/playbooks/brainstorm-session.md) | Human companion for brainstorming |
| [`.ai/playbooks/planner-chat.md`](./.ai/playbooks/planner-chat.md) | Human companion for planning chat |
| [`PLANNER_ARCHITECTURE.md`](./PLANNER_ARCHITECTURE.md) | Storage, commands |
| [`PLANNER_TASKS.md`](./PLANNER_TASKS.md) | WBS T-1.1–T-1.3 |
| `src/modules/planning/artifact.ts` | Legacy wishlist artifact |
| `src/modules/task-engine/instructions/persist-planning-execution-drafts.md` | Task row shape |
