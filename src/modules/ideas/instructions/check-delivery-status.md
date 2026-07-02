agentCapsule|v=1|command=check-delivery-status|module=ideas|schema_only=pnpm exec wk run check-delivery-status --schema-only '{}'

# check-delivery-status

Query delivery task refs on a unified IdeaPlan document in **accepted** state. When every referenced task is **completed** or **cancelled** and at least one is **completed**, transitions the document **accepted → delivered**. Otherwise returns a delivery status summary without changing status.

## Required args

- `planRef` — `plan-artifact:<planId>` for the unified IdeaPlan document.

## Optional args

- `ideaId` — when provided, must match the document `ideaId` (validation guard).
- `expectedPlanningGeneration` — required when `tasks.planningGenerationPolicy` is `require`.

## Policy

This command may write the IdeaPlan artifact when all delivery tasks are terminal. Pass JSON `policyApproval` in the command args when transitioning.

```bash
pnpm exec wk run check-delivery-status '{"planRef":"plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60","expectedPlanningGeneration":31,"policyApproval":{"confirmed":true,"rationale":"check delivery and transition when tasks complete"}}'
```

## Response

- `data.deliveryStatus` — `{ total, completed, cancelled, pending, missing }`
- `data.transitioned` — `true` when status advanced to `delivered`
- `data.taskStatuses` — per-ref task engine status when refs are present

## Errors

| Code | When |
|------|------|
| `idea-plan-not-found` | No artifact for `planRef` |
| `idea-plan-status-invalid` | Document status is not `accepted` |
| `idea-plan-mismatch` | Supplied `ideaId` does not match the document |
