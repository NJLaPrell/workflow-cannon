<!--
agentCapsule|v=1|command=finalize-plan-to-phase|module=planning|schema_only=pnpm exec wk run finalize-plan-to-phase --schema-only '{}'
-->

# finalize-plan-to-phase

Materialize an **accepted** PlanArtifact v1 WBS into task-engine execution rows for a target phase. Preview with `dryRun: true` (default); persist with `dryRun: false` via **`persist-planning-execution-drafts`**.

**Contract:** repo-root **`PLANNER_COMMANDS.md`** §5 · **Schema:** **`PLANNER_SCHEMA.md`** §2.15–2.16 · **Agent runbook:** **`.ai/runbooks/plan-artifact-workflow.md`**

**Handler status:** dry-run preview ships in **WP-6.4** (T100471); persist path ships in **WP-6.5** (T100472+).

## Usage

```bash
# Preview normalized task drafts + batch review (Tier C — default dryRun)
pnpm exec wk run finalize-plan-to-phase '{"planId":"550e8400-e29b-41d4-a716-446655440000","dryRun":true}'

# Preview subset of WBS rows
pnpm exec wk run finalize-plan-to-phase '{"planId":"550e8400-e29b-41d4-a716-446655440000","dryRun":true,"wbsFilter":["WBS-1","WBS-2"]}'

# Persist tasks into phase 110 (Tier B — policyApproval + planning generation when policy require)
pnpm exec wk run finalize-plan-to-phase '{"planId":"550e8400-e29b-41d4-a716-446655440000","dryRun":false,"targetPhaseKey":"110","targetPhase":"Phase 110","desiredStatus":"ready","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"materialize accepted plan WBS to phase 110"}}'

# Idempotent persist retry
pnpm exec wk run finalize-plan-to-phase '{"planId":"550e8400-e29b-41d4-a716-446655440000","dryRun":false,"targetPhaseKey":"110","desiredStatus":"ready","clientMutationId":"finalize-550e8400-20260527","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"retry finalize after lost CLI output"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planId` | Yes | Load accepted plan from `.workspace-kit/planning/plan-artifacts/`. |
| `version` | No | Artifact storage version; default latest. Must match `approvalRecord.approvedVersion` on accepted row. |
| `dryRun` | No | Default **`true`** (agent-safe preview). **`false`** writes tasks and updates plan `status: finalized`. |
| `targetPhaseKey` | No | Overrides WBS phase hints; command-level wins. |
| `targetPhase` | No | Label; default `Phase <targetPhaseKey>`. |
| `desiredStatus` | No | `proposed` \| `ready`; default `ready`. |
| `wbsFilter` | No | `wbsId[]` — finalize subset only. |
| `markFinalized` | No | When `dryRun: true`, optional `true` sets plan `status: finalized` without task writes (default `false`). |
| `expectedPlanningGeneration` | When policy `require` | Required when `dryRun: false`. Copy from `list-tasks` / `get-task`. |
| `policyApproval` | When `dryRun: false` | `{ "confirmed": true, "rationale": "…" }` on argv (Tier B). |
| `clientMutationId` | No | Forwarded to `persist-planning-execution-drafts`; per-task `clientMutationId::<taskId>`. |
| `actor` | No | Actor for provenance when persisting. |
| `config` | No | Invocation-local config override. |

## Preconditions (normative)

1. Latest (or requested) artifact row has **`status: accepted`**.
2. **`approvalRecord.confirmed === true`** and **`approvalRecord.approvedVersion`** matches the draft version being materialized (see **PLANNER_COMMANDS.md** §5.3 step 1).
3. Run **`accept-plan-artifact`** before finalize; do not skip acceptance.

## Internal steps (handler)

1. Load plan; assert accepted + approval version pin.
2. For each selected WBS row: `normalizeWbsItemToTaskDraft()` → task row shape.
3. Call **`review-planning-execution-drafts`** (or equivalent) on `tasks[]`.
4. **`dryRun: true`** — return `taskPreview`, embedded `review`, optional `taskGenerationPayloads`; no task writes unless `markFinalized: true`.
5. **`dryRun: false`** — call **`persist-planning-execution-drafts`** with `planRef`, `planningType` from `identity`, provenance; set plan `status: finalized`.

## Response codes (normative)

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-finalize-preview` | true | `dryRun: true`; `data.taskPreview[]`, `data.review`. |
| `plan-artifact-finalize-persisted` | true | Tasks created; `data.createdTasks`, `data.count`. |
| `plan-artifact-finalize-idempotent-replay` | true | Same `clientMutationId` + digest replay. |
| `plan-artifact-not-accepted` | false | Plan not in `accepted` state (includes draft/reviewed). |
| `plan-artifact-finalize-review-failed` | false | Task-batch review blockers. |
| `plan-artifact-not-found` | false | Unknown `planId` / `version`. |
| `plan-artifact-version-mismatch` | false | Requested version not latest or approval pin mismatch. |
| `planning-execution-drafts-persisted` | true | Delegated success from task-engine (alias allowed). |
| `planning-generation-mismatch` | false | Stale `expectedPlanningGeneration` when persisting. |
| `policy-denied` | false | Missing/invalid `policyApproval` when `dryRun: false`. |
| `invalid-run-args` | false | Missing `planId` or malformed argv. |

## Success `data` (preview)

| Field | Description |
| --- | --- |
| `taskPreview` | Normalized `tasks[]` (same shape as `persist-planning-execution-drafts` argv). |
| `taskGenerationPayloads` | Optional denormalized copy for dashboard preview. |
| `phaseKey` | Resolved target phase. |
| `review` | Embedded `review-planning-execution-drafts` outcome. |

## Related

- `accept-plan-artifact` — required acceptance gate before finalize (WP-5)
- `review-planning-execution-drafts` — batch review during finalize preview/persist
- `persist-planning-execution-drafts` — task writes on persist path (task-engine)
- `draft-plan-artifact` / `review-plan-artifact` — earlier lifecycle steps
