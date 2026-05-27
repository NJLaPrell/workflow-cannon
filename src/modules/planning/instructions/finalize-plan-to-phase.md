<!--
agentCapsule|v=1|command=finalize-plan-to-phase|module=planning|schema_only=pnpm exec wk run finalize-plan-to-phase --schema-only '{}'
-->

# finalize-plan-to-phase

Preview or persist accepted **PlanArtifact v1** WBS rows as task-engine rows for a target phase.

**Contract:** repo-root **`PLANNER_COMMANDS.md`** §5 · **Schema:** **`PLANNER_SCHEMA.md`** · **Agent runbook:** **`.ai/runbooks/plan-artifact-workflow.md`**

**Handler status:** command contract and schema-only discovery ship first. Preview and persist behavior land in the dependent Phase 110 tasks.

## Usage

```bash
# Preview normalized task rows (Tier C)
pnpm exec wk run finalize-plan-to-phase '{"planId":"<uuid>","dryRun":true}'

# Persist task rows into a phase (Tier B)
pnpm exec wk run finalize-plan-to-phase '{"planId":"<uuid>","dryRun":false,"targetPhaseKey":"110","targetPhase":"Phase 110","desiredStatus":"ready","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"materialize accepted plan WBS to phase 110"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planId` | Yes* | Load stored artifact from `.workspace-kit/planning/plan-artifacts/`. |
| `version` | No | Default latest stored version. |
| `artifact` | Yes* | Inline PlanArtifact v1 for preview (*one of `planId` or `artifact`*). |
| `dryRun` | No | Default `true`. `true` previews normalized rows and review results; `false` persists tasks. |
| `targetPhaseKey` | When `dryRun:false` | Phase key assigned to persisted tasks. |
| `targetPhase` | No | Human phase label; defaults from `targetPhaseKey` when omitted. |
| `desiredStatus` | No | Initial persisted status, normally `ready`; preview may show proposed rows. |
| `selectedWbsIds` | No | Optional WBS id subset; default is all materializable WBS rows. |
| `expectedPlanningGeneration` | When policy `require` and `dryRun:false` | Optimistic concurrency token for task-store writes. |
| `policyApproval` | When `dryRun:false` | `{ "confirmed": true, "rationale": "..." }` on argv. |
| `clientMutationId` | No | Idempotent replay key for persist. |
| `actor` | No | Mutation actor override. |
| `config` | No | Invocation-local config override. |

## Response codes (normative)

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-finalize-preview` | true | Preview produced normalized task drafts and review output; no writes. |
| `plan-artifact-finalize-persisted` | true | Task rows were persisted to the target phase. |
| `plan-artifact-finalize-idempotent-replay` | true | Same `clientMutationId` replayed a matching persist result. |
| `invalid-run-args` | false | Missing `planId` / `artifact`, invalid target phase, or invalid selected WBS ids. |
| `plan-artifact-not-found` | false | Unknown `planId` / `version`. |
| `plan-artifact-not-accepted` | false | Persist requested before operator acceptance. |
| `plan-artifact-finalize-review-failed` | false | Normalized task rows fail task review or acceptance checks. |
| `planning-generation-mismatch` | false | Stale `expectedPlanningGeneration` on persist. |
| `policy-denied` | false | Missing/invalid `policyApproval` on persist. |

## Related

- `draft-plan-artifact` — validate/persist draft (WP-3)
- `review-plan-artifact` — deterministic rubric review (WP-4)
- `accept-plan-artifact` — operator acceptance gate (WP-5)
- `persist-planning-execution-drafts` — lower-level task draft persistence path