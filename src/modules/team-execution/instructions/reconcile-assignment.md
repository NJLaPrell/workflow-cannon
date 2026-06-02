<!--
agentCapsule|v=1|command=reconcile-assignment|module=team-execution|schema_only=pnpm exec wk run reconcile-assignment --schema-only '{}'
-->

# reconcile-assignment

```bash
workspace-kit run reconcile-assignment '{"assignmentId":"<id>","supervisorId":"alice","checkpoint":{"schemaVersion":1,"mergedSummary":"Accepted worker summary + edits"},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"reconcile"}}'
```

Supervisor path: **`submitted` → `reconciled`**.

**`checkpoint`** compatibility:
- v1 (legacy/current): `schemaVersion` **1** with non-empty **`mergedSummary`**.
- When omitted, reconcile derives `mergedSummary` from submitted handoff summary if the stored handoff is valid.

Handoff v2 consumption: reconcile reads submitted handoff v2 fields (status, evidence refs, blockers, risks, commands, next action) to persist and emit reconciliation hints for supervisor decision support.

Admin override: if caller actor id is listed in **`orchestration.adminIds`** or **`teamExecution.adminIds`**, supervisor lifecycle authority is accepted.

Stable lifecycle errors: **`assignment-not-found`**, **`assignment-authority-denied`**, **`assignment-status-invalid`**.
