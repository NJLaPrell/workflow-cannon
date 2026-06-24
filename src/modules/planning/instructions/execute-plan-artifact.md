<!--
agentCapsule|v=1|command=execute-plan-artifact|module=planning|schema_only=pnpm exec wk run execute-plan-artifact --schema-only '{}'
-->

# execute-plan-artifact

Link a task to an **accepted** or **finalized** PlanArtifact v1 before sensitive execute paths (`run-transition` `start`, `persist-planning-execution-drafts` when policy is active). Records execution linkage on a new plan artifact version and emits a structured evidence bundle on the task.

**Runbook:** **`.ai/runbooks/plan-artifact-workflow.md`**

## Usage

```bash
pnpm exec wk run execute-plan-artifact '{"planId":"550e8400-e29b-41d4-a716-446655440000","taskId":"T450","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"link task to accepted plan before start"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planId` | Yes | Accepted or finalized PlanArtifact id. |
| `taskId` | Yes | Task receiving `metadata.planExecutionEvidence`. |
| `wbsId` | No | Optional WBS row pin for provenance. |
| `expectedPlanningGeneration` | When policy `require` | Copy from `get-task` / `list-tasks`. |
| `policyApproval` | Yes | Tier B mutation approval on argv. |

## Response codes

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-execute-linked` | true | New plan version + task metadata written. |
| `plan-artifact-not-accepted` | false | Plan not accepted/finalized. |
| `task-not-found` | false | Unknown `taskId`. |
