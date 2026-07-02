# ADR: Unified IdeaPlan document storage (v1)

## Status

Accepted — Phase 140 (**`T100777`**). TypeScript contracts: **`src/modules/ideas/idea-plan-types.ts`**. State JSON Schemas follow in **`T100778`**+.

## Context

Phase 140 introduces a **unified IdeaPlan document** that traces one idea from capture through brainstorming, structured planning, review, acceptance, and delivery. Operators and agents need:

- one durable artifact instead of parallel session/plan/review entities that can drift;
- a **six-state machine** (`idea` → `brainstorming` → `planning` → `reviewed` → `accepted` → `delivered`) with machine-readable per-state `agentDirective` sections;
- storage that reuses existing planning infrastructure and does not expand kit SQLite schema for every new document section.

The ideas module already stores lightweight rows in **`workflow_ideas`** with an optional **`linked_plan_artifact`** pointer (`plan-artifact:<planId>`). PlanArtifact v1 already persists versioned JSON under **`.workspace-kit/planning/plan-artifacts/{planId}/artifact.v{version}.json`** with a planning SQLite index row (**`ADR` context:** `src/core/planning/plan-artifact-storage.ts`).

## Decision — file-based artifact, no new SQLite column

| Aspect | Choice |
| --- | --- |
| **Canonical body** | Versioned JSON files at **`.workspace-kit/planning/plan-artifacts/<uuid>/artifact.vN.json`** using the existing PlanArtifact directory convention. |
| **Idea row linkage** | Reuse **`workflow_ideas.linked_plan_artifact`** (`linkedPlanArtifact` in TypeScript) storing **`plan-artifact:<uuid>`**. |
| **SQLite schema** | **No new column** for IdeaPlan sections, brainstorm sessions, or status. Progressive sections live in the artifact file envelope only. |
| **Fast reads** | Continue using the existing planning module-state index (`planning-plan-artifact:{planId}`) for dashboard summaries; full WBS and IdeaPlan sections load from the JSON file. |
| **Status authority** | Document **`status`** field inside the artifact envelope (`IdeaPlanStatus`) is authoritative for the unified lifecycle; ideas row **`status`** (`open` \| `planning` \| `planned`) remains the lightweight capture/planning hint until later integration tasks align the two surfaces. |

The unified IdeaPlan document is therefore a **typed envelope** (see **`IdeaPlanDocument`**) persisted through the **same file-based artifact pattern** as PlanArtifact v1, not a separate BLOB column or new `workflow_ideas` field.

## Decision — why not a new SQLite column

1. **Compatibility** — Reuses immutability rules, version bumps, draft/review/accept commands, and dashboard index paths already proven in Phase 139 planning work.
2. **Progressive sections** — Brainstorm sessions, plan WBS, review records, and delivery metadata grow large and evolve independently; file versioning handles append/replace without migrations per section.
3. **Agent contract** — Per-state **`agentDirective`** blocks are authored as JSON Schema files under **`schemas/ideas/states/`** (WBS-1B+) and embedded or referenced from the artifact; SQLite is a poor fit for schema-sized directive payloads.
4. **Determinism** — Artifact files are the same merge/export surface operators already treat as planning truth; avoiding duplicate SQLite mirrors reduces drift risk called out in idea-planning lifecycle work.

## Decision — six-state machine (type-level v1)

Normative TypeScript (transitions enforced in command layer in later tasks):

| State | Meaning | Valid forward transitions |
| --- | --- | --- |
| `idea` | Captured idea; unified document slot may exist but brainstorming has not started | → `brainstorming` |
| `brainstorming` | Guided scoring / clarification sessions in progress | → `planning` (same-state updates allowed for in-place session mutation) |
| `planning` | Structured plan sections being authored | → `reviewed` |
| `reviewed` | Rubric review recorded | → `accepted`, or → `planning` for revision |
| `accepted` | Operator approved the reviewed plan | → `delivered` |
| `delivered` | Execution handoff complete (tasks/materialization) | terminal (self only) |

Implementation: **`IDEA_PLAN_STATUS_TRANSITIONS`** and **`isIdeaPlanStatusTransitionAllowed`** in **`src/modules/ideas/idea-plan-types.ts`**.

## Consequences

- **`T100778`**+ can add JSON Schemas and fixtures without a SQLite migration.
- Commands that create or advance IdeaPlan documents should persist through existing plan-artifact storage helpers and set **`linked_plan_artifact`** on the source idea when the document is promoted to the canonical plan for that idea.
- Dashboard and lifecycle derivations may eventually map between legacy **`deriveIdeaPlanningLifecycleState`** signals and **`IdeaPlanStatus`**; that mapping is explicitly out of scope for this ADR.

## References

- **`src/modules/ideas/idea-plan-types.ts`** — `IdeaPlanStatus`, `IdeaPlanDocument`, `AgentDirective`, `BrainstormSession`
- **`src/core/planning/plan-artifact-storage.ts`** — on-disk layout and index pointer
- **`src/modules/ideas/idea-store.ts`** — `linkedPlanArtifact` column
- **`schemas/planning/plan-artifact.v1.schema.json`** — PlanArtifact v1 envelope (IdeaPlan envelope is a parallel document shape in the ideas module)
