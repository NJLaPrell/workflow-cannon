<!--
agentCapsule|v=1|command=delete-plan-artifact|module=ideas|schema_only=pnpm exec wk run delete-plan-artifact --schema-only '{}'
-->

# delete-plan-artifact

**Destructive.** Removes PlanArtifact files under `.workspace-kit/planning/plan-artifacts/<planId>/`, deletes the SQLite plan index row, clears the active-draft pointer, and **deletes the linked idea row**.

## Usage

```bash
pnpm exec wk run delete-plan-artifact '{"planRef":"plan-artifact:<uuid>","confirmDelete":true,"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"remove test plan and idea"}}'
```

## Arguments

| Field | Required | Notes |
| --- | --- | --- |
| `planRef` / `planId` | one required | Target plan |
| `confirmDelete` | **yes** (`true`) | Fail-closed without this flag |
| `ideaId` | no | Must match document when both present |
| `expectedPlanningGeneration` | when policy `require` | |
| `policyApproval` | yes | Tier B JSON approval |

## Response

- `plan-artifact-deleted` — includes `deletedPlanFiles`, `deletedIndex`, `deletedIdea`

## Related

- `cancel-plan-artifact` — soft-archive without deleting
- `delete-idea` — idea row only (does not remove plan files)
