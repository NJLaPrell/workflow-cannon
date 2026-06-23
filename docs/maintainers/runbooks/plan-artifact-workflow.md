<!-- GENERATED FROM .ai/runbooks/plan-artifact-workflow.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# PlanArtifact workflow runbook

Machine operator guide for **PlanArtifact v1** — brainstorm → draft → review → accept → finalize → execution tasks.

**Related (legacy interview path):** [`.ai/runbooks/planning-workflow.md`](./planning-workflow.md) (`build-plan`, Ideas).  
**CAE planning lenses:** [`.ai/cae/planning-lenses/README.md`](../cae/planning-lenses/README.md) (advisory; deterministic review is code, not shadow CAE alone).

## Intent

- **PlanArtifact v1** is the durable design intent + WBS source of truth (not the task store).
- **Task engine** owns execution rows (`T###`); materialize only through **`finalize-plan-to-phase`** → **`persist-planning-execution-drafts`**.
- **CAE** surfaces planning lenses on plan commands when `kit.cae.enabled` and shadow preflight run (`planningSession` on `data.cae`).

## Implementation status (read before mutating)

| Surface | Status |
| --- | --- |
| Types, schema, storage, render, WBS normalize | **Shipped** (`src/core/planning/`, `schemas/planning/`, `fixtures/planning/`) |
| CAE lenses + activations + session scope hook | **Shipped** (`.ai/cae/planning-lenses/`, `activations.v1.json`, `planning-session-scope.ts`) |
| `draft-plan-artifact` / `review-plan-artifact` / `accept-plan-artifact` / `finalize-plan-to-phase` CLI handlers | **Contract only** until WP-3+ lands — argv/response codes in repo-root **`PLANNER_COMMANDS.md`** (A-CONTRACTS). Confirm with **`pnpm exec wk run --list-commands`** before assuming a handler exists. |

Human-reviewed contracts (repo root, not `docs/`): **`PLANNER_COMMANDS.md`**, **`PLANNER_SCHEMA.md`**, **`PLANNER_REVIEW_RUBRIC.md`**, **`PLANNER_ARCHITECTURE.md`**.

## Golden path (agent ladder)

1. **Brainstorm** in chat (no kit mutation required).
2. **Validate shape** (when command exists): `draft-plan-artifact` with `persist: false` (Tier C).
3. **Persist draft** (Tier B): `draft-plan-artifact` with `persist: true`, `policyApproval`, `expectedPlanningGeneration` when policy `require`.
4. **Review** (Tier C): `review-plan-artifact` — blockers vs warnings per rubric; fix artifact or WBS.
5. **Accept** (Tier B): `accept-plan-artifact` with `approvalRecord` + `policyApproval`.
6. **Finalize preview** (Tier C): `finalize-plan-to-phase` with `dryRun: true`.
7. **Finalize persist** (Tier B): `finalize-plan-to-phase` with `dryRun: false` — delegates task writes to **`persist-planning-execution-drafts`** only.

```bash
# 0) Read generation when policy require
pnpm exec wk run list-tasks '{"status":"ready","limit":1}'
# → data.planningGeneration

# 1) Validate-only draft (Tier C when handler exists)
pnpm exec wk run draft-plan-artifact '{"persist":false,"artifact":{...}}'

# 2) Persist draft (Tier B)
pnpm exec wk run draft-plan-artifact '{"persist":true,"artifact":{...},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"persist plan after brainstorm"}}'

# 3) Review (Tier C)
pnpm exec wk run review-plan-artifact '{"planId":"<uuid>","profile":"full-feature"}'

# 4) Accept (Tier B)
pnpm exec wk run accept-plan-artifact '{"planId":"<uuid>","approvalRecord":{"schemaVersion":1,"confirmed":true,"approvedVersion":1,"approvedAt":"2026-05-27T00:00:00.000Z","approvedBy":"operator@example.com","planRef":"plan-artifact:<uuid>"},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"operator accepted plan"}}'

# 5) Finalize preview then persist
pnpm exec wk run finalize-plan-to-phase '{"planId":"<uuid>","dryRun":true}'
pnpm exec wk run finalize-plan-to-phase '{"planId":"<uuid>","dryRun":false,"targetPhaseKey":"110","targetPhase":"Phase 110","desiredStatus":"ready","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"materialize WBS to phase 110"}}'
```

Use **`pnpm exec wk run <command> --schema-only '{}'`** for argv JSON Schema when the command is registered.

## Storage layout (shipped)

- **Files:** `.workspace-kit/planning/plan-artifacts/{planId}/artifact.v{version}.json`
- **Index:** SQLite module state `planning-plan-artifact:{planId}` (latest version, `planRef`, status)
- **Core API:** `src/core/planning/plan-artifact-storage.ts` — do not duplicate paths in agents/scripts.

## Fixtures (copy shape, do not hand-edit as SoT)

- `fixtures/planning/plan-artifact-minimal.valid.v1.json`
- `fixtures/planning/plan-artifact-full-feature.valid.v1.json`
- Golden markdown: `fixtures/planning/*.rendered.md`

## CAE during planning sessions

When shadow preflight is on (`kit.cae.runtime.shadowPreflight` or `WORKSPACE_KIT_CAE_SHADOW=1`), plan commands attach **`data.cae.planningSession: true`** and think-bundle planning lenses (`cae.reasoning.planning-*`). Inspect:

```bash
pnpm exec wk run cae-evaluate '{"schemaVersion":1,"evaluationContext":{"schemaVersion":1,"task":{"taskId":"T000","status":"ready","phaseKey":"110"},"command":{"name":"draft-plan-artifact","moduleId":"planning"},"workspace":{"currentKitPhase":"110"},"governance":{"policyApprovalRequired":false,"approvalTierHint":"C"},"queue":{"readyQueueDepth":0}},"evalMode":"live"}'
```

Integration proof: `test/planning-session-cae-scope.test.mjs`.

## Task-engine commands (reuse)

| Command | When |
| --- | --- |
| `review-planning-execution-drafts` | Preflight normalized task rows before finalize persist |
| `persist-planning-execution-drafts` | **Only** writer for execution tasks from an accepted plan |

See **`.ai/AGENT-CLI-MAP.extended.md`** → planning / Ideas ladder for copy-paste.

## Policy tiers (summary)

| Command | Tier | Notes |
| --- | --- | --- |
| `draft-plan-artifact` | C if `persist: false`; **B** if `persist: true` | |
| `review-plan-artifact` | C | `recordReview: true` → **B** |
| `accept-plan-artifact` | **B** | |
| `finalize-plan-to-phase` | C if `dryRun: true`; **B** if `dryRun: false` | Prefer dry-run first |

JSON **`policyApproval`** on argv for Tier B — not chat-only ([`.ai/POLICY-APPROVAL.md`](../POLICY-APPROVAL.md)).

## Failure codes (quick)

| Code | Fix |
| --- | --- |
| `invalid-run-args` | `wk run <cmd> --schema-only '{}'` |
| `planning-generation-mismatch` | Re-read `planningGeneration`, retry |
| `policy-denied` | Add `policyApproval` on argv |
| `plan-artifact-schema-invalid` | Fix artifact vs `PLANNER_SCHEMA.md` / JSON Schema |
| `plan-artifact-not-accepted` | Run accept before finalize |
| `plan-artifact-accept-blocked` | Clear review blockers or defer OQs explicitly |

Full index: repo-root **`PLANNER_COMMANDS.md`** §8.

## Compatibility

- **`build-plan`** interview path remains valid; bridge via `importSource: import-build-plan` when drafting (handler era).
- Dashboard **`planningSession`** is interview state only — not a PlanArtifact. Promote through **`draft-plan-artifact`** when WP-3+ is live.

## Do not

- Hand-edit plan JSON under `.workspace-kit/planning/plan-artifacts/` for routine workflow (use commands).
- Treat CAE shadow output as review blockers — use **`review-plan-artifact`** findings.
- Create execution tasks without **`finalize-plan-to-phase`** + **`persist-planning-execution-drafts`** provenance.
