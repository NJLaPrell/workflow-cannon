<!--
agentCapsule|v=1|command=cancel-plan-artifact|module=ideas|schema_only=pnpm exec wk run cancel-plan-artifact --schema-only '{}'
-->

# cancel-plan-artifact

Soft-cancel a unified IdeaPlan **or classic PlanArtifact**. Transitions active status → **`cancelled`**, keeps artifact files, and (for IdeaPlans) records `cancellation.previousStatus` so Brainstorm/Plan can revive the same document. Classic plans land in the Cancelled rollup and can be Deleted; revive requires a linked idea.

## Usage

```bash
pnpm exec wk run cancel-plan-artifact '{"planRef":"plan-artifact:<uuid>","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"cancel unused plan"}}'
```

## Arguments

| Field | Required | Notes |
| --- | --- | --- |
| `planRef` / `planId` | one required | `plan-artifact:<uuid>` or bare uuid |
| `ideaId` | no | When set, must match document `ideaId` |
| `rationale` | no | Stored on `cancellation.rationale` |
| `cancelledBy` | no | Defaults to `dashboard-operator` |
| `expectedPlanningGeneration` | when policy `require` | |
| `policyApproval` | yes | Tier B JSON approval |

## Response

- `plan-artifact-cancelled` — new version written with `status: cancelled`
- `plan-artifact-already-cancelled` — idempotent no-op

## Related

- `delete-plan-artifact` — hard delete plan files + idea row
- `start-brainstorm-session` — revive cancelled → brainstorming
- `start-idea-planning` — revive cancelled → planning (via linked plan)
